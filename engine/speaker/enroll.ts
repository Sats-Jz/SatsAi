import type { SpeakerModel } from './model';
import { MockSpeakerModel } from './model';

export class SpeakerEnroller {
  private phrases: string[] = [];
  private embeddings: Float32Array[] = [];
  private processedIndices: Set<number> = new Set();
  private model: SpeakerModel;

  constructor(model?: SpeakerModel) {
    this.model = model || new MockSpeakerModel();
  }

  /** Replace the embedding model (e.g., with ONNXSpeakerModel). */
  setModel(model: SpeakerModel): void {
    this.model = model;
  }

  /** Get the current model (used by Engine for live verification). */
  getModel(): SpeakerModel {
    return this.model;
  }

  setPhrases(phrases: string[]): void {
    this.phrases = phrases;
    this.embeddings = [];
    this.processedIndices.clear();
  }

  getPhrases(): string[] { return this.phrases; }
  getProgress(): number { return this.processedIndices.size; }
  isComplete(): boolean {
    return this.processedIndices.size === this.phrases.length && this.phrases.length > 0;
  }

  async submitAudio(phraseIndex: number, audioBuffer: Buffer): Promise<void> {
    if (phraseIndex < 0 || phraseIndex >= this.phrases.length) {
      throw new Error(`Invalid phrase index: ${phraseIndex}`);
    }
    const embedding = await this.model.extractEmbedding(audioBuffer);
    this.embeddings.push(embedding);
    this.processedIndices.add(phraseIndex);
  }

  getEmbedding(): Float32Array | null {
    if (!this.isComplete()) return null;
    const dim = this.embeddings[0].length;
    const averaged = new Float32Array(dim);
    for (const emb of this.embeddings) {
      for (let i = 0; i < dim; i++) averaged[i] += emb[i] / this.embeddings.length;
    }
    return averaged;
  }

  reset(): void {
    this.embeddings = [];
    this.processedIndices.clear();
  }
}
