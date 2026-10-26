import sharp from 'sharp';
import { AuthError } from './auth-errors';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_INPUT_PIXELS = 16000000;

/** Acquired before multipart parsing: only one in-memory upload/transform at once. */
export class ImageWorkQueue {
  private active = false;
  private waiting: Array<(release: () => void) => void> = [];
  async acquire(): Promise<() => void> {
    if (this.active) {
      if (this.waiting.length >= 2)
        throw new AuthError(503, 'IMAGE_PROCESSING_BUSY', 1);
      return new Promise((resolve) => this.waiting.push(resolve));
    }
    this.active = true;
    return this.releaseHandle();
  }
  private releaseHandle(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next(this.releaseHandle());
      else this.active = false;
    };
  }
}

export function imageFormat(buffer: Buffer): 'jpeg' | 'png' | 'webp' {
  if (buffer.length < 3 || buffer.length > MAX_UPLOAD_BYTES)
    throw new AuthError(
      buffer.length > MAX_UPLOAD_BYTES ? 413 : 400,
      buffer.length > MAX_UPLOAD_BYTES ? 'PAYLOAD_TOO_LARGE' : 'INVALID_IMAGE',
    );
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'jpeg';
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    let offset = 8;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const chunk = buffer.toString('ascii', offset + 4, offset + 8);
      if (
        length > buffer.length - offset - 12 ||
        ['acTL', 'fcTL', 'fdAT'].includes(chunk)
      )
        throw new AuthError(400, 'INVALID_IMAGE');
      offset += length + 12;
      if (chunk === 'IEND') break;
    }
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    if (buffer.readUInt32LE(4) + 8 !== buffer.length)
      throw new AuthError(400, 'INVALID_IMAGE');
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const chunk = buffer.toString('ascii', offset, offset + 4);
      const length = buffer.readUInt32LE(offset + 4);
      if (
        length > buffer.length - offset - 8 ||
        chunk === 'ANIM' ||
        chunk === 'ANMF' ||
        (chunk === 'VP8X' && length > 0 && (buffer[offset + 8]! & 2) !== 0)
      )
        throw new AuthError(400, 'INVALID_IMAGE');
      offset += 8 + length + (length % 2);
    }
    return 'webp';
  }
  // SVG/XML/GIF/other formats never reach a decoder regardless of MIME/filename.
  throw new AuthError(400, 'INVALID_IMAGE');
}

export async function sanitizeImage(buffer: Buffer) {
  const expected = imageFormat(buffer);
  try {
    const input = sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'warning',
      animated: false,
    });
    const metadata = await input.metadata();
    if (
      metadata.format !== expected ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS ||
      (metadata.pages ?? 1) > 1
    )
      throw new AuthError(400, 'INVALID_IMAGE');
    const image = input.rotate().resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    });
    for (const quality of [82, 60, 40, 20]) {
      // No withMetadata/keepMetadata: source EXIF, GPS and ICC are stripped.
      const { data, info } = await image
        .clone()
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= MAX_IMAGE_BYTES)
        return {
          data,
          width: info.width,
          height: info.height,
          sizeBytes: data.length,
        };
    }
    throw new AuthError(413, 'PAYLOAD_TOO_LARGE');
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(400, 'INVALID_IMAGE');
  }
}
