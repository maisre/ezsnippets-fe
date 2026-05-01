export interface RuntimeConfig {
  apiUrl: string;
  viewUrl: string;
  stripePublishableKey: string;
  sentryDsn: string;
  sentryEnvironment: string;
  sentryRelease: string;
}

export const runtimeConfig: RuntimeConfig = {
  apiUrl: '',
  viewUrl: '',
  stripePublishableKey: '',
  sentryDsn: '',
  sentryEnvironment: '',
  sentryRelease: '',
};

export async function loadRuntimeConfig(): Promise<void> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  const config = await response.json();
  Object.assign(runtimeConfig, config);
}
