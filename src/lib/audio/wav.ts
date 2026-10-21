import { Mp3Encoder } from '@breezystack/lamejs';

// Browser-side audio helpers for the web phone simulator. Browsers record
// in WebM/Opus, which the AI doesn't accept, so recordings are decoded,
// mixed to mono, resampled to 16 kHz and re-encoded. MP3 at 32 kbps is the
// default: about 0.24 MB a minute instead of WAV's 1.9 MB, so free storage
// holds roughly 8 times more calls, and speech stays clear for the AI.

export const TARGET_SAMPLE_RATE = 16000;
export const MP3_KBPS = 32;
const MP3_BLOCK = 1152; // samples per MP3 frame

/** Encode mono float samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeTag = (offset: number, tag: string) => {
    for (let i = 0; i < tag.length; i++) view.setUint8(offset + i, tag.charCodeAt(i));
  };

  writeTag(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeTag(8, 'WAVE');
  writeTag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/** Encode mono float samples (-1..1) as a constant-bitrate MP3 file. */
export function encodeMp3(samples: Float32Array, sampleRate: number, kbps = MP3_KBPS): Uint8Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += MP3_BLOCK) {
    const frame = encoder.encodeBuffer(pcm.subarray(i, i + MP3_BLOCK));
    if (frame.length) parts.push(frame);
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(tail);

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Decode any browser-recorded blob and return it as 16 kHz mono MP3. */
export async function blobToMp3(blob: Blob): Promise<Blob> {
  const samples = await decodeMono(blob);
  const mp3 = encodeMp3(samples, TARGET_SAMPLE_RATE);
  return new Blob([mp3.buffer as ArrayBuffer], { type: 'audio/mpeg' });
}

/** Decode any browser-recorded blob and return it as 16 kHz mono WAV. */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const wav = encodeWav(await decodeMono(blob), TARGET_SAMPLE_RATE);
  return new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });
}

/** Decode, mix down to mono and resample to TARGET_SAMPLE_RATE. */
async function decodeMono(blob: Blob): Promise<Float32Array> {
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
    // Rendering through a 1-channel offline context mixes down and resamples
    const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    await decoder.close();
  }
}
