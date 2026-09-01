// the kitty graphics protocol subset herdr actually emits: RGBA frames transmitted
// inline (t=d) in base64 chunks, placed at the cursor, then deleted by image id

export type KittyAction = 't' | 'p' | 'd';

export interface KittyControl {
    readonly action: KittyAction | null;
    readonly imageId: number | null;
    readonly placementId: number | null;
    readonly format: number | null;
    readonly pixelWidth: number | null;
    readonly pixelHeight: number | null;
    readonly cols: number | null;
    readonly rows: number | null;
    readonly moreChunks: boolean;
    readonly hasChunkFlag: boolean;
}

export interface KittyTextPart {
    readonly kind: 'text';
    readonly text: string;
}

export interface KittyApcPart {
    readonly kind: 'apc';
    readonly control: string;
    readonly payload: string;
}

export type KittyStreamPart = KittyTextPart | KittyApcPart;

// where a placement was anchored, in absolute buffer coordinates so it survives scrolling
export interface KittyAnchor {
    readonly col: number;
    readonly absRow: number;
}

export interface KittyPlacement {
    readonly imageId: number;
    readonly placementId: number;
    readonly col: number;
    readonly absRow: number;
    readonly cols: number;
    readonly rows: number;
}

// a placement resolved against the current viewport, ready to draw
export interface KittyVisibleFrame {
    readonly imageId: number;
    readonly col: number;
    readonly screenRow: number;
    readonly cols: number;
    readonly rows: number;
}

export interface KittyBitmap {
    readonly width: number;
    readonly height: number;
    readonly source: CanvasImageSource;
    close(): void;
}

// ArrayBuffer-backed (not SharedArrayBuffer) so the pixels can go straight into an ImageData
export type KittyBitmapDecoder = (
    pixels: Uint8ClampedArray<ArrayBuffer>,
    width: number,
    height: number,
) => Promise<KittyBitmap>;
