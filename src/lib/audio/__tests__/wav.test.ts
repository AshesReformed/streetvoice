import { describe, it, expect } from 'vitest';
import { encodeMp3, encodeWav } from '@/lib/audio/wav';

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

describe('encodeMp3', () => {
  it('produces MP3 frames about 8 times smaller than WAV', () => {
    const seconds = 3;
    const samples = new Float32Array(16000 * seconds).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000));
    const mp3 = encodeMp3(samples, 16000);

    // MPEG frame sync: 11 set bits
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
    // 32 kbps = 4 KB a second, WAV = 32 KB a second
    expect(mp3.length).toBeGreaterThan(3_000 * seconds);
    expect(mp3.length).toBeLessThan(5_000 * seconds);
    expect(encodeWav(samples, 16000).length / mp3.length).toBeGreaterThan(6);
  });
});
