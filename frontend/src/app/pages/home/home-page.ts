import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith } from 'rxjs';

import { ApiService } from '../../services/api';

type HealthViewState = { kind: 'loading' } | { kind: 'success' } | { kind: 'error' };

@Component({
  selector: 'app-home-page',
  imports: [AsyncPipe, MatButtonModule, MatCardModule, RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  private readonly api = inject(ApiService);

  protected readonly health$ = this.api.getHealth().pipe(
    map((): HealthViewState => ({ kind: 'success' })),
    catchError(() => of<HealthViewState>({ kind: 'error' })),
    startWith({ kind: 'loading' } satisfies HealthViewState),
  );
}
