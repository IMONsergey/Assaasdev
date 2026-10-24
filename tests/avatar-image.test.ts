import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVATAR_DATA_LIMIT, AVATAR_FILE_LIMIT, inspectAvatarRaster, isAvatarDataUrl, validateAvatarFile } from '../src/components/avatar-image';

const fixture = (format: string) => readFileSync(new URL(`./fixtures/avatars/portrait.${format}`, import.meta.url));
describe('local avatar raster validation', () => {
  it.each([['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp']])('reads actual %s dimensions before decoding', (format, type) => {
    const bytes = fixture(format);
    expect(validateAvatarFile({ size: bytes.length, type }, bytes)).toMatchObject({ type, width: 192, height: 256 });
  });
  it('rejects SVG and disguised content even when the supplied MIME type is allowed', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(() => validateAvatarFile({ size: svg.length, type: 'image/svg+xml' }, svg)).toThrow('PNG, JPG or WebP');
    expect(() => validateAvatarFile({ size: svg.length, type: 'image/png' }, svg)).toThrow('PNG, JPG or WebP');
    const png = fixture('png');
    expect(() => validateAvatarFile({ size: png.length, type: 'image/jpeg' }, png)).toThrow('PNG, JPG or WebP');
  });
  it('bounds source size, dimensions and total pixel count before native image decoding', () => {
    expect(() => validateAvatarFile({ size: AVATAR_FILE_LIMIT + 1, type: 'image/png' }, new Uint8Array())).toThrow('5 MB');
    const wide = fixture('png'); wide.writeUInt32BE(8193, 16);
    expect(() => validateAvatarFile({ size: wide.length, type: 'image/png' }, wide)).toThrow('8,192');
    const pixels = fixture('png'); pixels.writeUInt32BE(6000, 16); pixels.writeUInt32BE(5000, 20);
    expect(() => validateAvatarFile({ size: pixels.length, type: 'image/png' }, pixels)).toThrow('24 megapixels');
  });
  it('rejects empty, truncated and animated files', () => {
    expect(() => validateAvatarFile({ size: 0, type: 'image/png' }, new Uint8Array())).toThrow('empty');
    expect(() => inspectAvatarRaster(fixture('png').subarray(0, 24))).toThrow('could not be opened');
    const png = fixture('png'), chunk = Buffer.alloc(12); chunk.write('acTL', 4);
    const animated = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
    expect(() => validateAvatarFile({ size: animated.length, type: 'image/png' }, animated)).toThrow('still image');
  });
  it('permits only bounded inline PNG/WebP raster data in persisted selections', () => {
    expect(isAvatarDataUrl(`data:image/webp;base64,${fixture('webp').toString('base64')}`)).toBe(true);
    for (const value of ['https://example.test/avatar.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,aGVsbG8=', 'data:image/png;base64,', 'data:image/png;base64,aGVsbG8=', 'data:image/png;base64,' + 'A'.repeat(AVATAR_DATA_LIMIT)]) expect(isAvatarDataUrl(value)).toBe(false);
    const oversized = fixture('png'); oversized.writeUInt32BE(1024, 16);
    expect(isAvatarDataUrl(`data:image/png;base64,${oversized.toString('base64')}`)).toBe(false);
  });
});
