import type { VerificationResult } from '../types';

export interface VerifierConfig {
  threshold: number;
}

export class SpeakerVerifier {
  private threshold: number;

  constructor(config: VerifierConfig) {
    this.threshold = config.threshold;
  }

  verify(enrolled: Float32Array, candidate: Float32Array): VerificationResult {
    const score = this.cosineSimilarity(enrolled, candidate);
    return { passed: score >= this.threshold, score, threshold: this.threshold };
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) throw new Error('Embedding dimensions do not match');
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    if (normA === 0 || normB === 0) return 0;
    return (dotProduct / (normA * normB) + 1) / 2;
  }

  setThreshold(threshold: number): void { this.threshold = Math.max(0, Math.min(1, threshold)); }
  getThreshold(): number { return this.threshold; }
}
