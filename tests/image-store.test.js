'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const { ImageStore } = require('../lib/image-store');

const PNG_MIME = 'image/png';
const SILENT_LOGGER = { error: () => {} };

describe('ImageStore', () => {
  let paneDir;
  let store;

  beforeEach(() => {
    paneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-web-images-'));
    store = new ImageStore({ logger: SILENT_LOGGER });
  });

  afterEach(() => {
    fs.rmSync(paneDir, { recursive: true, force: true });
  });

  const imageDir = () => path.join(paneDir, ImageStore.DIRECTORY_NAME);

  describe('save', () => {
    test('writes the image into <cwd>/.herdr-web-images and returns its path', async () => {
      const result = await store.save({ buffer: Buffer.from('png'), mimeType: PNG_MIME, cwd: paneDir });

      assert.equal(result.ok, true);
      assert.equal(path.dirname(result.path), imageDir());
      assert.equal(fs.readdirSync(imageDir()).length, 1);
    });

    test('names files img-<timestamp>-<suffix>.<ext> and never reuses a name', async () => {
      const first = await store.save({ buffer: Buffer.from('a'), mimeType: PNG_MIME, cwd: paneDir });
      const second = await store.save({ buffer: Buffer.from('b'), mimeType: PNG_MIME, cwd: paneDir });

      assert.match(path.basename(first.path), /^img-[\dTZ.-]+-[a-z\d]{6}\.png$/);
      assert.notEqual(first.path, second.path);
    });

    test('maps every supported mime type to its extension', async () => {
      const cases = [
        ['image/png', '.png'],
        ['image/jpeg', '.jpg'],
        ['image/webp', '.webp'],
        ['image/gif', '.gif'],
      ];

      for (const [mimeType, extension] of cases) {
        const result = await store.save({ buffer: Buffer.from('x'), mimeType, cwd: paneDir });
        assert.equal(path.extname(result.path), extension);
      }
    });

    test('tolerates a content-type with parameters and odd casing', async () => {
      const result = await store.save({ buffer: Buffer.from('x'), mimeType: 'IMAGE/PNG; charset=binary', cwd: paneDir });

      assert.equal(result.ok, true);
      assert.equal(path.extname(result.path), '.png');
    });

    test('falls back to the home directory when the pane folder is unknown', async () => {
      const result = await store.save({ buffer: Buffer.from('x'), mimeType: PNG_MIME });

      assert.equal(result.ok, true);
      assert.equal(path.dirname(result.path), path.join(os.homedir(), ImageStore.DIRECTORY_NAME));
      fs.rmSync(result.path, { force: true });
    });

    test('falls back to the home directory when the pane folder no longer exists', async () => {
      const result = await store.save({
        buffer: Buffer.from('x'),
        mimeType: PNG_MIME,
        cwd: path.join(paneDir, 'gone'),
      });

      assert.equal(result.ok, true);
      assert.equal(path.dirname(result.path), path.join(os.homedir(), ImageStore.DIRECTORY_NAME));
      fs.rmSync(result.path, { force: true });
    });
  });

  describe('validation', () => {
    test('refuses HEIC with an actionable message', async () => {
      const result = await store.save({ buffer: Buffer.from('x'), mimeType: 'image/heic', cwd: paneDir });

      assert.equal(result.ok, false);
      assert.equal(result.status, 415);
      assert.match(result.message, /JPEG or PNG/);
    });

    test('refuses an unsupported type', async () => {
      const result = await store.save({ buffer: Buffer.from('x'), mimeType: 'application/pdf', cwd: paneDir });

      assert.equal(result.status, 415);
      assert.match(result.message, /Unsupported image type/);
    });

    test('refuses an empty upload', async () => {
      const result = await store.save({ buffer: Buffer.alloc(0), mimeType: PNG_MIME, cwd: paneDir });

      assert.equal(result.status, 400);
      assert.match(result.message, /empty/);
    });

    test('refuses an upload above the size cap', async () => {
      const result = await store.save({
        buffer: Buffer.alloc(ImageStore.MAX_BYTES + 1),
        mimeType: PNG_MIME,
        cwd: paneDir,
      });

      assert.equal(result.status, 413);
      assert.match(result.message, /10 MB or smaller/);
    });

    test('nothing is written when validation fails', async () => {
      await store.save({ buffer: Buffer.from('x'), mimeType: 'image/heic', cwd: paneDir });

      assert.equal(fs.existsSync(imageDir()), false);
    });
  });

  describe('prune', () => {
    const writeAged = async (name, ageMs) => {
      const filePath = path.join(imageDir(), name);
      await fsp.writeFile(filePath, 'x');
      const modified = new Date(Date.now() - ageMs);
      await fsp.utimes(filePath, modified, modified);
      return filePath;
    };

    beforeEach(() => {
      fs.mkdirSync(imageDir(), { recursive: true });
    });

    test('deletes images past the retention window', async () => {
      const stale = await writeAged('img-2020-01-01T00-00-00.000Z-abc123.png', 8 * 24 * 60 * 60 * 1000);

      await store.save({ buffer: Buffer.from('new'), mimeType: PNG_MIME, cwd: paneDir });

      assert.equal(fs.existsSync(stale), false);
      assert.equal(fs.readdirSync(imageDir()).length, 1);
    });

    test('caps the folder at 50 images, deleting the oldest first', async () => {
      const oldest = await writeAged('img-2026-01-01T00-00-00.000Z-aaa000.png', 52_000);
      for (let index = 1; index < 52; index += 1) {
        await writeAged(`img-2026-01-01T00-00-00.000Z-aaa${String(index).padStart(3, '0')}.png`, (52 - index) * 1000);
      }

      await store.save({ buffer: Buffer.from('new'), mimeType: PNG_MIME, cwd: paneDir });

      assert.equal(fs.readdirSync(imageDir()).length, 50);
      assert.equal(fs.existsSync(oldest), false);
    });

    test('leaves files it did not write alone', async () => {
      const keep = path.join(imageDir(), 'notes.txt');
      await fsp.writeFile(keep, 'keep me');
      const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await fsp.utimes(keep, longAgo, longAgo);

      await store.save({ buffer: Buffer.from('new'), mimeType: PNG_MIME, cwd: paneDir });

      assert.equal(fs.existsSync(keep), true);
    });
  });
});
