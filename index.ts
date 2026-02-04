import type { PluginModule, PluginLogger } from 'napcat-types/napcat-onebot/network/plugin-manger';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

let logger: PluginLogger | null = null;

interface CleanOptions {
  enableVideo: boolean;
  enableVideoThumb: boolean;
  enablePtt: boolean;
  enablePic: boolean;
  enableFile: boolean;
  enableLog: boolean;
  enableLogCache: boolean;
  enableNtTemp: boolean;
  enableNapCatData: boolean;
  enableNapCatTemp: boolean;
  retainDays: number;
}

interface ScheduleTask {
  id: string;
  name: string;
  accounts: string[]; // QQ号列表，空数组表示所有
  options: CleanOptions;
  cronHour: number; // 每天几点执行 (0-23)
  cronMinute: number; // 分钟 (0-59)
  frequency?: 'daily' | 'weekly' | 'interval';
  frequencyValue?: number; // 0-6 for weekly, N days for interval
  enabled: boolean;
  lastRun?: string;
  lastResult?: string;
}

interface CleanerPluginConfig {
  defaultOptions: CleanOptions;
  scheduleTasks: ScheduleTask[];
}

const defaultCleanOptions: CleanOptions = {
  enableVideo: true,
  enableVideoThumb: true,
  enablePtt: true,
  enablePic: true,
  enableFile: true,
  enableLog: true,
  enableLogCache: true,
  enableNtTemp: true,
  enableNapCatData: false,
  enableNapCatTemp: true,
  retainDays: 7,
};

let currentConfig: CleanerPluginConfig = {
  defaultOptions: { ...defaultCleanOptions },
  scheduleTasks: [],
};

// 定时器存储
const scheduleTimers: Map<string, NodeJS.Timeout> = new Map();
let dataPathGlobal: string = '';

// 平台检测
const isWindows = os.platform() === 'win32';

// 存储当前账号的 uid (用于 Linux hash 计算)
let currentUid: string = '';

// 计算 Linux 路径的 hash: md5(md5(uid) + "nt_kernel")
function computeNtHash(uid: string): string {
  const md5Uid = crypto.createHash('md5').update(uid).digest('hex');
  const hash = crypto.createHash('md5').update(md5Uid + 'nt_kernel').digest('hex');
  return hash;
}

// 存储 uin 到 uid 的映射 (用于多账号场景)
const uinToUidMap: Map<string, string> = new Map();

// 存储 uin 到 hash 目录的映射
const uinToHashDirMap: Map<string, string> = new Map();

// 清理统计
interface CleanStats {
  totalFiles: number;
  totalSize: number;
  categories: {
    [key: string]: {
      files: number;
      size: number;
    };
  };
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 清理目录中的文件
function cleanDirectory(dirPath: string, retainDays: number): { files: number; size: number; } {
  let files = 0;
  let size = 0;

  if (!fs.existsSync(dirPath)) {
    return { files, size };
  }

  const now = Date.now();
  const retainMs = retainDays * 24 * 60 * 60 * 1000;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          // 检查文件是否超过保留时间
          if (now - stat.mtimeMs > retainMs) {
            size += stat.size;
            fs.unlinkSync(fullPath);
            files++;
          }
        } catch (e) {
          logger?.warn(`无法删除文件: ${fullPath}`, e);
        }
      } else if (entry.isDirectory()) {
        const subStats = cleanDirectory(fullPath, retainDays);
        files += subStats.files;
        size += subStats.size;
        // 尝试删除空目录
        try {
          const remaining = fs.readdirSync(fullPath);
          if (remaining.length === 0) {
            fs.rmdirSync(fullPath);
          }
        } catch {
          // 忽略
        }
      }
    }
  } catch (e) {
    logger?.warn(`无法读取目录: ${dirPath}`, e);
  }

  return { files, size };
}

// 获取时间格式的子目录 (如 2025-05, 2026-01)
function getDateSubdirs(basePath: string): string[] {
  if (!fs.existsSync(basePath)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map(e => path.join(basePath, e.name));
  } catch {
    return [];
  }
}

// 获取用户数据目录的 nt_data 路径
function getNtDataPath(dataPath: string, uin: string): string | null {
  if (isWindows) {
    // Windows: {dataPath}/{uin}/nt_qq/nt_data
    const ntDataPath = path.join(dataPath, uin, 'nt_qq', 'nt_data');
    if (fs.existsSync(ntDataPath)) {
      return ntDataPath;
    }
    return null;
  } else {
    // Linux: dataPath 已经是 /app/.config/QQ，直接拼接 nt_qq_{hash}
    // 首先检查是否有缓存的映射
    const cachedHashDir = uinToHashDirMap.get(uin);
    if (cachedHashDir) {
      const ntDataPath = path.join(cachedHashDir, 'nt_data');
      if (fs.existsSync(ntDataPath)) {
        return ntDataPath;
      }
    }

    // 尝试通过 uid 计算 hash
    const uid = uinToUidMap.get(uin);
    if (uid) {
      const hash = computeNtHash(uid);
      const hashDir = path.join(dataPath, `nt_qq_${hash}`);
      const ntDataPath = path.join(hashDir, 'nt_data');
      if (fs.existsSync(ntDataPath)) {
        uinToHashDirMap.set(uin, hashDir);
        return ntDataPath;
      }
    }

    // 如果没有找到，扫描所有 nt_qq_* 目录
    if (fs.existsSync(dataPath)) {
      try {
        const entries = fs.readdirSync(dataPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && /^nt_qq_[a-f0-9]{32}$/.test(entry.name)) {
            const hashDir = path.join(dataPath, entry.name);
            const ntDataPath = path.join(hashDir, 'nt_data');
            if (fs.existsSync(ntDataPath)) {
              // 缓存找到的第一个目录（单账号场景）
              if (!uinToHashDirMap.has(uin)) {
                uinToHashDirMap.set(uin, hashDir);
              }
              return ntDataPath;
            }
          }
        }
      } catch {
        // 忽略
      }
    }

    return null;
  }
}

// 获取用户的 nt_temp 路径
function getNtTempPath(dataPath: string, uin: string): string | null {
  if (isWindows) {
    return null; // Windows 没有 nt_temp
  }

  const cachedHashDir = uinToHashDirMap.get(uin);
  if (cachedHashDir) {
    const ntTempPath = path.join(cachedHashDir, 'nt_temp');
    if (fs.existsSync(ntTempPath)) {
      return ntTempPath;
    }
  }
  return null;
}

// 获取 NapCat 目录路径
function getNapCatPath(dataPath: string): string {
  if (isWindows) {
    return path.join(dataPath, 'NapCat');
  } else {
    return path.join(dataPath, 'NapCat');
  }
}

// 获取所有需要清理的目录
function getCleanablePaths(dataPath: string, uin: string): {
  video: string[];
  videoThumb: string[];
  ptt: string[];
  pic: string[];
  file: string[];
  log: string[];
  logCache: string[];
  ntTemp: string[];
  napCatData: string[];
  napCatTemp: string[];
} {
  const ntDataPath = getNtDataPath(dataPath, uin);

  const result = {
    video: [] as string[],
    videoThumb: [] as string[],
    ptt: [] as string[],
    pic: [] as string[],
    file: [] as string[],
    log: [] as string[],
    logCache: [] as string[],
    ntTemp: [] as string[],
    napCatData: [] as string[],
    napCatTemp: [] as string[],
  };

  if (!ntDataPath) {
    return result;
  }

  // 视频目录
  const videoBase = path.join(ntDataPath, 'Video');
  const videoDirs = getDateSubdirs(videoBase);
  result.video = videoDirs.flatMap(dir => {
    const oriPath = path.join(dir, 'Ori');
    return fs.existsSync(oriPath) ? [oriPath] : [dir];
  });
  result.videoThumb = videoDirs.flatMap(dir => {
    const thumbPath = path.join(dir, 'Thumb');
    const thumbTempPath = path.join(dir, 'ThumbTemp');
    const paths: string[] = [];
    if (fs.existsSync(thumbPath)) paths.push(thumbPath);
    if (fs.existsSync(thumbTempPath)) paths.push(thumbTempPath);
    return paths;
  });

  // 语音目录
  const pttBase = path.join(ntDataPath, 'Ptt');
  const pttDirs = getDateSubdirs(pttBase);
  result.ptt = pttDirs.flatMap(dir => {
    const oriPath = path.join(dir, 'Ori');
    const oriTempPath = path.join(dir, 'OriTemp');
    const paths: string[] = [];
    if (fs.existsSync(oriPath)) paths.push(oriPath);
    if (fs.existsSync(oriTempPath)) paths.push(oriTempPath);
    return paths.length > 0 ? paths : [dir];
  });

  // 图片目录 (Linux 特有，Windows 也兼容检查)
  const picBase = path.join(ntDataPath, 'Pic');
  const picDirs = getDateSubdirs(picBase);
  result.pic = picDirs.flatMap(dir => {
    const oriPath = path.join(dir, 'Ori');
    return fs.existsSync(oriPath) ? [oriPath] : [dir];
  });

  // 文件目录
  const fileOri = path.join(ntDataPath, 'File', 'Ori');
  const fileThumb = path.join(ntDataPath, 'File', 'Thumb');
  const fileThumbTemp = path.join(ntDataPath, 'File', 'ThumbTemp');
  if (fs.existsSync(fileOri)) result.file.push(fileOri);
  if (fs.existsSync(fileThumb)) result.file.push(fileThumb);
  if (fs.existsSync(fileThumbTemp)) result.file.push(fileThumbTemp);

  // 日志目录
  const logPath = path.join(ntDataPath, 'log');
  if (fs.existsSync(logPath)) result.log.push(logPath);

  // 日志缓存目录
  const logCachePath = path.join(ntDataPath, 'log-cache');
  if (fs.existsSync(logCachePath)) result.logCache.push(logCachePath);

  // nt_temp 目录 (Linux)
  const ntTempPath = getNtTempPath(dataPath, uin);
  if (ntTempPath) result.ntTemp.push(ntTempPath);

  // NapCat 目录
  const napCatPath = getNapCatPath(dataPath);
  const napCatDataPath = path.join(napCatPath, 'data');
  const napCatTempPath = path.join(napCatPath, 'temp');
  if (fs.existsSync(napCatDataPath)) result.napCatData.push(napCatDataPath);
  if (fs.existsSync(napCatTempPath)) result.napCatTemp.push(napCatTempPath);

  return result;
}

// 扫描可清理的缓存
function scanCache(dataPath: string, uin: string, retainDays: number = 0): CleanStats {
  const paths = getCleanablePaths(dataPath, uin);
  const stats: CleanStats = {
    totalFiles: 0,
    totalSize: 0,
    categories: {
      video: { files: 0, size: 0 },
      videoThumb: { files: 0, size: 0 },
      ptt: { files: 0, size: 0 },
      pic: { files: 0, size: 0 },
      file: { files: 0, size: 0 },
      log: { files: 0, size: 0 },
      logCache: { files: 0, size: 0 },
      ntTemp: { files: 0, size: 0 },
      napCatData: { files: 0, size: 0 },
      napCatTemp: { files: 0, size: 0 },
    },
  };

  const now = Date.now();
  const retainMs = retainDays * 24 * 60 * 60 * 1000;

  for (const [category, dirs] of Object.entries(paths)) {
    for (const dir of dirs) {
      const dirStats = getDirStatsWithFilter(dir, now, retainMs);
      const cat = stats.categories[category];
      if (cat) {
        cat.files += dirStats.files;
        cat.size += dirStats.size;
      }
      stats.totalFiles += dirStats.files;
      stats.totalSize += dirStats.size;
    }
  }

  return stats;
}

// 获取目录统计，支持时间过滤
function getDirStatsWithFilter(dirPath: string, now: number, retainMs: number): { files: number; size: number; } {
  let files = 0;
  let size = 0;

  if (!fs.existsSync(dirPath)) {
    return { files, size };
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          // 如果 retainMs > 0，则只统计超过保留时间的文件
          if (retainMs <= 0 || (now - stat.mtimeMs > retainMs)) {
            files++;
            size += stat.size;
          }
        } catch {
          // 忽略
        }
      } else if (entry.isDirectory()) {
        const subStats = getDirStatsWithFilter(fullPath, now, retainMs);
        files += subStats.files;
        size += subStats.size;
      }
    }
  } catch {
    // 忽略
  }

  return { files, size };
}

// 执行清理 - 使用 CleanOptions
function executeClean(dataPath: string, uin: string, options: CleanOptions): CleanStats {
  const paths = getCleanablePaths(dataPath, uin);
  const stats: CleanStats = {
    totalFiles: 0,
    totalSize: 0,
    categories: {
      video: { files: 0, size: 0 },
      videoThumb: { files: 0, size: 0 },
      ptt: { files: 0, size: 0 },
      pic: { files: 0, size: 0 },
      file: { files: 0, size: 0 },
      log: { files: 0, size: 0 },
      logCache: { files: 0, size: 0 },
      ntTemp: { files: 0, size: 0 },
      napCatData: { files: 0, size: 0 },
      napCatTemp: { files: 0, size: 0 },
    },
  };

  const categoryEnabled: Record<string, boolean> = {
    video: options.enableVideo,
    videoThumb: options.enableVideoThumb,
    ptt: options.enablePtt,
    pic: options.enablePic,
    file: options.enableFile,
    log: options.enableLog,
    logCache: options.enableLogCache,
    ntTemp: options.enableNtTemp,
    napCatData: options.enableNapCatData,
    napCatTemp: options.enableNapCatTemp,
  };

  for (const [category, dirs] of Object.entries(paths)) {
    if (!categoryEnabled[category]) continue;
    for (const dir of dirs) {
      const cleanResult = cleanDirectory(dir, options.retainDays);
      const cat = stats.categories[category];
      if (cat) {
        cat.files += cleanResult.files;
        cat.size += cleanResult.size;
      }
      stats.totalFiles += cleanResult.files;
      stats.totalSize += cleanResult.size;
    }
  }

  return stats;
}

// 获取 dataPath 下所有 QQ 账号目录
function getAllAccounts(dataPath: string): string[] {
  if (!fs.existsSync(dataPath)) {
    return [];
  }

  if (isWindows) {
    // Windows: 直接查找 QQ号 目录
    try {
      const entries = fs.readdirSync(dataPath, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && /^\d{5,11}$/.test(e.name))
        .map(e => e.name);
    } catch {
      return [];
    }
  } else {
    // Linux: 查找 nt_qq_{hash} 目录，返回已知的 uin
    // 由于 Linux 无法从目录名反推 uin，只能返回当前已知的账号
    const accounts: string[] = [];

    // 从映射中获取已知账号
    uinToHashDirMap.forEach((_, uin) => {
      accounts.push(uin);
    });

    // 如果没有已知账号，尝试扫描并返回当前账号
    if (accounts.length === 0 && currentUid) {
      const hash = computeNtHash(currentUid);
      const qqConfigPath = path.join(dataPath, '.config', 'QQ');
      const hashDir = path.join(qqConfigPath, `nt_qq_${hash}`);
      if (fs.existsSync(hashDir)) {
        // 使用缓存中的 uin
        uinToUidMap.forEach((uid, uin) => {
          if (uid === currentUid) {
            accounts.push(uin);
            uinToHashDirMap.set(uin, hashDir);
          }
        });
      }
    }

    return accounts;
  }
}

// 保存配置
function saveConfig(configPath: string): void {
  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf-8');
  } catch (e) {
    logger?.error('保存配置失败', e);
  }
}

// 清理定时器
function clearScheduleTimer(taskId: string): void {
  const timer = scheduleTimers.get(taskId);
  if (timer) {
    clearInterval(timer);
    scheduleTimers.delete(taskId);
  }
}

// 设置定时任务
function setupScheduleTask(task: ScheduleTask, configPath: string): void {
  clearScheduleTimer(task.id);

  if (!task.enabled) {
    return;
  }

  const now = new Date();
  let nextRun = new Date();

  // 基础时间设置
  nextRun.setHours(task.cronHour, task.cronMinute, 0, 0);

  // 如果基础时间已经过去，先尝试加一天
  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  // 根据频率调整
  const freq = task.frequency || 'daily';

  if (freq === 'weekly') {
    // frequencyValue: 0=Sun, 1=Mon, ..., 6=Sat
    const targetDay = task.frequencyValue ?? 0;
    while (nextRun.getDay() !== targetDay) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
  } else if (freq === 'interval') {
    // frequencyValue: N days
    // 这里简单处理：如果上次运行时间存在，则根据上次运行时间+间隔计算
    // 如果没有上次运行时间，就按默认的"明天"逻辑（上面已经加了一天）
    const intervalDays = task.frequencyValue || 3;
    if (task.lastRun) {
      const lastRunDate = new Date(task.lastRun);
      const potentialNext = new Date(lastRunDate);
      potentialNext.setDate(potentialNext.getDate() + intervalDays);
      potentialNext.setHours(task.cronHour, task.cronMinute, 0, 0);

      if (potentialNext.getTime() > now.getTime()) {
        nextRun = potentialNext;
      } else {
        // 如果按间隔算出来的时间已经过了，就尽快执行（明天）
        // 或者也可以设定为未来的某一个符合间隔的点，这里简单起见，从明天开始重新算间隔
      }
    }
  }

  const msUntilNextRun = nextRun.getTime() - now.getTime();

  logger?.info(`定时任务 [${task.name}] (${freq}) 将在 ${nextRun.toLocaleString()} 执行`);

  // 设置执行器
  const timer = setTimeout(() => {
    runScheduleTask(task, configPath);
    // 任务执行完后重新设置定时（因为 weekly/interval 不是简单的 setInterval 24h）
    // 重新加载最新的 config 以确保状态正确
    const currentTask = currentConfig.scheduleTasks.find(t => t.id === task.id);
    if (currentTask && currentTask.enabled) {
      setupScheduleTask(currentTask, configPath);
    }
  }, msUntilNextRun);

  scheduleTimers.set(task.id, timer);
}

// 执行定时任务
function runScheduleTask(task: ScheduleTask, configPath: string): void {
  logger?.info(`开始执行定时任务: ${task.name}`);

  let accounts = task.accounts;
  if (accounts.length === 0) {
    accounts = getAllAccounts(dataPathGlobal);
  }

  let totalFiles = 0;
  let totalSize = 0;
  const results: string[] = [];

  for (const account of accounts) {
    try {
      const result = executeClean(dataPathGlobal, account, task.options);
      totalFiles += result.totalFiles;
      totalSize += result.totalSize;
      results.push(`${account}: ${result.totalFiles}文件, ${formatSize(result.totalSize)}`);
    } catch (e) {
      logger?.error(`清理账号 ${account} 失败:`, e);
      results.push(`${account}: 失败`);
    }
  }

  // 更新任务状态
  const foundTask = currentConfig.scheduleTasks.find(t => t.id === task.id);
  if (foundTask) {
    foundTask.lastRun = new Date().toISOString();
    foundTask.lastResult = `删除 ${totalFiles} 文件, 释放 ${formatSize(totalSize)}`;
    saveConfig(configPath);
  }

  logger?.info(`定时任务 [${task.name}] 完成: 删除 ${totalFiles} 文件, 释放 ${formatSize(totalSize)}`);
}

// 初始化所有定时任务
function initAllScheduleTasks(configPath: string): void {
  for (const task of currentConfig.scheduleTasks) {
    setupScheduleTask(task, configPath);
  }
}

// 生成唯一ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
  logger = ctx.logger;
  dataPathGlobal = ctx.core.dataPath;
  logger.info('NapCat 缓存清理插件已初始化');
  logger.info(`运行平台: ${isWindows ? 'Windows' : 'Linux'}`);

  // 初始化当前账号的 uid 和 uin 映射 (用于 Linux hash 计算)
  const selfInfo = ctx.core.selfInfo;
  if (selfInfo.uid && selfInfo.uin) {
    currentUid = selfInfo.uid;
    uinToUidMap.set(selfInfo.uin, selfInfo.uid);

    // 计算 hash 并输出调试信息
    const hash = computeNtHash(selfInfo.uid);

    // 预计算并缓存 hash 目录 (Linux)
    if (!isWindows) {
      // Linux: dataPath 已经是 /app/.config/QQ，直接拼接 nt_qq_{hash}
      const hashDir = path.join(dataPathGlobal, `nt_qq_${hash}`);
      logger.info(`预期的 Linux 目录: ${hashDir}`);
      logger.info(`目录是否存在: ${fs.existsSync(hashDir)}`);

      // 列出 dataPath 下的所有目录
      if (fs.existsSync(dataPathGlobal)) {
        try {
          const entries = fs.readdirSync(dataPathGlobal, { withFileTypes: true });
          const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
          logger.info(`dataPath 目录下的文件夹: ${dirs.join(', ')}`);
        } catch (e) {
          logger.warn(`无法读取 dataPath 目录: ${e}`);
        }
      } else {
        logger.warn(`dataPath 目录不存在: ${dataPathGlobal}`);
      }

      if (fs.existsSync(hashDir)) {
        uinToHashDirMap.set(selfInfo.uin, hashDir);
        logger.info(`Linux hash 目录已缓存`);
      } else {
        logger.warn(`Linux hash 目录不存在: ${hashDir}`);
      }
    }
  } else {
    logger.warn(`selfInfo 信息不完整: uid=${selfInfo.uid}, uin=${selfInfo.uin}`);
  }

  // 加载配置
  try {
    if (fs.existsSync(ctx.configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(ctx.configPath, 'utf-8'));
      currentConfig = { ...currentConfig, ...savedConfig };
    }
  } catch (e) {
    logger?.warn('加载配置失败', e);
  }

  // 初始化定时任务
  initAllScheduleTasks(ctx.configPath);

  // 注册静态资源
  ctx.router.static('/static', 'webui');

  // API: 获取所有账号
  ctx.router.get('/accounts', (_req, res) => {
    try {
      const dataPath = ctx.core.dataPath;
      const accounts = getAllAccounts(dataPath);
      const currentUin = ctx.core.selfInfo.uin;

      // 获取每个账号的缓存统计
      const accountStats = accounts.map(uin => {
        const stats = scanCache(dataPath, uin);
        return {
          uin,
          isCurrent: uin === currentUin,
          stats: {
            totalFiles: stats.totalFiles,
            totalSize: formatSize(stats.totalSize),
            totalSizeBytes: stats.totalSize,
          },
        };
      });

      res.json({
        code: 0,
        data: {
          dataPath,
          currentUin,
          accounts: accountStats,
        },
      });
    } catch (e: any) {
      res.status(500).json({ code: -1, message: e.message });
    }
  });

  // API: 获取指定账号的详细缓存统计
  ctx.router.get('/stats/:uin', (req, res) => {
    try {
      const uin = req.params['uin'] ?? '';
      const retainDays = parseInt(req.query['retainDays'] as string) || 0;

      if (!uin) {
        res.status(400).json({ code: -1, message: 'uin参数缺失' });
        return;
      }
      const dataPath = ctx.core.dataPath;
      const stats = scanCache(dataPath, uin, 0); // 总统计
      const estimatedClean = retainDays > 0 ? scanCache(dataPath, uin, retainDays) : null; // 预计清理

      res.json({
        code: 0,
        data: {
          uin,
          stats,
          estimatedClean,
          formattedStats: {
            totalFiles: stats.totalFiles,
            totalSize: formatSize(stats.totalSize),
            estimatedCleanSize: estimatedClean ? formatSize(estimatedClean.totalSize) : '0 B',
            categories: Object.fromEntries(
              Object.entries(stats.categories).map(([k, v]) => [k, {
                files: v.files,
                size: formatSize(v.size),
                sizeBytes: v.size,
                estimatedCleanSize: estimatedClean && estimatedClean.categories[k] ? formatSize(estimatedClean.categories[k].size) : '0 B',
              }])
            ),
          },
        },
      });
    } catch (e: any) {
      res.status(500).json({ code: -1, message: e.message });
    }
  });

  // API: 执行清理（支持多账号）
  ctx.router.post('/clean', (req, res) => {
    try {
      const dataPath = ctx.core.dataPath;
      const body = req.body as {
        accounts?: string[];
        options?: Partial<CleanOptions>;
      };

      let accounts = body.accounts || [ctx.core.selfInfo.uin];
      if (accounts.length === 0) {
        accounts = getAllAccounts(dataPath);
      }

      const options: CleanOptions = { ...currentConfig.defaultOptions, ...(body.options || {}) };

      logger?.info(`开始清理缓存，账号: ${accounts.join(', ')}，保留 ${options.retainDays} 天内的文件`);

      const results: { uin: string; stats: CleanStats; formatted: any; }[] = [];
      let totalFiles = 0;
      let totalSize = 0;

      for (const uin of accounts) {
        const result = executeClean(dataPath, uin, options);
        totalFiles += result.totalFiles;
        totalSize += result.totalSize;
        results.push({
          uin,
          stats: result,
          formatted: {
            totalFiles: result.totalFiles,
            totalSize: formatSize(result.totalSize),
            categories: Object.fromEntries(
              Object.entries(result.categories).map(([k, v]) => [k, {
                files: v.files,
                size: formatSize(v.size),
              }])
            ),
          },
        });
      }

      logger?.info(`清理完成: 删除 ${totalFiles} 个文件，释放 ${formatSize(totalSize)}`);

      res.json({
        code: 0,
        message: `清理完成: 删除 ${totalFiles} 个文件，释放 ${formatSize(totalSize)}`,
        data: {
          totalFiles,
          totalSize: formatSize(totalSize),
          results,
        },
      });
    } catch (e: any) {
      logger?.error('清理失败:', e);
      res.status(500).json({ code: -1, message: e.message });
    }
  });

  // API: 获取配置
  ctx.router.get('/config', (_req, res) => {
    res.json({
      code: 0,
      data: currentConfig,
    });
  });

  // API: 保存默认选项
  ctx.router.post('/config/options', (req, res) => {
    try {
      const options = req.body as Partial<CleanOptions>;
      currentConfig.defaultOptions = { ...currentConfig.defaultOptions, ...options };
      saveConfig(ctx.configPath);
      res.json({ code: 0, message: '默认选项已保存' });
    } catch (e: any) {
      res.status(500).json({ code: -1, message: e.message });
    }
  });

  // API: 获取定时任务列表
  ctx.router.get('/schedules', (_req, res) => {
    res.json({
      code: 0,
      data: currentConfig.scheduleTasks,
    });
  });

  // API: 添加定时任务
  ctx.router.post('/schedules', (req, res) => {
    try {
      const body = req.body as Omit<ScheduleTask, 'id'> & { retainDays?: number; };

      const options = { ...currentConfig.defaultOptions, ...(body.options || {}) };
      // 如果 body 中明确指定了 retainDays，则覆盖 options 中的值
      if (typeof body.retainDays === 'number') {
        options.retainDays = body.retainDays;
      }

      const task: ScheduleTask = {
        id: generateId(),
        name: body.name || '新任务',
        accounts: body.accounts || [],
        options,
        cronHour: body.cronHour ?? 3,
        cronMinute: body.cronMinute ?? 0,
        frequency: body.frequency || 'daily',
        frequencyValue: body.frequencyValue ?? 0,
        enabled: body.enabled ?? true,
      };

      currentConfig.scheduleTasks.push(task);
      saveConfig(ctx.configPath);
      setupScheduleTask(task, ctx.configPath);

      res.json({ code: 0, message: '定时任务已添加', data: task });
    } catch (e: any) {
      res.status(500).json({ code: -1, message: e.message });
    }
  });

  // API: 更新定时任务
  ctx.router.post('/schedules/:id', (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body as Partial<ScheduleTask>;

      const index = currentConfig.scheduleTasks.findIndex(t => t.id === id);
      if (index < 0) {
        res.status(404).json({ code: -1, message: '任务不存在' });
        return;
      }

      const task = currentConfig.scheduleTasks[index];
      if (!task) {
        res.status(404).json({ code: -1, message: '任务不存在' });
        return;
      }
      Object.assign(task, body);
      saveConfig(ctx.configPath);
      setupScheduleTask(task, ctx.configPath);

      res.json({ code: 0, message: '定时任务已更新', data: task });
    } catch (e: any) {
      res.status(500).json({ code: -1, message: e.message });
    }
  });

  // API: 删除定时任务
  ctx.router.delete('/schedules/:id', (req, res) => {
    try {
      const { id } = req.params;
      const index = currentConfig.scheduleTasks.findIndex(t => t.id === id);
      if (index < 0) {
        res.status(404).json({ code: -1, message: '任务不存在' });
        return;
      }

      if (typeof id === 'string') {
        clearScheduleTimer(id);
      }
      currentConfig.scheduleTasks.splice(index, 1);
      saveConfig(ctx.configPath);

      res.json({ code: 0, message: '定时任务已删除' });
    } catch (e: any) {
      res.status(500).json({ code: -1, message: e.message });
    }
  });

  // API: 立即执行定时任务
  ctx.router.post('/schedules/:id/run', (req, res) => {
    try {
      const { id } = req.params;
      const task = currentConfig.scheduleTasks.find(t => t.id === id);
      if (!task) {
        res.status(404).json({ code: -1, message: '任务不存在' });
        return;
      }

      // 同步执行
      let accounts = task.accounts;
      if (accounts.length === 0) {
        accounts = getAllAccounts(dataPathGlobal);
      }

      let totalFiles = 0;
      let totalSize = 0;

      for (const account of accounts) {
        const result = executeClean(dataPathGlobal, account, task.options);
        totalFiles += result.totalFiles;
        totalSize += result.totalSize;
      }

      // 更新任务状态
      task.lastRun = new Date().toISOString();
      task.lastResult = `删除 ${totalFiles} 文件, 释放 ${formatSize(totalSize)}`;
      saveConfig(ctx.configPath);

      res.json({
        code: 0,
        message: `任务执行完成: 删除 ${totalFiles} 文件, 释放 ${formatSize(totalSize)}`,
        data: task,
      });
    } catch (e: any) {
      res.status(500).json({ code: -1, message: e.message });
    }
  });

  // 注册扩展页面
  ctx.router.page({
    path: 'dashboard',
    title: '缓存清理',
    icon: '🧹',
    htmlFile: 'webui/dashboard.html',
    description: '查看和清理 QQ 缓存文件',
  });

  logger.info('WebUI 路由已注册:');
  logger.info('  - API 路由: /api/Plugin/ext/' + ctx.pluginName + '/');
  logger.info('  - 扩展页面: /plugin/' + ctx.pluginName + '/page/dashboard');
};

const plugin_cleanup: PluginModule['plugin_cleanup'] = async () => {
  // 清理所有定时器
  Array.from(scheduleTimers.keys()).forEach(id => {
    clearScheduleTimer(id);
  });
  logger?.info('缓存清理插件已卸载');
};

export { plugin_init, plugin_cleanup };
