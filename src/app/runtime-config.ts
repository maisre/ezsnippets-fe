export interface RuntimeConfig {
  apiUrl: string;
  viewUrl: string;
  /** CloudFront distribution in front of the shared assets bucket. */
  assetsCdnUrl: string;
  paddleClientToken: string;
  sentryDsn: string;
  sentryEnvironment: string;
  sentryRelease: string;
  sentryEnableDev: boolean;
  /**
   * Soft pre-launch gate: when true, the public landing shows a "coming soon"
   * panel and the Sign Up CTAs are hidden. The /signup route still works if
   * navigated to directly. Togglable by editing config.json in S3 (no rebuild).
   */
  comingSoon: boolean;
}

export const runtimeConfig: RuntimeConfig = {
  apiUrl: '',
  viewUrl: '',
  assetsCdnUrl: '',
  paddleClientToken: '',
  sentryDsn: '',
  sentryEnvironment: '',
  sentryRelease: '',
  sentryEnableDev: false,
  comingSoon: false,
};

export async function loadRuntimeConfig(): Promise<void> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  const config = await response.json();
  Object.assign(runtimeConfig, config);
}

/**
 * Preview image for a library snippet.
 *
 * Served from the assets CloudFront distribution rather than ez-view. These
 * used to be loaded from ez-view's `/public/images/screenshots/<id>.png`, but
 * that directory is a symlink to a developer's local capture folder — it is
 * not in the repo and does not exist inside the ez-view container, so the
 * thumbnails 404 in any deployed environment.
 *
 * Captured and published by ez-api's `scripts/capture-snippets.js` and
 * `scripts/upload-snippet-shots.js`, which write `snippets/<id>.webp`.
 */
export function snippetThumbUrl(snippetId: string): string {
  return `${runtimeConfig.assetsCdnUrl}/snippets/${snippetId}.webp`;
}
