/**
 * Convert WebM/Opus → raw 16-bit PCM using prism-media.
 * Runs in the Electron main process — no browser AudioContext.
 */
import { opus } from 'prism-media';
import { Writable } from 'stream';

export function webmToPcm(webmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const demuxer = new opus.WebmDemuxer();
    const decoder = new opus.Decoder({ rate: 16000, channels: 1, frameSize: 960 });

    const chunks: Buffer[] = [];
    const collector = new Writable({
      write(chunk: Buffer, _encoding: string, cb: () => void) {
        chunks.push(chunk);
        cb();
      },
    });

    collector.on('finish', () => resolve(Buffer.concat(chunks)));
    collector.on('error', reject);
    demuxer.on('error', reject);
    decoder.on('error', reject);

    demuxer.pipe(decoder).pipe(collector);
    demuxer.write(webmBuffer);
    demuxer.end();
  });
}
