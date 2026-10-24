import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { loadRuntimeConfig, runtimeConfig } from './app/runtime-config';
import { captureAttribution, initAnalytics } from './app/analytics';

// Before anything async: the router may rewrite the URL once it boots, and the
// landing query string (utm_*, ref) is what we're after.
captureAttribution();

loadRuntimeConfig()
  .then(() => {
    // In development, reporting is off unless sentryEnableDev is true in
    // config.json — staging/prod set sentryEnvironment at deploy time and stay
    // always on (the flag only applies to the development environment).
    const environment = runtimeConfig.sentryEnvironment || 'development';
    const sentryEnabled =
      !!runtimeConfig.sentryDsn &&
      (environment !== 'development' || runtimeConfig.sentryEnableDev);
    if (sentryEnabled) {
      Sentry.init({
        dsn: runtimeConfig.sentryDsn,
        environment,
        release: runtimeConfig.sentryRelease,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
      });
    }
    initAnalytics();
    return bootstrapApplication(App, appConfig);
  })
  .catch((err) => console.error(err));
