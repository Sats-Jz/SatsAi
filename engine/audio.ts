/**
 * WebM/Opus → raw 16-bit PCM (16kHz mono).
 * Uses ffmpeg-static — copies binary to temp dir to avoid EBUSY lock.
 */
import { execFile } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let ffmpegExe: string;

export async function webmToPcm(webmBuffer: Buffer): Promise<Buffer> {
  if (!ffmpegExe) {
    const bundled = require('ffmpeg-static') as string;
    // Copy to temp to avoid EBUSY (Electron locks node_modules files)
    const tmpDir = join(tmpdir(), 'satsai');
    mkdirSync(tmpDir, { recursive: true });
    ffmpegExe = join(tmpDir, 'ffmpeg.exe');
    if (!existsSync(ffmpegExe)) {
      copyFileSync(bundled, ffmpegExe);
    }
    console.log('[Audio] ffmpeg:', ffmpegExe);
  }

  return new Promise((resolve, reject) => {
    const dir = join(tmpdir(), 'satsai');
    mkdirSync(dir, { recursive: true });
    const inFile = join(dir, `${Date.now()}.webm`);
    const outFile = inFile.replace('.webm', '.wav');

    writeFileSync(inFile, webmBuffer);

    execFile(ffmpegExe, [
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
        reject(new Error(`ffmpeg: ${err.message}`));
        return;
      }

      try {
        const wav = readFileSync(outFile);
        unlinkSync(outFile);
        resolve(wav.subarray(44)); // strip WAV header → raw PCM
      } catch (e) {
        reject(new Error(`WAV read: ${(e as Error).message}`));
      }
    });
  });
}
