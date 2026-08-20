import { useEffect, useState } from 'react';
import { formatAgentNotification, toastClass } from '../lib/notifications';
import type { AgentEvent } from '../types';

const TOAST_TTL_MS = 5000;

let nextToastId = 0;

function allocateToastId(): number {
    nextToastId += 1;
    return nextToastId;
}

interface Toast {
    readonly id: number;
    readonly className: string;
    readonly text: string;
}

interface ToastHostProps {
    readonly event: AgentEvent | null;
    readonly error: string | null;
}

export function ToastHost({ event, error }: ToastHostProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        if (!event || event.from === null) {
            return;
        }
        const { title, body } = formatAgentNotification(event);
        pushToast({ id: allocateToastId(), className: toastClass(event), text: `${title} — ${body}` });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event]);

    useEffect(() => {
        if (!error) {
            return;
        }
        pushToast({ id: allocateToastId(), className: 'toast toast-blocked', text: error });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [error]);

    function pushToast(toast: Toast) {
        setToasts((current) => [...current, toast]);
        setTimeout(() => {
            setToasts((current) => current.filter((t) => t.id !== toast.id));
        }, TOAST_TTL_MS);
    }

    return (
        <div className="toast-host" aria-live="polite">
            {toasts.map((toast) => (
                <div key={toast.id} className={toast.className}>
                    {toast.text}
                </div>
            ))}
        </div>
    );
}
