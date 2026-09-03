import type { NotificationSettings } from '../lib/notification-settings';

interface SettingsSheetProps {
    readonly open: boolean;
    readonly settings: NotificationSettings;
    readonly onChange: (key: keyof NotificationSettings, value: boolean) => void;
    readonly onClose: () => void;
}

interface SwitchRowProps {
    readonly label: string;
    readonly hint: string;
    readonly checked: boolean;
    readonly onChange: (value: boolean) => void;
    readonly children?: React.ReactNode;
}

function SwitchRow({ label, hint, checked, onChange, children }: SwitchRowProps) {
    return (
        <label className="setting-row">
            <span className="setting-copy">
                <span className="setting-label">
                    {label}
                    {children}
                </span>
                <span className="setting-hint">{hint}</span>
            </span>
            <input type="checkbox" className="setting-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        </label>
    );
}

export function SettingsSheet({ open, settings, onChange, onClose }: SettingsSheetProps) {
    if (!open) {
        return null;
    }

    return (
        <div className="sheet-backdrop" role="presentation" onClick={onClose}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
                <h2 className="sheet-title">settings</h2>

                <SwitchRow
                    label="Shortcuts bar"
                    hint="Hide for a full-terminal view — a floating + button keeps img/cam upload reachable."
                    checked={settings.quickKeys}
                    onChange={(value) => onChange('quickKeys', value)}
                />
                <SwitchRow
                    label="On this page"
                    hint="Banners in herdr web while it is open."
                    checked={settings.toasts}
                    onChange={(value) => onChange('toasts', value)}
                />
                <SwitchRow
                    label="On this device"
                    hint="System notifications, delivered even when herdr web is closed."
                    checked={settings.device}
                    onChange={(value) => onChange('device', value)}
                />
                <SwitchRow
                    label="Every state change"
                    hint="Off: only when an agent needs attention or finishes."
                    checked={settings.allChanges}
                    onChange={(value) => onChange('allChanges', value)}
                >
                    {/* the same dots the top bar uses, so the setting names its own volume */}
                    <span className="setting-dots" aria-hidden="true">
                        <span className="herd-dot status-blocked" />
                        <span className="herd-dot status-idle" />
                        <span className={settings.allChanges ? 'herd-dot status-working' : 'herd-dot'} />
                    </span>
                </SwitchRow>

                <button type="button" className="sheet-btn" onClick={onClose}>
                    Done
                </button>
            </div>
        </div>
    );
}
