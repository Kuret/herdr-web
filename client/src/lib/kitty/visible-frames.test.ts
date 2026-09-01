import { describe, expect, it } from 'vitest';
import { toVisibleFrames } from './visible-frames';
import type { KittyPlacement } from './types';

function placement(absRow: number, rows: number): KittyPlacement {
    return { imageId: 1, placementId: 2, col: 3, absRow, cols: 10, rows };
}

describe('toVisibleFrames', () => {
    it('rebases an absolute row onto the current viewport', () => {
        const frames = toVisibleFrames([placement(120, 5)], 100, 40);
        expect(frames).toEqual([{ imageId: 1, col: 3, screenRow: 20, cols: 10, rows: 5 }]);
    });

    it('keeps a frame that is partially scrolled off the top', () => {
        const frames = toVisibleFrames([placement(98, 5)], 100, 40);
        expect(frames[0].screenRow).toBe(-2);
    });

    it('drops a frame scrolled fully above the viewport', () => {
        expect(toVisibleFrames([placement(95, 5)], 100, 40)).toEqual([]);
    });

    it('drops a frame that starts below the viewport', () => {
        expect(toVisibleFrames([placement(140, 5)], 100, 40)).toEqual([]);
    });
});
