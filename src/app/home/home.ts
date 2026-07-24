import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { runtimeConfig } from '../runtime-config';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  /** Pre-launch gate — shows the "coming soon" panel instead of the landing. */
  get comingSoon(): boolean {
    return runtimeConfig.comingSoon;
  }
}
