/**
 * Decode WebM/Opus → raw 16-bit PCM (16kHz mono).
 * Returns Int16 PCM bytes — STTClient wraps in WAV header if needed.
 */
export async function webmToPcm(blob: Blob): Promise<ArrayBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const channel = audioBuffer.getChannelData(0);
  ctx.close();

  const byteLen = channel.length * 2;
  const buf = new ArrayBuffer(byteLen);
  const view = new DataView(buf);
  for (let i = 0; i < channel.length; i++) {
    view.setInt16(i * 2, Math.max(-1, Math.min(1, channel[i])) * 0x7FFF, true);
  }
  return buf;
}
