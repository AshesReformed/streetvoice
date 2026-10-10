// Browser-side audio helpers for the web phone simulator. Browsers record
// in WebM/Opus, which the AI doesn't accept, so recordings are decoded,
// mixed to mono, resampled and re-encoded as 16-bit PCM WAV.

export const TARGET_SAMPLE_RATE = 16000;

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

/** Decode any browser-recorded blob and return it as 16 kHz mono WAV. */
export async function blobToWav(blob: Blob): Promise<Blob> {
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
    const wav = encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
    return new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });
  } finally {
    await decoder.close();
  }
}
