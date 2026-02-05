import { Account } from '../types';
import { User, HardDrive } from 'lucide-react';

interface AccountListProps {
    accounts: Account[];
    selectedAccounts: string[];
    onToggleAccount: (uin: string) => void;
}

export function AccountList({ accounts, selectedAccounts, onToggleAccount }: AccountListProps) {
    if (accounts.length === 0) {
        return <div className="text-center text-gray-500 py-8 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-xl">暂未检测到账号</div>;
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
            {accounts.map((acc) => {
                const isSelected = selectedAccounts.includes(acc.uin);
                return (
                    <div
                        key={acc.uin}
                        onClick={() => onToggleAccount(acc.uin)}
                        className={`
                            relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 group
                            ${isSelected
                                ? 'bg-pink-50 dark:bg-pink-900/10 border-primary shadow-sm'
                                : 'bg-gray-50 dark:bg-gray-800 border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-white dark:hover:bg-gray-700'
                            }
                        `}
                    >
                        <div className={`p-3 rounded-full mb-3 shadow-sm transition-colors ${isSelected ? 'bg-white dark:bg-gray-800' : 'bg-white dark:bg-gray-700 group-hover:bg-gray-50 dark:group-hover:bg-gray-600'}`}>
                            <User className={`w-6 h-6 ${isSelected ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'}`} />
                        </div>

                        <span className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-1 font-mono tracking-tight">{acc.uin}</span>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded-md">
                            <HardDrive className="w-3 h-3" />
                            <span>{acc.stats.totalSize}</span>
                        </div>

                        {acc.isCurrent && (
                            <span className="absolute top-2 right-2 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                        )}

                        {isSelected && (
                            <div className="absolute inset-0 border-2 border-primary rounded-xl pointer-events-none opacity-100 transition-opacity"></div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
