import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
    id: string;
    text: string;
    type: ToastType;
}

interface ToastContainerProps {
    toasts: ToastMessage[];
    onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
            {toasts.map((toast) => (
                <Toast key={toast.id} message={toast} onRemove={onRemove} />
            ))}
        </div>
    );
}

function Toast({ message, onRemove }: { message: ToastMessage; onRemove: (id: string) => void }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onRemove(message.id);
        }, 4000);
        return () => clearTimeout(timer);
    }, [message.id, onRemove]);

    const icons = {
        success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
        error: <AlertCircle className="w-5 h-5 text-red-500" />,
        info: <Info className="w-5 h-5 text-blue-500" />
    };

    const styles = {
        success: 'border-green-100 dark:border-green-900/30 bg-white dark:bg-[#1e1e20]',
        error: 'border-red-100 dark:border-red-900/30 bg-white dark:bg-[#1e1e20]',
        info: 'border-blue-100 dark:border-blue-900/30 bg-white dark:bg-[#1e1e20]'
    };

    return (
        <div className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 min-w-[300px] max-w-md
            rounded-lg shadow-lg border ${styles[message.type]}
            animate-in slide-in-from-right-full duration-300
        `}>
            {icons[message.type]}
            <p className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{message.text}</p>
            <button 
                onClick={() => onRemove(message.id)}
                className="text-gray-400 hover:text-gray-500 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
