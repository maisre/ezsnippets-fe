export interface RuntimeConfig {
  apiUrl: string;
  viewUrl: string;
  paddleClientToken: string;
  sentryDsn: string;
  sentryEnvironment: string;
  sentryRelease: string;
  sentryEnableDev: boolean;
}

export const runtimeConfig: RuntimeConfig = {
  apiUrl: '',
  viewUrl: '',
  paddleClientToken: '',
  sentryDsn: '',
  sentryEnvironment: '',
  sentryRelease: '',
  sentryEnableDev: false,
};

export async function loadRuntimeConfig(): Promise<void> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  const config = await response.json();
  Object.assign(runtimeConfig, config);
}
