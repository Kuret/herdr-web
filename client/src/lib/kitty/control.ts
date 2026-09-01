import type { KittyAction, KittyControl } from './types';

const ACTIONS: readonly string[] = ['t', 'p', 'd'];

function readNumber(fields: ReadonlyMap<string, string>, key: string): number | null {
    const raw = fields.get(key);
    if (raw === undefined) {
        return null;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isNaN(value) ? null : value;
}

function readAction(fields: ReadonlyMap<string, string>): KittyAction | null {
    const raw = fields.get('a');
    if (raw === undefined || !ACTIONS.includes(raw)) {
        return null;
    }
    return raw as KittyAction;
}

// a kitty control string is a flat comma-separated key=value list, e.g.
// "a=t,t=d,f=32,s=232,v=592,i=820733,q=2,m=1"; continuation chunks carry only "m=1"/"m=0"
export function parseKittyControl(control: string): KittyControl {
    const fields = new Map<string, string>();
    for (const pair of control.split(',')) {
        const separator = pair.indexOf('=');
        if (separator <= 0) {
            continue;
        }
        fields.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
    return {
        action: readAction(fields),
        imageId: readNumber(fields, 'i'),
        placementId: readNumber(fields, 'p'),
        format: readNumber(fields, 'f'),
        pixelWidth: readNumber(fields, 's'),
        pixelHeight: readNumber(fields, 'v'),
        cols: readNumber(fields, 'c'),
        rows: readNumber(fields, 'r'),
        moreChunks: fields.get('m') === '1',
        hasChunkFlag: fields.has('m'),
    };
}
