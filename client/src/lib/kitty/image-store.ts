import type { KittyAnchor, KittyBitmap, KittyBitmapDecoder, KittyControl, KittyPlacement } from './types';

interface PendingTransfer {
    readonly imageId: number;
    readonly width: number;
    readonly height: number;
    readonly chunks: string[];
}

// holds the decoded frames herdr transmits and the cursor-anchored placements that show them.
// bitmap creation is injected so the whole store stays DOM-free and unit-testable: herdr sends
// a fresh full-size RGBA frame per animation step, so decode races and stale frames are the
// normal case, not an edge case.
export class KittyImageStore {
    private static readonly RGBA_FORMAT = 32;

    private static readonly BYTES_PER_PIXEL = 4;

    private readonly bitmaps = new Map<number, KittyBitmap>();

    private readonly placements = new Map<string, KittyPlacement>();

    private readonly generations = new Map<number, number>();

    private pending: PendingTransfer | null = null;

    constructor(
        private readonly decode: KittyBitmapDecoder,
        private readonly onChange: () => void,
    ) {}

    get visiblePlacements(): Iterable<KittyPlacement> {
        return this.placements.values();
    }

    bitmapFor(imageId: number): KittyBitmap | undefined {
        return this.bitmaps.get(imageId);
    }

    handleSequence(control: KittyControl, payload: string, anchor: KittyAnchor | null): void {
        if (control.action === 't') {
            this.beginTransfer(control, payload);
            return;
        }
        if (control.action === 'p') {
            this.place(control, anchor);
            return;
        }
        if (control.action === 'd') {
            this.deleteImage(control.imageId);
            return;
        }
        if (control.hasChunkFlag) {
            this.appendChunk(control, payload);
        }
    }

    clear(): void {
        for (const bitmap of this.bitmaps.values()) {
            bitmap.close();
        }
        this.bitmaps.clear();
        this.placements.clear();
        this.generations.clear();
        this.pending = null;
        this.onChange();
    }

    private beginTransfer(control: KittyControl, payload: string): void {
        const { imageId, pixelWidth, pixelHeight } = control;
        if (imageId === null || pixelWidth === null || pixelHeight === null) {
            return;
        }
        if (control.format !== KittyImageStore.RGBA_FORMAT) {
            return;
        }
        this.pending = { imageId, width: pixelWidth, height: pixelHeight, chunks: [payload] };
        if (!control.moreChunks) {
            this.completeTransfer();
        }
    }

    private appendChunk(control: KittyControl, payload: string): void {
        if (this.pending === null) {
            return;
        }
        this.pending.chunks.push(payload);
        if (!control.moreChunks) {
            this.completeTransfer();
        }
    }

    private completeTransfer(): void {
        const transfer = this.pending;
        this.pending = null;
        if (transfer === null) {
            return;
        }
        const pixels = KittyImageStore.decodeBase64(transfer.chunks.join(''));
        const expected = transfer.width * transfer.height * KittyImageStore.BYTES_PER_PIXEL;
        if (pixels === null || pixels.length < expected) {
            return;
        }
        const generation = this.nextGeneration(transfer.imageId);
        void this.storeBitmap(transfer, pixels.subarray(0, expected), generation);
    }

    private async storeBitmap(
        transfer: PendingTransfer,
        pixels: Uint8ClampedArray<ArrayBuffer>,
        generation: number,
    ): Promise<void> {
        try {
            const bitmap = await this.decode(pixels, transfer.width, transfer.height);
            // a delete or a newer frame for the same id landed while this one was decoding
            if (this.generations.get(transfer.imageId) !== generation) {
                bitmap.close();
                return;
            }
            this.bitmaps.get(transfer.imageId)?.close();
            this.bitmaps.set(transfer.imageId, bitmap);
            this.onChange();
        } catch (error) {
            console.warn('kitty graphics: failed to decode frame', error);
        }
    }

    private place(control: KittyControl, anchor: KittyAnchor | null): void {
        const { imageId, cols, rows } = control;
        if (anchor === null || imageId === null || cols === null || rows === null) {
            return;
        }
        const placementId = control.placementId ?? 0;
        this.placements.set(KittyImageStore.placementKey(imageId, placementId), {
            imageId,
            placementId,
            col: anchor.col,
            absRow: anchor.absRow,
            cols,
            rows,
        });
        this.onChange();
    }

    private deleteImage(imageId: number | null): void {
        if (imageId === null) {
            return;
        }
        this.nextGeneration(imageId);
        this.bitmaps.get(imageId)?.close();
        this.bitmaps.delete(imageId);
        for (const [key, placement] of this.placements) {
            if (placement.imageId === imageId) {
                this.placements.delete(key);
            }
        }
        this.onChange();
    }

    private nextGeneration(imageId: number): number {
        const generation = (this.generations.get(imageId) ?? 0) + 1;
        this.generations.set(imageId, generation);
        return generation;
    }

    private static placementKey(imageId: number, placementId: number): string {
        return `${imageId}:${placementId}`;
    }

    private static decodeBase64(data: string): Uint8ClampedArray<ArrayBuffer> | null {
        try {
            const binary = atob(data);
            const bytes = new Uint8ClampedArray(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }
            return bytes;
        } catch (error) {
            console.warn('kitty graphics: malformed base64 payload', error);
            return null;
        }
    }
}
