'use strict';

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

/**
 * Writes images uploaded from a phone into the working directory of the pane they are
 * meant for, so an agent running there can read them by path without being asked to
 * reach outside its own directory. Failures are returned, not thrown: every one of
 * them maps to an HTTP status the route hands straight back to the browser.
 */
class ImageStore {
    static MAX_BYTES = 10 * 1024 * 1024;

    static DIRECTORY_NAME = '.herdr-web-images';

    static EXTENSION_BY_MIME_TYPE = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
    };

    // Apple's photo formats arrive whenever the browser hands over the original file
    // instead of transcoding it. Agents can't read them and no converter is bundled.
    static UNCONVERTIBLE_MIME_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];

    static MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    static MAX_FILES = 50;

    // only files this store could have written are ever pruned
    static PRUNABLE_FILENAME = /^img-[\dTZ.-]+-[a-z\d]+\.(?:png|jpg|webp|gif)$/;

    constructor({ logger = console } = {}) {
        this.logger = logger;
    }

    static extensionFor(mimeType) {
        const normalized = String(mimeType || '')
            .split(';')[0]
            .trim()
            .toLowerCase();
        if (ImageStore.UNCONVERTIBLE_MIME_TYPES.includes(normalized)) {
            return {
                ok: false,
                status: 415,
                message: 'HEIC/HEIF images are not supported — save or share the photo as JPEG or PNG first.',
            };
        }
        const extension = ImageStore.EXTENSION_BY_MIME_TYPE[normalized];
        if (!extension) {
            const supported = Object.keys(ImageStore.EXTENSION_BY_MIME_TYPE).join(', ');
            return {
                ok: false,
                status: 415,
                message: `Unsupported image type "${normalized || 'unknown'}". Supported: ${supported}.`,
            };
        }
        return { ok: true, extension };
    }

    static fileNameFor(extension) {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const suffix = Math.random().toString(36).slice(2, 8);
        return `img-${timestamp}-${suffix}.${extension}`;
    }

    /**
     * @param {{ buffer: Buffer, mimeType: string, cwd?: string }} request
     * @returns {Promise<{ ok: true, path: string } | { ok: false, status: number, message: string }>}
     */
    async save({ buffer, mimeType, cwd }) {
        const resolvedType = ImageStore.extensionFor(mimeType);
        if (!resolvedType.ok) {
            return resolvedType;
        }
        if (!buffer || buffer.length === 0) {
            return { ok: false, status: 400, message: 'The uploaded image is empty.' };
        }
        if (buffer.length > ImageStore.MAX_BYTES) {
            const limitMb = Math.round(ImageStore.MAX_BYTES / (1024 * 1024));
            return { ok: false, status: 413, message: `Images must be ${limitMb} MB or smaller.` };
        }

        const directory = path.join(await this.resolveBaseDirectory(cwd), ImageStore.DIRECTORY_NAME);
        try {
            await fsp.mkdir(directory, { recursive: true });
            const filePath = path.join(directory, ImageStore.fileNameFor(resolvedType.extension));
            await fsp.writeFile(filePath, buffer, { mode: 0o600 });
            await this.prune(directory);
            return { ok: true, path: filePath };
        } catch (error) {
            this.logger.error(`herdr-web: failed to save image in ${directory}: ${error.message}`);
            return { ok: false, status: 500, message: 'Could not write the image to the pane folder.' };
        }
    }

    // The pane's cwd comes from herdr, not from the browser, but it can still be stale
    // (the folder was renamed or removed), so it is verified before being written into.
    async resolveBaseDirectory(cwd) {
        if (!cwd) {
            return os.homedir();
        }
        try {
            const stats = await fsp.stat(cwd);
            return stats.isDirectory() ? cwd : os.homedir();
        } catch {
            this.logger.error(`herdr-web: pane folder ${cwd} is unreachable — saving to the home directory instead`);
            return os.homedir();
        }
    }

    /** Drops images past the retention window, then any beyond MAX_FILES, oldest first. */
    async prune(directory) {
        try {
            const entries = await fsp.readdir(directory);
            const described = await Promise.all(
                entries
                    .filter((entry) => ImageStore.PRUNABLE_FILENAME.test(entry))
                    .map(async (entry) => {
                        const filePath = path.join(directory, entry);
                        const stats = await fsp.stat(filePath);
                        return { filePath, modifiedMs: stats.mtimeMs };
                    }),
            );

            const cutoffMs = Date.now() - ImageStore.MAX_AGE_MS;
            const expired = described.filter((candidate) => candidate.modifiedMs < cutoffMs);
            const fresh = described
                .filter((candidate) => candidate.modifiedMs >= cutoffMs)
                .sort((left, right) => left.modifiedMs - right.modifiedMs);
            const surplus = fresh.slice(0, Math.max(0, fresh.length - ImageStore.MAX_FILES));

            await Promise.all([...expired, ...surplus].map((candidate) => fsp.unlink(candidate.filePath)));
        } catch (error) {
            // housekeeping must never fail the upload the user is waiting on
            this.logger.error(`herdr-web: failed to prune ${directory}: ${error.message}`);
        }
    }
}

module.exports = { ImageStore };
