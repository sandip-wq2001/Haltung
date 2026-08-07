import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ProfilePersistence } from './services/profile-persistence';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor() {
    inject(ProfilePersistence).restore();
  }
}
