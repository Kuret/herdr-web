const STORAGE_KEY = 'herdr-web:quick-keys-collapsed';

/**
 * Reads the stored collapse choice. `collapsedByDefault` is what applies before the
 * user has ever toggled it — the caller decides that (touch devices start collapsed,
 * where terminal rows are the scarce resource), keeping this module DOM-free.
 */
export function readQuickKeysCollapsed(
    storage: Pick<Storage, 'getItem'>,
    collapsedByDefault: boolean,
): boolean {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === 'true' || stored === 'false') {
        return stored === 'true';
    }
    return collapsedByDefault;
}

export function writeQuickKeysCollapsed(storage: Pick<Storage, 'setItem'>, collapsed: boolean): void {
    storage.setItem(STORAGE_KEY, String(collapsed));
}
