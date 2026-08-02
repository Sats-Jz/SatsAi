export class SpeakerEnroller {
  private phrases: string[] = [];
  private embeddings: Float32Array[] = [];
  private processedIndices: Set<number> = new Set();

  setPhrases(phrases: string[]): void {
    this.phrases = phrases;
    this.embeddings = [];
    this.processedIndices.clear();
  }

  getPhrases(): string[] { return this.phrases; }
  getProgress(): number { return this.processedIndices.size; }
  isComplete(): boolean { return this.processedIndices.size === this.phrases.length && this.phrases.length > 0; }

  submitAudio(phraseIndex: number, audioBuffer: Buffer): void {
    if (phraseIndex < 0 || phraseIndex >= this.phrases.length) {
      throw new Error(`Invalid phrase index: ${phraseIndex}`);
    }
    const embedding = this.extractEmbedding(audioBuffer);
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

  private extractEmbedding(buffer: Buffer): Float32Array {
    const dim = 256;
    const embedding = new Float32Array(dim);
    let rms = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i) / 32768;
      rms += sample * sample;
    }
    rms = Math.sqrt(rms / (buffer.length / 2));
    for (let i = 0; i < dim; i++) {
      embedding[i] = Math.sin(rms * (i + 1) * 0.1) * 0.5 + 0.5;
    }
    return embedding;
  }

  reset(): void {
    this.embeddings = [];
    this.processedIndices.clear();
  }
}
