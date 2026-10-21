// Server-side check of an uploaded recording's format, by its first bytes.

/** The upload's format from its first bytes, or null if it isn't audio we take. */
export function audioFormat(bytes: Uint8Array): { ext: 'wav' | 'mp3'; contentType: string } | null {
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length > 44 && tag(0) === 'RIFF' && tag(8) === 'WAVE') {
    return { ext: 'wav', contentType: 'audio/wav' };
  }
  const id3 = bytes.length > 3 && String.fromCharCode(...bytes.subarray(0, 3)) === 'ID3';
  const frameSync = bytes.length > 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (id3 || frameSync) return { ext: 'mp3', contentType: 'audio/mpeg' };
  return null;
}
