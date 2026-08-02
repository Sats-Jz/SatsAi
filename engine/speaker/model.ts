/**
 * Speaker embedding model interface.
 *
 * Production path: ECAPA-TDNN via ONNX Runtime (~50MB model file).
 *   npm install onnxruntime-node
 *   Download from: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb
 *
 * For now, the mock implementation uses RMS-based deterministic embedding
 * so the enrollment/verification pipeline works end-to-end without a model file.
 */

export interface SpeakerModel {
  /** Extract a 256-dim embedding vector from 16kHz 16-bit mono PCM audio. */
  extractEmbedding(audioBuffer: Buffer): Promise<Float32Array>;
}

/**
 * Mock speaker model: uses audio RMS + sine function to generate a
 * deterministic but non-meaningful 256-dim embedding.
 *
 * Replace with ONNXSpeakerModel for production use.
 */
export class MockSpeakerModel implements SpeakerModel {
  private readonly dim = 256;

  async extractEmbedding(audioBuffer: Buffer): Promise<Float32Array> {
    // Compute RMS energy
    let rms = 0;
    for (let i = 0; i < audioBuffer.length; i += 2) {
      const sample = audioBuffer.readInt16LE(i) / 32768;
      rms += sample * sample;
    }
    rms = Math.sqrt(rms / (audioBuffer.length / 2 || 1));

    // Generate deterministic pseudo-embedding from audio characteristics
    const embedding = new Float32Array(this.dim);
    for (let i = 0; i < this.dim; i++) {
      embedding[i] = Math.sin(rms * (i + 1) * 0.1) * 0.5 + 0.5;
    }
    return embedding;
  }
}

/**
 * ONNX-based ECAPA-TDNN speaker embedding extractor.
 *
 * Usage (after npm install onnxruntime-node + model download):
 *   const model = new ONNXSpeakerModel('./models/speaker.onnx');
 *   const emb = await model.extractEmbedding(audioBuffer);
 */
export class ONNXSpeakerModel implements SpeakerModel {
  private modelPath: string;
  private session: unknown = null;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  async load(): Promise<void> {
    // const ort = await import('onnxruntime-node');
    // this.session = await ort.InferenceSession.create(this.modelPath);
    throw new Error(
      'ONNX model not yet loaded. Install onnxruntime-node and download the ECAPA-TDNN model.'
    );
  }

  async extractEmbedding(_audioBuffer: Buffer): Promise<Float32Array> {
    if (!this.session) await this.load();
    // const feeds = { input: preprocessedTensor };
    // const results = await this.session.run(feeds);
    // return new Float32Array(results.embedding.data);
    throw new Error('ONNX inference not implemented');
  }
}
