import { Injectable, signal } from '@angular/core';
import type { ScreenBaseline } from '../classifier/attention-baseline';

@Injectable({ providedIn: 'root' })
export class ScreenBaselineService {
  readonly baseline = signal<ScreenBaseline | null>(null);

  save(baseline: ScreenBaseline): void {
    this.baseline.set(baseline);
  }
}
