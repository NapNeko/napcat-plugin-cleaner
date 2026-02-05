import { CleanerConfig } from '../types';

interface ConfigPanelProps {
    config: CleanerConfig;
    onChange: (newConfig: CleanerConfig) => void;
    onSave: () => void;
}

export function ConfigPanel({ config, onChange, onSave }: ConfigPanelProps) {
    const handleChange = (key: keyof CleanerConfig, value: any) => {
        onChange({ ...config, [key]: value });
    };

    const handleSave = () => {
        onSave();
    }

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
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">清理选项</h3>
                <button
                    onClick={handleSave}
                    className="bg-primary hover:bg-primary-hover text-white text-xs px-3 py-1.5 rounded-md transition-colors"
                >
                    保存默认配置
                </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {configOptions.map((opt) => (
                    <label key={opt.key} className="flex items-center space-x-2 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={!!config[opt.key as keyof CleanerConfig]}
                            onChange={(e) => handleChange(opt.key as keyof CleanerConfig, e.target.checked)}
                            className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                        />
                        <span className="text-sm group-hover:text-primary transition-colors">{opt.label}</span>
                    </label>
                ))}
            </div>

            <div className="border-t border-dashed border-border-color pt-4 flex items-center gap-4 text-sm">
                <span className="font-medium">文件保留天数</span>
                <input
                    type="number"
                    min="0"
                    max="365"
                    value={config.retainDays}
                    onChange={(e) => handleChange('retainDays', parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-1.5 border border-border-color rounded-md text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="text-text-secondary text-xs">超过此期限的文件将被清理 (0表示不保留)</span>
            </div>
        </div>
    );
}
