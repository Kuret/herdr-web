const STATUS_CLASS_MAP: Readonly<Record<string, string>> = {
    working: 'status-working',
    idle: 'status-idle',
    blocked: 'status-blocked',
};

const DEFAULT_STATUS_CLASS = 'status-unknown';

export function statusDotClass(status: string | undefined): string {
    if (!status) {
        return DEFAULT_STATUS_CLASS;
    }
    return STATUS_CLASS_MAP[status] ?? DEFAULT_STATUS_CLASS;
}

