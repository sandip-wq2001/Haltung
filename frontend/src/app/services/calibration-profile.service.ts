import {Injectable, signal} from '@angular/core';
import type { CalibrationProfile } from '../classifier/calibration-profile';

@Injectable({ providedIn: 'root' })
export class CalibrationProfileService {
  readonly profile = signal<CalibrationProfile | null>(null);

  save(profile: CalibrationProfile): void {
    this.profile.set(profile);
  }
}
