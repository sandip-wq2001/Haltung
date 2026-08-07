import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { isScreenBaseline, type ScreenBaseline } from '../classifier/attention-baseline';
import { isCalibrationProfile, type CalibrationProfile } from '../classifier/calibration-profile';
import { CalibrationProfileService } from './calibration-profile.service';
import { ScreenBaselineService } from './screen-baseline.service';

const PROFILE_URL = 'http://127.0.0.1:8000/profile';
const LATEST_URL = `${PROFILE_URL}/latest`;
const LOCAL_KEY = 'haltung.profile';

interface StoredProfile {
  profile: CalibrationProfile;
  screenBaseline: ScreenBaseline;
}

@Injectable({ providedIn: 'root' })
export class ProfilePersistence {
  private readonly http = inject(HttpClient);
  private readonly profiles = inject(CalibrationProfileService);
  private readonly baselines = inject(ScreenBaselineService);

  save(profile: CalibrationProfile, screenBaseline: ScreenBaseline): void {
    const stored: StoredProfile = { profile, screenBaseline };

    localStorage.setItem(LOCAL_KEY, JSON.stringify(stored));

    this.http.post(PROFILE_URL, stored).subscribe({
      error: () => console.warn('[Profile] backend unreachable, kept in localStorage only'),
    });
  }

  restore(): void {
    this.http.get<StoredProfile>(LATEST_URL).subscribe({
      next: (stored) => {
        if (!this.apply(stored)) {
          console.warn('[Profile] backend returned an invalid profile, trying localStorage');
          this.restoreLocal();
        }
      },
      error: () => this.restoreLocal(),
    });
  }

  private restoreLocal(): void {
    const raw = localStorage.getItem(LOCAL_KEY);

    if (!raw) {
      return;
    }

    try {
      if (!this.apply(JSON.parse(raw) as unknown)) {
        console.warn('[Profile] ignored invalid localStorage profile');
        localStorage.removeItem(LOCAL_KEY);
      }
    } catch {
      console.warn('[Profile] ignored unreadable localStorage profile');
      localStorage.removeItem(LOCAL_KEY);
    }
  }

  private apply(stored: unknown): stored is StoredProfile {
    if (!isRecord(stored)) {
      return false;
    }

    const profile = stored['profile'];
    const screenBaseline = stored['screenBaseline'];

    if (!isCalibrationProfile(profile) || !isScreenBaseline(screenBaseline)) {
      return false;
    }

    this.profiles.save(profile);
    this.baselines.save(screenBaseline);
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
