import { useState, useEffect } from 'react';
import { ScheduleTask, Account, CleanerConfig } from '../types';
import { X } from 'lucide-react';

interface CreateTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (task: Partial<ScheduleTask>) => Promise<void>;
    accounts: Account[];
    defaultConfig: CleanerConfig;
}

export function CreateTaskModal({ isOpen, onClose, onSave, accounts, defaultConfig }: CreateTaskModalProps) {
    const [name, setName] = useState('自动清理任务');
    const [cronHour, setCronHour] = useState(3);
    const [cronMinute, setCronMinute] = useState(0);
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'interval'>('daily');
    const [frequencyValue, setFrequencyValue] = useState(1);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>(accounts.map(a => a.uin));
    const [config, setConfig] = useState<CleanerConfig>(defaultConfig);

    useEffect(() => {
        if (isOpen) {
            setConfig(defaultConfig);
            setSelectedAccounts(accounts.map(a => a.uin));
            setName('自动清理任务');
            setCronHour(3);
            setCronMinute(0);
        }
    }, [isOpen, defaultConfig, accounts]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!name.trim()) return;

        await onSave({
            name,
            cronHour,
            cronMinute,
            frequency,
            frequencyValue: frequency === 'daily' ? 0 : frequencyValue,
            retainDays: config.retainDays,
            options: config,
            accounts: selectedAccounts,
            enabled: true
        });
        onClose();
    };

    const toggleAccount = (uin: string) => {
        setSelectedAccounts(prev =>
            prev.includes(uin) ? prev.filter(x => x !== uin) : [...prev, uin]
        );
    };

    const configOptions = [
        { key: 'enableVideo', label: '清理视频' },
        { key: 'enableVideoThumb', label: '清理视频封面' },
        { key: 'enablePtt', label: '清理语音' },
        { key: 'enablePic', label: '清理图片缓存' },
        { key: 'enableFile', label: '清理收发文件' },
        { key: 'enableLog', label: '清理运行日志' },
        { key: 'enableLogCache', label: '清理日志缓存' },
        { key: 'enableNtTemp', label: '清理QQ临时文件' },
        { key: 'enableNapCatData', label: '清理 NapCat 核心数据' },
        { key: 'enableNapCatTemp', label: '清理 NapCat 临时文件' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <div className="bg-bg-card rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border-color sticky top-0 bg-bg-card z-10">
                    <h2 className="text-xl font-bold text-text-main">新建定时任务</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-main p-1 rounded-full hover:bg-item-bg">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* 基本信息 */}
                    <section>
                        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">基本信息</h3>
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">任务名称</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="例如：每日自动清理"
                                className="w-full px-3 py-2 border border-border-color rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </section>

                    {/* 账号选择 */}
                    <section>
                        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">选择账号</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {accounts.map(acc => (
                                <div
                                    key={acc.uin}
                                    onClick={() => toggleAccount(acc.uin)}
                                    className={`
                    p-3 rounded-lg border text-sm cursor-pointer flex items-center justify-between
                    ${selectedAccounts.includes(acc.uin)
                                            ? 'bg-blue-50 border-primary'
                                            : 'bg-item-bg border-transparent hover:bg-item-hover'}
                  `}
                                >
                                    <span className="font-medium">{acc.uin}</span>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedAccounts.includes(acc.uin) ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                                        {selectedAccounts.includes(acc.uin) && <span className="text-white text-xs">✓</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 执行计划 */}
                    <section>
                        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">执行计划</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-text-secondary mb-1">执行频率</label>
                                <select
                                    value={frequency}
                                    onChange={e => setFrequency(e.target.value as any)}
                                    className="w-full px-3 py-2 bg-item-bg border border-border-color rounded-lg text-sm focus:outline-none focus:border-primary"
                                >
                                    <option value="daily">每天</option>
                                    <option value="weekly">每周</option>
                                    <option value="interval">间隔天数</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-text-secondary mb-1">执行时间 (24h)</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="23"
                                        value={cronHour}
                                        onChange={e => setCronHour(parseInt(e.target.value))}
                                        className="flex-1 px-3 py-2 border border-border-color rounded-lg text-center text-sm"
                                        placeholder="HH"
                                    />
                                    <span className="text-text-secondary">:</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="59"
                                        value={cronMinute}
                                        onChange={e => setCronMinute(parseInt(e.target.value))}
                                        className="flex-1 px-3 py-2 border border-border-color rounded-lg text-center text-sm"
                                        placeholder="MM"
                                    />
                                </div>
                            </div>
                        </div>

                        {frequency === 'weekly' && (
                            <div className="mt-3">
                                <label className="block text-sm text-text-secondary mb-1">选择星期</label>
                                <div className="flex gap-2">
                                    {['日', '一', '二', '三', '四', '五', '六'].map((day, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setFrequencyValue(idx)}
                                            className={`
                        flex-1 py-1.5 rounded-md text-xs font-medium border
                        ${frequencyValue === idx
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-item-bg text-text-main border-transparent hover:border-border-color'}
                      `}
                                        >
                                            {day}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {frequency === 'interval' && (
                            <div className="mt-3 flex items-center gap-3 text-sm">
                                <span>每</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={frequencyValue}
                                    onChange={e => setFrequencyValue(parseInt(e.target.value) || 1)}
                                    className="w-20 px-3 py-1.5 border border-border-color rounded-lg text-center"
                                />
                                <span>天执行一次</span>
                            </div>
                        )}
                    </section>

                    {/* 清理配置 */}
                    <section>
                        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">清理配置</h3>

                        <div className="mb-4">
                            <label className="block text-sm text-text-secondary mb-1">文件保留天数 (0表示不保留)</label>
                            <input
                                type="number"
                                min="0"
                                max="365"
                                value={config.retainDays}
                                onChange={e => setConfig({ ...config, retainDays: parseInt(e.target.value) || 0 })}
                                className="w-full px-3 py-2 border border-border-color rounded-lg text-sm focus:outline-none focus:border-primary"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {configOptions.map((opt) => (
                                <label key={opt.key} className="flex items-center space-x-2 cursor-pointer group select-none">
                                    <input
                                        type="checkbox"
                                        checked={!!config[opt.key as keyof CleanerConfig]}
                                        onChange={(e) => setConfig({ ...config, [opt.key]: e.target.checked })}
                                        className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                                    />
                                    <span className="text-sm text-text-main group-hover:text-primary transition-colors">{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="p-6 border-t border-border-color flex justify-end gap-3 bg-bg-card sticky bottom-0 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-item-bg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover shadow-sm transition-colors"
                    >
                        保存任务
                    </button>
                </div>
            </div>
        </div>
    );
}
