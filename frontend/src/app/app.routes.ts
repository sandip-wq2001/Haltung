import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home-page').then((module) => module.HomePageComponent),
  },
  {
    path: 'live',
    loadComponent: () => import('./pages/live/live').then((module) => module.Live),
  },
  {
    path: 'calibration',
    loadComponent: () =>
      import('./pages/calibration/calibration').then((module) => module.Calibration),
  },
  {
    path: 'record',
    loadComponent: () => import('./pages/record/record').then((module) => module.RecordSession),
  },
  {
    path: 'posture',
    loadComponent: () => import('./pages/posture/posture').then((module) => module.PostureSession),
  },
  {
    path: 'threshold',
    loadComponent: () =>
      import('./pages/threshold/threshold').then((module) => module.ThresholdSession),
  },
];
