import { describe, expect, it } from 'vitest';
import { readQuickKeysCollapsed, writeQuickKeysCollapsed } from './quick-keys-collapsed';

const STORAGE_KEY = 'herdr-web:quick-keys-collapsed';

function storageWith(value: string | null) {
    return { getItem: () => value };
}

describe('readQuickKeysCollapsed', () => {
    it('honours a stored choice over the default', () => {
        expect(readQuickKeysCollapsed(storageWith('false'), true)).toBe(false);
        expect(readQuickKeysCollapsed(storageWith('true'), false)).toBe(true);
    });

    it('falls back to the supplied default when nothing is stored', () => {
        expect(readQuickKeysCollapsed(storageWith(null), true)).toBe(true);
        expect(readQuickKeysCollapsed(storageWith(null), false)).toBe(false);
    });

    it('ignores a junk stored value and falls back to the default', () => {
        expect(readQuickKeysCollapsed(storageWith('maybe'), true)).toBe(true);
        expect(readQuickKeysCollapsed(storageWith(''), false)).toBe(false);
    });
});

describe('writeQuickKeysCollapsed', () => {
    it('persists the flag as a string under the namespaced key', () => {
        const written: Array<[string, string]> = [];
        const storage = { setItem: (key: string, value: string) => written.push([key, value]) };

        writeQuickKeysCollapsed(storage, true);
        writeQuickKeysCollapsed(storage, false);

        expect(written).toEqual([
            [STORAGE_KEY, 'true'],
            [STORAGE_KEY, 'false'],
        ]);
    });
});
