/**
 * WebM/Opus → raw 16-bit PCM. Uses prism-media + @discordjs/opus.
 */
import { opus } from 'prism-media';
import { Writable } from 'stream';

export function webmToPcm(webmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const demuxer = new opus.WebmDemuxer();
    const decoder = new opus.Decoder({ rate: 16000, channels: 1, frameSize: 960 });
    const chunks: Buffer[] = [];
    const collector = new Writable({
      write(chunk: Buffer, _e: string, cb: () => void) { chunks.push(chunk); cb(); },
    });
    collector.on('finish', () => resolve(Buffer.concat(chunks)));
    [collector, demuxer, decoder].forEach(s => s.on('error', reject));
    demuxer.pipe(decoder).pipe(collector);
    demuxer.write(webmBuffer);
    demuxer.end();
  });
}
