import { useState } from 'react';
import { notificationSettingsHelp } from '../lib/notifications';

interface NotificationHelpProps {
    readonly open: boolean;
    readonly onClose: () => void;
}

// shown when the notification permission is blocked: a real path to the fix,
// not just a toast — Android gets a button that opens the OS settings
export function NotificationHelp({ open, onClose }: NotificationHelpProps) {
    const [copied, setCopied] = useState(false);
    if (!open) {
        return null;
    }
    const help = notificationSettingsHelp(navigator.userAgent);

    const copySettingsUrl = async () => {
        if (!help.settingsUrl) {
            return;
        }
        try {
            await navigator.clipboard.writeText(help.settingsUrl);
            setCopied(true);
        } catch {}
    };

    return (
        <div className="sheet-backdrop" role="presentation" onClick={onClose}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label="Enable notifications" onClick={(e) => e.stopPropagation()}>
                <h2 className="sheet-title">Notifications are blocked</h2>
                <ol className="sheet-steps">
                    {help.steps.map((step) => (
                        <li key={step}>{step}</li>
                    ))}
                </ol>
                {help.platform === 'android' && help.intentUrl && (
                    <a className="sheet-btn sheet-btn-primary" href={help.intentUrl}>
                        Open notification settings
                    </a>
                )}
                {help.platform === 'desktop' && help.settingsUrl && (
                    <button type="button" className="sheet-btn sheet-btn-primary" onClick={() => void copySettingsUrl()}>
                        {copied ? 'Copied — paste it in a new tab' : `Copy ${help.settingsUrl}`}
                    </button>
                )}
                <button type="button" className="sheet-btn" onClick={onClose}>
                    Close
                </button>
            </div>
        </div>
    );
}
