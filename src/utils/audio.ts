/**
 * Audio utilities for the renderer process.
 * Converts WebM/Opus (MediaRecorder output) → WAV PCM (STT API input).
 * Runs entirely in-browser via Web Audio API — no native binaries needed.
 */

/** Decode a WebM blob to a raw Float32Array of PCM samples. */
async function decodeWebM(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();

  // Get mono channel
  const channel = audioBuffer.getChannelData(0);
  return { samples: channel, sampleRate: audioBuffer.sampleRate };
}

/** Convert Float32Array PCM samples to 16-bit WAV buffer. */
function pcmToWav(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataLength = samples.length * 2; // 16-bit = 2 bytes per sample
  const headerSize = 44;
  const totalSize = headerSize + dataLength;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // byte rate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // block align
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write samples as 16-bit PCM
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Convert a WebM/Opus audio blob to WAV PCM (base64-encoded).
 * Call this in the renderer before sending audio to the engine via IPC.
 */
export async function webmBlobToWavBase64(blob: Blob): Promise<string> {
  const { samples, sampleRate } = await decodeWebM(blob);
  const wavBuffer = pcmToWav(samples, sampleRate);
  const bytes = new Uint8Array(wavBuffer);
  // base64 encode
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
