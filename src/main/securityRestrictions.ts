import { URL } from 'node:url';

import type { Session } from 'electron';
import { app, shell } from 'electron';

import { isAppUrl } from './ipc';

/**
 * Union for all existing permissions in electron
 */
type Permission = Parameters<
  Exclude<Parameters<Session['setPermissionRequestHandler']>[0], null>
>[1];

/**
 * Permissions the app's own page may have. None today. Only the app page (`isAppUrl()`: the Vite
 * dev server in dev, `nubes://app` otherwise) can be navigated to or granted anything.
 */
const APP_PERMISSIONS = new Set<Permission>();

/** The origin to show in warnings. `URL.origin` is `"null"` for `nubes:` and `file:`. */
function describeOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin === 'null' ? `${parsed.protocol}//${parsed.host}` : parsed.origin;
  } catch {
    return url;
  }
}

/**
 * A list of origins that you allow open IN BROWSER.
 * Navigation to the origins below is only possible if the link opens in a new window.
 *
 * @example
 * <a
 *   target="_blank"
 *   href="https://github.com/"
 * >
 */
const ALLOWED_EXTERNAL_ORIGINS = new Set<`https://${string}`>([
  'https://github.com',
  'https://s3.console.aws.amazon.com',
]);

app.on('web-contents-created', (_, contents) => {
  /**
   * Block navigation to origins not on the allowlist.
   *
   * Navigation exploits are quite common. If an attacker can convince the app to navigate away from its current page,
   * they can possibly force the app to open arbitrary web resources/websites on the web.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#13-disable-or-limit-navigation
   */
  const blockUnlessApp = (event: Electron.Event, url: string) => {
    if (isAppUrl(url)) {
      return;
    }

    // Prevent navigation
    event.preventDefault();

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      console.warn(`Blocked navigating to disallowed origin: ${describeOrigin(url)}`);
    }
  };
  contents.on('will-navigate', (event, url) => blockUnlessApp(event, url));
  // A server-side redirect doesn't fire will-navigate.
  contents.on('will-redirect', (event, url) => blockUnlessApp(event, url));

  /**
   * Block requests for disallowed permissions.
   * By default, Electron will automatically approve all permission requests.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#5-handle-session-permission-requests-from-remote-content
   */
  contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = details.requestingUrl || webContents?.getURL() || '';
    const permissionGranted = isAppUrl(url) && APP_PERMISSIONS.has(permission);
    callback(permissionGranted);

    if (!permissionGranted && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      console.warn(
        `${describeOrigin(url)} requested permission for '${permission}', but was rejected.`,
      );
    }
  });

  /**
   * Most web APIs ask this synchronous check before (or instead of) the request handler above, and
   * Electron allows everything when it isn't set.
   */
  contents.session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) =>
      isAppUrl(details.requestingUrl || requestingOrigin) &&
      APP_PERMISSIONS.has(permission as Permission),
  );

  /**
   * Hyperlinks leading to allowed sites are opened in the default browser.
   *
   * The creation of new `webContents` is a common attack vector. Attackers attempt to convince the app to create new windows,
   * frames, or other renderer processes with more privileges than they had before; or with pages opened that they couldn't open before.
   * You should deny any unexpected window creation.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#14-disable-or-limit-creation-of-new-windows
   * @see https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-openexternal-with-untrusted-content
   */
  contents.setWindowOpenHandler(({ url }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { action: 'deny' };
    }
    const { origin } = parsed;

    // Check the scheme and userinfo too: `blob:https://github.com/<id>` has GitHub's origin, and
    // `https://evil@github.com/` hides a user name in front of the host.
    if (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      ALLOWED_EXTERNAL_ORIGINS.has(origin as `https://${string}`)
    ) {
      // Open url in default browser.
      shell.openExternal(url).catch(console.error);
    } else if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      console.warn(`Blocked the opening of a disallowed origin: ${origin}`);
    }

    // Prevent creating a new window.
    return { action: 'deny' };
  });

  /**
   * The app never uses <webview> (the main window sets `webviewTag: false`), so block every one.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#12-verify-webview-options-before-creation
   */
  contents.on('will-attach-webview', (event, _webPreferences, params) => {
    event.preventDefault();
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      console.warn(`A webview tried to attach ${params.src}, but was blocked.`);
    }
  });
});
