/**
 * WebM/Opus → raw 16-bit PCM (16kHz mono).
 * Uses ffmpeg-static (bundled binary, no system install needed).
 */
import { execFile } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let ffmpegPath: string;

export async function webmToPcm(webmBuffer: Buffer): Promise<Buffer> {
  if (!ffmpegPath) {
    ffmpegPath = require('ffmpeg-static') as string;
    console.log('[Audio] ffmpeg:', ffmpegPath);
  }

  return new Promise((resolve, reject) => {
    const dir = join(tmpdir(), 'satsai');
    mkdirSync(dir, { recursive: true });
    const inFile = join(dir, `${Date.now()}.webm`);
    const outFile = inFile.replace('.webm', '.wav');

    writeFileSync(inFile, webmBuffer);

    execFile(ffmpegPath, [
      '-y', '-i', inFile,
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      outFile,
    ], { timeout: 10000 }, (err) => {
      try { unlinkSync(inFile); } catch {}

      if (err) {
        try { unlinkSync(outFile); } catch {}
        reject(new Error(`ffmpeg conversion failed: ${err.message}`));
        return;
      }

      try {
        const wav = readFileSync(outFile);
        unlinkSync(outFile);
        // Strip 44-byte WAV header → raw PCM
        resolve(wav.subarray(44));
      } catch (e) {
        reject(new Error(`Failed to read converted WAV: ${(e as Error).message}`));
      }
    });
  });
}
