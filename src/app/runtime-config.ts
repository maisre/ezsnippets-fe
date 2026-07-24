export interface RuntimeConfig {
  apiUrl: string;
  viewUrl: string;
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
