import { Account, CATEGORY_LABELS } from '../types';

interface StatsTableProps {
    accounts: Account[];
    selectedAccounts: string[];
    retainDays: number;
}

export function StatsTable({ accounts, selectedAccounts, retainDays }: StatsTableProps) {
    if (selectedAccounts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
                <div className="text-gray-400 dark:text-gray-600 mb-2">未选择账号</div>
                <div className="text-xs text-gray-400">请在左侧选择账号以查看详情</div>
            </div>
        );
    }

    const selectedStats = accounts.filter(acc => selectedAccounts.includes(acc.uin));

    return (
        <div className="space-y-6 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            {selectedStats.map(acc => (
                <div key={acc.uin} className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-semibold text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary"></span>
                        账号 {acc.uin}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                                <tr>
                                    <th className="text-left py-3 px-4 font-semibold text-gray-500 w-1/4">分类</th>
                                    <th className="text-right py-3 px-4 font-semibold text-gray-500 w-1/4">文件数</th>
                                    <th className="text-right py-3 px-4 font-semibold text-gray-500 w-1/4">大小</th>
                                    <th className="text-right py-3 px-4 font-semibold text-gray-500 w-1/4">可清理 ({retainDays}天)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                                    const stats = acc.stats.categories[key] || { files: 0, size: '0 B', estimatedCleanSize: '0 B' };
                                    return (
                                        <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{label}</td>
                                            <td className="py-3 px-4 text-right font-mono text-gray-600 dark:text-gray-400">{stats.files}</td>
                                            <td className="py-3 px-4 text-right font-mono font-medium text-gray-800 dark:text-gray-200">{stats.size}</td>
                                            <td className="py-3 px-4 text-right font-mono text-primary font-medium">{stats.estimatedCleanSize}</td>
                                        </tr>
                                    );
                                })}
                                <tr className="bg-gray-50 dark:bg-gray-800/30 font-semibold">
                                    <td className="py-3 px-4">合计</td>
                                    <td className="py-3 px-4 text-right font-mono">{acc.stats.totalFiles}</td>
                                    <td className="py-3 px-4 text-right font-mono">{acc.stats.totalSize}</td>
                                    <td className="py-3 px-4 text-right font-mono text-primary">{acc.stats.estimatedCleanSize}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}
