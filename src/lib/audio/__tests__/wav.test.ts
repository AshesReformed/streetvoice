import { describe, it, expect } from 'vitest';
import { encodeWav } from '@/lib/audio/wav';

describe('encodeWav', () => {
  it('writes a valid 16-bit mono PCM WAV header and clamps samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5]), 16000);
    const view = new DataView(wav.buffer);
    const tag = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4));

    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(36)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(12);
    expect(wav.length).toBe(44 + 12);

    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });
});
