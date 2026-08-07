export const STATE_COMMIT_MS = 1_500;

export class StateSmoother<T> {
  private committed: T | null = null;
  private candidate: T | null = null;
  private candidateSince = 0;

  update(raw: T | null, tMs: number): T | null {
    if (raw === null) {
      this.committed = null;
      this.candidate = null;
      return null;
    }

    if (this.committed === null || raw === this.committed) {
      this.committed = raw;
      this.candidate = null;
      return this.committed;
    }

    if (raw !== this.candidate) {
      this.candidate = raw;
      this.candidateSince = tMs;
    }

    if (tMs - this.candidateSince >= STATE_COMMIT_MS) {
      this.committed = raw;
      this.candidate = null;
    }

    return this.committed;
  }
}
