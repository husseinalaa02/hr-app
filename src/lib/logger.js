// Production-safe logger.
// DEV: all levels print to the browser console.
// PROD: only errors are logged (remove the `if (isDev)` guard in logger.error
//       once you wire up Sentry or another remote error-tracking service).
//
// To integrate Sentry, uncomment the lines below and install @sentry/react:
//   import * as Sentry from '@sentry/react';
//   // in logger.error: Sentry.captureException(args[0]);

const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args) => { if (isDev) console.debug('[debug]', ...args); },
  info:  (...args) => { if (isDev) console.info('[info]',  ...args); },
  warn:  (...args) => { if (isDev) console.warn('[warn]',  ...args); },
  error: (...args) => {
    if (isDev) console.error('[error]', ...args);
    // Sentry.captureException(args[0]);
  },
};
