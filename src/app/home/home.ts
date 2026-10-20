import { AfterViewInit, Component, ElementRef, ViewChild, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { runtimeConfig } from '../runtime-config';

/**
 * Homepage videos live in the shared assets bucket under `video/`, served by
 * the assets CloudFront distribution. Upload with `--content-type video/mp4`.
 * The assets cache policy holds objects for at least a day, so replacing a
 * video needs a CloudFront invalidation of `/video/*`.
 */
const VIDEO = {
  heroLoop: 'video/hero-loop.mp4',
  heroPoster: 'video/hero-loop-poster.webp',
  demo: 'video/demo.mp4',
  demoPoster: 'video/demo-poster.webp',
};

@Component({
  selector: 'app-home',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements AfterViewInit {
  @ViewChild('heroVideo') heroVideo?: ElementRef<HTMLVideoElement>;

  readonly heroLoopUrl = assetUrl(VIDEO.heroLoop);
  readonly heroPosterUrl = assetUrl(VIDEO.heroPoster);
  readonly demoUrl = assetUrl(VIDEO.demo);
  readonly demoPosterUrl = assetUrl(VIDEO.demoPoster);

  /**
   * Each video hides itself if its file fails to load, so the page looks right
   * before the videos are uploaded.
   */
  readonly heroAvailable = signal(true);
  readonly demoAvailable = signal(true);

  /** Visitors who ask for reduced motion get a play button, not an autoplaying loop. */
  readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Pre-launch gate — shows the "coming soon" panel instead of the landing. */
  get comingSoon(): boolean {
    return runtimeConfig.comingSoon;
  }

  ngAfterViewInit(): void {
    const video = this.heroVideo?.nativeElement;
    if (!video || this.reducedMotion) return;
    // Set muted as a property: browsers only allow autoplay for muted video,
    // and Angular's static `muted` attribute isn't reliably applied in time.
    video.muted = true;
    video.play().catch(() => {
      // Autoplay blocked (e.g. low-power mode). The poster stays visible.
    });
  }
}

function assetUrl(path: string): string {
  return `${runtimeConfig.assetsCdnUrl}/${path}`;
}
