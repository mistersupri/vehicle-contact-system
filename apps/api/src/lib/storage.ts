import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { config, LIMITS } from '../config.ts';
import { AppError } from './http.ts';
import { randomToken } from './security.ts';

/** Antarmuka penyimpanan: implementasi lokal di sini; ganti dengan S3-compatible di produksi. */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
const root = join(config.dataDir, 'uploads');
export const storage: Storage = {
  async put(key, data) { await mkdir(root, { recursive: true }); await writeFile(join(root, key), data); },
  async get(key) { return readFile(join(root, key.replace(/[^a-zA-Z0-9._-]/g, ''))); },
  async remove(key) { await rm(join(root, key.replace(/[^a-zA-Z0-9._-]/g, '')), { force: true }); },
};

const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const MIME: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Validasi isi file (bukan ekstensi), buang EXIF/GPS lewat re-encode, buat thumbnail,
 * dan simpan dengan nama acak.
 */
export async function processImage(input: Buffer) {
  if (input.length > LIMITS.photoBytesMax) throw new AppError(400, 'FILE_TOO_LARGE', 'Ukuran foto maksimal 5 MB');
  let meta;
  try { meta = await sharp(input, { failOn: 'error', limitInputPixels: 50_000_000 }).metadata(); }
  catch { throw new AppError(400, 'INVALID_IMAGE', 'File bukan gambar yang valid'); }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new AppError(400, 'INVALID_IMAGE_TYPE', 'Format foto harus JPG, PNG, atau WebP');

  // Re-encode tanpa metadata (sharp membuang EXIF secara default); rotate() menormalkan orientasi.
  const base = sharp(input).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true });
  const fmt = meta.format as 'jpeg' | 'png' | 'webp';
  const full = await base.clone().toFormat(fmt, fmt === 'jpeg' ? { quality: 85 } : {}).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: 400, height: 400, fit: 'inside' }).webp({ quality: 70 }).toBuffer();

  const id = randomToken(18);
  const storageKey = `${id}.${fmt === 'jpeg' ? 'jpg' : fmt}`;
  const thumbKey = `${id}.thumb.webp`;
  await storage.put(storageKey, full.data);
  await storage.put(thumbKey, thumb);
  return { storageKey, thumbKey, mime: MIME[fmt], size: full.data.length, width: full.info.width, height: full.info.height };
}
