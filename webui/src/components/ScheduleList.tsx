// Placeholder for ScheduleList component
import { ScheduleTask } from '../types';
import { Trash2, Play, Pause, Clock, Calendar } from 'lucide-react';

interface ScheduleListProps {
    schedules: ScheduleTask[];
    onDelete: (id: string) => void;
    onToggle: (id: string, enabled: boolean) => void;
    onRun: (id: string) => void;
    onCreate: () => void;
}

export function ScheduleList({ schedules, onDelete, onToggle, onRun, onCreate }: ScheduleListProps) {
    const getFrequencyText = (task: ScheduleTask) => {
        if (task.frequency === 'weekly') {
            const days = ['日', '一', '二', '三', '四', '五', '六'];
            return `每周${days[task.frequencyValue] || ''}`;
        }
        if (task.frequency === 'interval') {
            return `每 ${task.frequencyValue} 天`;
        }
        return '每天';
    };

    return (
        <div>
            {schedules.length === 0 ? (
                <div className="text-center text-text-secondary py-8 text-sm">暂未设置定时清理任务</div>
            ) : (
                <div className="space-y-4 mb-6">
                    {schedules.map((task) => (
                        <div key={task.id} className="bg-item-bg rounded-lg p-4 border border-transparent hover:border-border-color transition-colors">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold text-text-main">{task.name}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${task.enabled ? 'bg-green-100 text-success' : 'bg-gray-200 text-text-secondary'}`}>
                                            {task.enabled ? '运行中' : '已暂停'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4 text-xs text-text-secondary">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" />
                                            {getFrequencyText(task)} {task.cronHour}:{task.cronMinute.toString().padStart(2, '0')}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            保留 {task.options.retainDays} 天
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onRun(task.id)}
                                        title="立即运行"
                                        className="p-1.5 text-text-secondary hover:text-primary hover:bg-white rounded-md transition-colors"
                                    >
                                        <Play className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => onToggle(task.id, !task.enabled)}
                                        title={task.enabled ? "暂停任务" : "恢复任务"}
                                        className="p-1.5 text-text-secondary hover:text-primary hover:bg-white rounded-md transition-colors"
                                    >
                                        <Pause className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => onDelete(task.id)}
                                        title="删除任务"
                                        className="p-1.5 text-text-secondary hover:text-danger hover:bg-white rounded-md transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="text-xs text-text-secondary border-t border-border-color/50 pt-3 mt-3 flex justify-between">
                                <span>适用账号: {task.accounts.length ? task.accounts.join(', ') : '全部账号'}</span>
                                <span>上次运行: {task.lastRun ? new Date(task.lastRun).toLocaleString() : '从未'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button
                onClick={onCreate}
                className="w-full py-2.5 bg-item-bg hover:bg-item-hover text-text-main font-medium rounded-lg text-sm transition-colors border border-dashed border-border-color flex items-center justify-center gap-2"
            >
                <span>+</span> 新建定时清理任务
            </button>
        </div>
    );
}
