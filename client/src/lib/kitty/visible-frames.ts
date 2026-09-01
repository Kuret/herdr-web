import type { KittyPlacement, KittyVisibleFrame } from './types';

// placements are anchored in absolute buffer coordinates; the viewport slides over them as
// the user scrolls, so each frame is rebased onto screen rows and dropped when fully off-screen
export function toVisibleFrames(
    placements: Iterable<KittyPlacement>,
    viewportTopRow: number,
    viewportRows: number,
): readonly KittyVisibleFrame[] {
    const frames: KittyVisibleFrame[] = [];
    for (const placement of placements) {
        const screenRow = placement.absRow - viewportTopRow;
        if (screenRow + placement.rows <= 0 || screenRow >= viewportRows) {
            continue;
        }
        frames.push({
            imageId: placement.imageId,
            col: placement.col,
            screenRow,
            cols: placement.cols,
            rows: placement.rows,
        });
    }
    return frames;
}
