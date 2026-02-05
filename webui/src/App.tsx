import { useState, useEffect } from 'react';
import { request } from './utils/api';
import { Account, CleanerConfig, ScheduleTask } from './types';
import { AccountList } from './components/AccountList';
import { StatsTable } from './components/StatsTable';
import { ConfigPanel } from './components/ConfigPanel';
import { ScheduleList } from './components/ScheduleList';
import { CreateTaskModal } from './components/CreateTaskModal';
import { Eraser, BarChart3, Settings, ShieldCheck, RefreshCw, LayoutDashboard, Clock, Save } from 'lucide-react';

function App() {
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [config, setConfig] = useState<CleanerConfig>({
        enableVideo: true,
        enableVideoThumb: true,
        enablePtt: true,
        enablePic: true,
        enableFile: false,
        enableLog: true,
        enableLogCache: true,
        enableNtTemp: true,
        enableNapCatData: false,
        enableNapCatTemp: true,
        retainDays: 7
    });
    const [schedules, setSchedules] = useState<ScheduleTask[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'settings'>('dashboard');

    // Initial Data Fetch
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [accRes, configRes, schedRes] = await Promise.all([
                request<{ accounts: Account[], currentUin: string }>('/accounts'),
                request<{ defaultOptions: CleanerConfig }>('/config'),
                request<ScheduleTask[]>('/schedules')
            ]);

            if (accRes.code === 0) {
                setAccounts(accRes.data.accounts);
                if (selectedAccounts.length === 0 && accRes.data.accounts.length > 0) {
                    // Default select current account or all
                    const current = accRes.data.accounts.find(a => a.isCurrent);
                    setSelectedAccounts(current ? [current.uin] : [accRes.data.accounts[0].uin]);
                }
            }

            if (configRes.code === 0) setConfig(configRes.data.defaultOptions);
            if (schedRes.code === 0) setSchedules(schedRes.data);

        } catch (e) {
            showMessage('数据加载失败，请检查网络或刷新页面', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch stats when selected accounts or retain days change
    useEffect(() => {
        if (accounts.length > 0) {
            updateStats();
        }
    }, [config.retainDays, selectedAccounts]);

    const updateStats = async () => {
        if (selectedAccounts.length === 0) return;

        const newAccounts = [...accounts];

        for (const uin of selectedAccounts) {
            try {
                const res = await request<{ formattedStats: any }>(`/stats/${uin}?retainDays=${config.retainDays}`);
                if (res.code === 0) {
                    const idx = newAccounts.findIndex(a => a.uin === uin);
                    if (idx !== -1) {
                        newAccounts[idx] = { ...newAccounts[idx], stats: res.data.formattedStats };
                    }
                }
            } catch (e) { console.error(e); }
        }

        setAccounts(newAccounts);
    };

    const showMessage = (text: string, type: 'success' | 'error' | 'info') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleToggleAccount = (uin: string) => {
        setSelectedAccounts(prev =>
            prev.includes(uin) ? prev.filter(x => x !== uin) : [...prev, uin]
        );
    };

    const handleSaveDefaultConfig = async () => {
        try {
            await request('/config/options', {
                method: 'POST',
                body: JSON.stringify(config)
            });
            showMessage('默认配置已保存', 'success');
        } catch (e) {
            showMessage('保存配置失败', 'error');
        }
    };

    const handleClean = async () => {
        if (selectedAccounts.length === 0) {
            showMessage('请先选择要清理的账号', 'error');
            return;
        }

        setCleaning(true);
        showMessage('正在清理缓存文件，请稍候...', 'info');

        try {
            const res = await request<{ totalSize: string }>('/clean', {
                method: 'POST',
                body: JSON.stringify({ accounts: selectedAccounts, options: config })
            });

            if (res.code === 0) {
                showMessage(`清理完成，释放空间: ${res.data.totalSize}`, 'success');
                updateStats(); // Refresh stats
            } else {
                showMessage(`清理失败: ${res.message}`, 'error');
            }
        } catch (e) {
            showMessage('请求失败', 'error');
        } finally {
            setCleaning(false);
        }
    };

    const handleCreateTask = async (task: Partial<ScheduleTask>) => {
        try {
            await request('/schedules', {
                method: 'POST',
                body: JSON.stringify(task)
            });
            const res = await request<ScheduleTask[]>('/schedules');
            if (res.code === 0) {
                setSchedules(res.data);
                showMessage('定时任务已添加', 'success');
                setIsModalOpen(false);
            }
        } catch (e) {
            showMessage('添加任务失败', 'error');
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm('确定要删除此定时任务吗？')) return;
        try {
            await request(`/schedules/${id}`, { method: 'DELETE' });
            setSchedules(prev => prev.filter(s => s.id !== id));
            showMessage('任务已删除', 'success');
        } catch (e) {
            showMessage('删除失败', 'error');
        }
    };

    const handleToggleTask = async (id: string, enabled: boolean) => {
        try {
            await request(`/schedules/${id}`, {
                method: 'POST',
                body: JSON.stringify({ enabled })
            });

            setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled } : s));
        } catch (e) {
            showMessage('更新状态失败', 'error');
        }
    };

    const handleRunTask = async (id: string) => {
        try {
            const res = await request(`/schedules/${id}/run`, { method: 'POST' });
            if (res.code === 0) {
                showMessage('任务已触发', 'success');
                // Refresh schedules to see last run time
                const schedRes = await request<ScheduleTask[]>('/schedules');
                if (schedRes.code === 0) setSchedules(schedRes.data);
            }
        } catch (e) {
            showMessage('触发失败', 'error');
        }
    }

    if (loading && accounts.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="w-8 h-8 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 font-sans overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-white dark:bg-[#121214] border-r border-gray-100 dark:border-gray-800 flex flex-col pt-6 pb-4">
                <div className="px-6 mb-8 flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/30">
                        <Eraser className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-lg font-bold tracking-tight">NapCat Cleaner</span>
                </div>

                <nav className="flex-1 px-4 space-y-1">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`sidebar-item w-full ${activeTab === 'dashboard' ? 'active' : ''}`}
                    >
                        <LayoutDashboard size={18} />
                        <span>概览</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={`sidebar-item w-full ${activeTab === 'tasks' ? 'active' : ''}`}
                    >
                        <Clock size={18} />
                        <span>定时任务</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`sidebar-item w-full ${activeTab === 'settings' ? 'active' : ''}`}
                    >
                        <Settings size={18} />
                        <span>插件设置</span>
                    </button>
                </nav>

                <div className="px-6 mt-auto">
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                        <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">存储状态</h4>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600 dark:text-gray-400">已清理空间</span>
                            <span className="text-xs font-bold text-primary">-- MB</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className="max-w-5xl mx-auto px-8 py-8">

                    {/* Top Bar */}
                    <header className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold">
                                {activeTab === 'dashboard' && '仪表盘'}
                                {activeTab === 'tasks' && '定时任务'}
                                {activeTab === 'settings' && '插件设置'}
                            </h1>
                            <p className="text-sm text-gray-500 mt-1">管理您的 NapCat 清理配置</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={fetchData}
                                className="p-2 text-gray-500 hover:text-primary hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                                title="刷新数据"
                            >
                                <RefreshCw className="w-5 h-5" />
                            </button>
                        </div>
                    </header>

                    {/* Content Views */}
                    <div className="space-y-6">

                        {activeTab === 'dashboard' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Left Column: Selection & Stats */}
                                <div className="lg:col-span-2 space-y-6">
                                    <div className="glass-card p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold flex items-center gap-2">
                                                <ShieldCheck className="w-5 h-5 text-primary" />
                                                账号列表
                                            </h3>
                                        </div>
                                        <AccountList
                                            accounts={accounts}
                                            selectedAccounts={selectedAccounts}
                                            onToggleAccount={handleToggleAccount}
                                        />
                                    </div>

                                    <div className="glass-card p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold flex items-center gap-2">
                                                <BarChart3 className="w-5 h-5 text-primary" />
                                                空间占用
                                            </h3>
                                            <div className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-gray-500">
                                                自动统计
                                            </div>
                                        </div>
                                        <StatsTable
                                            accounts={accounts}
                                            selectedAccounts={selectedAccounts}
                                            retainDays={config.retainDays}
                                        />
                                    </div>
                                </div>

                                {/* Right Column: Actions & Quick Config */}
                                <div className="space-y-6">
                                    <div className="glass-card p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold flex items-center gap-2">
                                                <Settings className="w-5 h-5 text-primary" />
                                                清理选项
                                            </h3>
                                        </div>

                                        <ConfigPanel
                                            config={config}
                                            onChange={setConfig}
                                            onSave={handleSaveDefaultConfig}
                                        />

                                        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                                            <button
                                                onClick={handleClean}
                                                disabled={cleaning || selectedAccounts.length === 0}
                                                className={`
                                                    w-full py-3 rounded-lg font-bold text-white shadow-lg shadow-pink-500/20 transition-all transform active:scale-[0.98]
                                                    flex items-center justify-center gap-2
                                                    ${cleaning || selectedAccounts.length === 0
                                                        ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                                                        : 'bg-primary hover:bg-[#e05a80]'
                                                    }
                                                `}
                                            >
                                                {cleaning ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                        <span>清理中...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Eraser className="w-4 h-4" />
                                                        <span>立即清理</span>
                                                    </>
                                                )}
                                            </button>
                                            <p className="text-center text-xs text-gray-400 mt-2">
                                                已选择: {selectedAccounts.length} 个账号
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'tasks' && (
                            <div className="glass-card p-6 min-h-[500px]">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="font-semibold text-lg">定时任务</h3>
                                        <p className="text-sm text-gray-500">自动化您的清理流程</p>
                                    </div>
                                    <button
                                        onClick={() => setIsModalOpen(true)}
                                        className="btn btn-primary text-sm"
                                    >
                                        + 新建任务
                                    </button>
                                </div>
                                <ScheduleList
                                    schedules={schedules}
                                    onDelete={handleDeleteTask}
                                    onToggle={handleToggleTask}
                                    onRun={handleRunTask}
                                    onCreate={() => setIsModalOpen(true)}
                                />
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="max-w-2xl">
                                <div className="glass-card p-6">
                                    <h3 className="font-semibold text-lg mb-4">全局配置</h3>
                                    <div className="space-y-4">
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            在此配置 NapCat Cleaner 插件的默认行为。
                                        </p>
                                        {/* Example settings */}
                                        <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                                            <div>
                                                <div className="font-medium text-sm">默认保留策略</div>
                                                <div className="text-xs text-gray-500">删除前保留文件的天数</div>
                                            </div>
                                            <input
                                                type="number"
                                                value={config.retainDays}
                                                onChange={(e) => setConfig({ ...config, retainDays: parseInt(e.target.value) || 0 })}
                                                className="w-16 px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-center text-sm"
                                            />
                                        </div>
                                        <div className="py-4">
                                            <button
                                                onClick={handleSaveDefaultConfig}
                                                className="btn btn-primary w-full sm:w-auto"
                                            >
                                                <Save className="w-4 h-4" />
                                                保存为默认配置
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </main>

            {/* Toast Message */}
            {message && (
                <div className={`
                    fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl border font-medium text-sm flex items-center gap-3 animate-bounce-in
                    ${message.type === 'success' ? 'bg-white dark:bg-gray-800 text-green-600 border-green-200 dark:border-green-900' : ''}
                    ${message.type === 'error' ? 'bg-white dark:bg-gray-800 text-red-600 border-red-200 dark:border-red-900' : ''}
                    ${message.type === 'info' ? 'bg-white dark:bg-gray-800 text-blue-600 border-blue-200 dark:border-blue-900' : ''}
                `}>
                    {message.type === 'success' && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
                    {message.type === 'error' && <div className="w-2 h-2 rounded-full bg-red-500"></div>}
                    {message.text}
                </div>
            )}

            <CreateTaskModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleCreateTask}
                accounts={accounts}
                defaultConfig={config}
            />
        </div>
    );
}

export default App;
