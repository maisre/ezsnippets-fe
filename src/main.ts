import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { loadRuntimeConfig, runtimeConfig } from './app/runtime-config';

loadRuntimeConfig()
  .then(() => {
    if (runtimeConfig.sentryDsn) {
      Sentry.init({
        dsn: runtimeConfig.sentryDsn,
        environment: runtimeConfig.sentryEnvironment,
        release: runtimeConfig.sentryRelease,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
      });
    }
    return bootstrapApplication(App, appConfig);
  })
  .catch((err) => console.error(err));
