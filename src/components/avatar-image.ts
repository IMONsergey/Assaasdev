/** Local avatar images never enter a profile request or leave the browser. */
export const AVATAR_FILE_LIMIT = 5 * 1024 * 1024;
export const AVATAR_DIMENSION_LIMIT = 8192;
export const AVATAR_PIXEL_LIMIT = 24_000_000;
export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_DATA_LIMIT = 384 * 1024;
export const AVATAR_FILE_ACCEPT = 'image/png,image/jpeg,image/webp';

type RasterType = 'image/png' | 'image/jpeg' | 'image/webp';
type RasterInfo = { type: RasterType; width: number; height: number; animated?: boolean };
const formatError = 'Choose a PNG, JPG or WebP image.';
const corruptError = 'This image could not be opened. Try another PNG, JPG or WebP file.';

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

/** Read dimensions before decoding, so oversized compressed images are never rendered. */
export function inspectAvatarRaster(bytes: Uint8Array): RasterInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(bytes, 1, 8) === 'PNG\r\n\u001a\n' && ascii(bytes, 12, 16) === 'IHDR') {
    let animated = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = view.getUint32(offset);
      if (offset + 12 + size > bytes.length) throw new Error(corruptError);
      if (ascii(bytes, offset + 4, offset + 8) === 'acTL') animated = true;
      offset += size + 12;
    }
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20), animated };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) throw new Error(corruptError);
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error(corruptError);
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 8) throw new Error(corruptError);
        return { type: 'image/jpeg', height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += length;
    }
    throw new Error(corruptError);
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    if (view.getUint32(4, true) + 8 > bytes.length) throw new Error(corruptError);
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const type = ascii(bytes, offset, offset + 4), length = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + length > bytes.length) throw new Error(corruptError);
      if (type === 'VP8X' && length >= 10) return { type: 'image/webp', width: 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16), height: 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16), animated: !!(bytes[start] & 2) };
      if (type === 'VP8 ' && length >= 10 && bytes[start + 3] === 157 && bytes[start + 4] === 1 && bytes[start + 5] === 42) return { type: 'image/webp', width: view.getUint16(start + 6, true) & 16383, height: view.getUint16(start + 8, true) & 16383 };
      if (type === 'VP8L' && length >= 5 && bytes[start] === 47) return { type: 'image/webp', width: 1 + bytes[start + 1] + ((bytes[start + 2] & 63) << 8), height: 1 + (bytes[start + 2] >> 6) + (bytes[start + 3] << 2) + ((bytes[start + 4] & 15) << 10) };
      offset = start + length + (length % 2);
    }
    throw new Error(corruptError);
  }
  throw new Error(formatError);
}

export function validateAvatarFile(file: Pick<File, 'size' | 'type'>, bytes: Uint8Array) {
  if (file.size > AVATAR_FILE_LIMIT) throw new Error('Choose an image smaller than 5 MB.');
  if (!file.size || !bytes.length) throw new Error('This file is empty. Choose another image.');
  if (!AVATAR_FILE_ACCEPT.split(',').includes(file.type)) throw new Error(formatError);
  const info = inspectAvatarRaster(bytes);
  if (info.type !== file.type) throw new Error(formatError);
  if (!info.width || !info.height) throw new Error(corruptError);
  if (info.width > AVATAR_DIMENSION_LIMIT || info.height > AVATAR_DIMENSION_LIMIT || info.width * info.height > AVATAR_PIXEL_LIMIT) throw new Error('This image is too large. Use up to 8,192 pixels per side and 24 megapixels.');
  if (info.animated) throw new Error('Choose a still image. Animated avatars are not supported.');
  return info;
}

export function isAvatarDataUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > AVATAR_DATA_LIMIT || !/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const binary = atob(value.slice(value.indexOf(',') + 1));
    const info = inspectAvatarRaster(Uint8Array.from(binary, char => char.charCodeAt(0)));
    return value.startsWith(`data:${info.type};`) && !info.animated && info.width > 0 && info.height > 0 && info.width <= AVATAR_OUTPUT_SIZE && info.height <= AVATAR_OUTPUT_SIZE;
  } catch { return false; }
}

/** Center crop, downsize, and encode fresh pixels, dropping EXIF, filenames and other metadata. */
export async function prepareAvatarImage(file: File): Promise<string> {
  if (file.size > AVATAR_FILE_LIMIT) throw new Error('Choose an image smaller than 5 MB.');
  if (!AVATAR_FILE_ACCEPT.split(',').includes(file.type)) throw new Error(formatError);
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateAvatarFile(file, bytes);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error(corruptError); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > AVATAR_DIMENSION_LIMIT || image.naturalHeight > AVATAR_DIMENSION_LIMIT || image.naturalWidth * image.naturalHeight > AVATAR_PIXEL_LIMIT) throw new Error(corruptError);
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare your image. Try another browser.');
    for (const size of [AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE / 2]) {
      canvas.width = canvas.height = Math.min(size, crop);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/webp', .86);
      if (isAvatarDataUrl(dataUrl)) return dataUrl;
    }
    throw new Error('This image could not be saved at avatar size. Try a simpler image.');
  } finally { URL.revokeObjectURL(url); }
}
