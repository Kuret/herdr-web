import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    MAX_IMAGE_BYTES,
    imageFilesFromDataTransfer,
    isSupportedImageType,
    isUnconvertibleImageType,
    quoteShellPath,
    uploadImage,
    validateImageFile,
} from './terminal-image';

function fileOf(name: string, type: string, size = 8): File {
    return { name, type, size } as File;
}

function dataTransferOf(
    files: readonly File[],
    items: ReadonlyArray<{ kind: string; file: File | null }>,
): DataTransfer {
    return {
        files,
        items: items.map((item) => ({ kind: item.kind, getAsFile: () => item.file })),
    } as unknown as DataTransfer;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isSupportedImageType', () => {
    it('accepts the four supported types, ignoring casing and parameters', () => {
        expect(isSupportedImageType('image/png')).toBe(true);
        expect(isSupportedImageType('IMAGE/JPEG; charset=binary')).toBe(true);
        expect(isSupportedImageType('image/webp')).toBe(true);
        expect(isSupportedImageType('image/gif')).toBe(true);
    });

    it('rejects anything else', () => {
        expect(isSupportedImageType('image/heic')).toBe(false);
        expect(isSupportedImageType('application/pdf')).toBe(false);
        expect(isSupportedImageType('')).toBe(false);
    });
});

describe('isUnconvertibleImageType', () => {
    it('flags HEIC and HEIF variants only', () => {
        expect(isUnconvertibleImageType('image/heic')).toBe(true);
        expect(isUnconvertibleImageType('IMAGE/HEIF')).toBe(true);
        expect(isUnconvertibleImageType('image/heic-sequence')).toBe(true);
        expect(isUnconvertibleImageType('image/png')).toBe(false);
    });
});

describe('imageFilesFromDataTransfer', () => {
    it('returns nothing without a data transfer', () => {
        expect(imageFilesFromDataTransfer(null)).toEqual([]);
        expect(imageFilesFromDataTransfer(undefined)).toEqual([]);
    });

    it('reads images from the files list', () => {
        const png = fileOf('shot.png', 'image/png');
        expect(imageFilesFromDataTransfer(dataTransferOf([png], []))).toEqual([png]);
    });

    it('falls back to items when the files list is empty', () => {
        const png = fileOf('pasted.png', 'image/png');
        expect(imageFilesFromDataTransfer(dataTransferOf([], [{ kind: 'file', file: png }]))).toEqual([png]);
    });

    it('does not duplicate a file present in both places', () => {
        const png = fileOf('shot.png', 'image/png');
        expect(imageFilesFromDataTransfer(dataTransferOf([png], [{ kind: 'file', file: png }]))).toHaveLength(1);
    });

    it('ignores string items and non-image files', () => {
        const text = fileOf('notes.txt', 'text/plain');
        expect(imageFilesFromDataTransfer(dataTransferOf([text], [{ kind: 'string', file: null }]))).toEqual([]);
    });
});

describe('validateImageFile', () => {
    it('accepts a supported image inside the size cap', () => {
        expect(validateImageFile(fileOf('a.png', 'image/png'))).toBeNull();
    });

    it('rejects empty, HEIC, unsupported and oversized files', () => {
        expect(validateImageFile(fileOf('a.png', 'image/png', 0))).toMatch(/empty/);
        expect(validateImageFile(fileOf('IMG.heic', 'image/heic'))).toMatch(/JPEG or PNG/);
        expect(validateImageFile(fileOf('doc.pdf', 'application/pdf'))).toMatch(/Unsupported image type/);
        expect(validateImageFile(fileOf('big.png', 'image/png', MAX_IMAGE_BYTES + 1))).toMatch(/10 MB or smaller/);
    });
});

describe('quoteShellPath', () => {
    it('keeps a path with spaces as one argument', () => {
        expect(quoteShellPath('/Users/me/my repo/a.png')).toBe("'/Users/me/my repo/a.png'");
    });

    it('escapes an embedded single quote', () => {
        expect(quoteShellPath("/Users/me/o'brien/a.png")).toBe("'/Users/me/o'\\''brien/a.png'");
    });
});

describe('uploadImage', () => {
    it('posts the raw file with its content type and returns the saved path', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, path: '/repo/.herdr-web-images/img-1.png' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const file = fileOf('a.png', 'image/png');
        await expect(uploadImage(file)).resolves.toBe('/repo/.herdr-web-images/img-1.png');

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/images');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('image/png');
        expect(init.body).toBe(file);
    });

    it('surfaces the server message on a rejected upload', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 415,
                json: async () => ({ ok: false, message: 'HEIC/HEIF is not supported' }),
            }),
        );

        await expect(uploadImage(fileOf('a.heic', 'image/heic'))).rejects.toThrow(/HEIC\/HEIF is not supported/);
    });

    it('falls back to the status code when the body carries no message', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error('not json');
                },
            }),
        );

        await expect(uploadImage(fileOf('a.png', 'image/png'))).rejects.toThrow(/Upload failed \(500\)/);
    });
});
