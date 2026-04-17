export interface RuntimeConfig {
  apiUrl: string;
  viewUrl: string;
  stripePublishableKey: string;
}

export const runtimeConfig: RuntimeConfig = {
  apiUrl: '',
  viewUrl: '',
  stripePublishableKey: '',
};

export async function loadRuntimeConfig(): Promise<void> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  const config = await response.json();
  Object.assign(runtimeConfig, config);
}
