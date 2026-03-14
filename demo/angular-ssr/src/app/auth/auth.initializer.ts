/**
 * APP_INITIALIZER — Silent session restore on page reload.
 *
 * When the user reloads the page the Angular AuthService user state is lost,
 * but the refreshToken HttpOnly cookie is still in the browser.
 * This initializer runs before Angular renders the first route, calls
 * POST /auth/refresh to get fresh tokens, then fetches the user profile.
 */

import { inject, APP_INITIALIZER, EnvironmentProviders, makeEnvironmentProviders, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from './auth.service';

function initializeAuth(auth: AuthService, platformId: object) {
  return () => {
    if (!isPlatformBrowser(platformId)) return Promise.resolve();
    return auth.tryRestoreSession().toPromise();
  };
}

/** Add to the `providers` array in `appConfig`. */
export function provideAuthInitializer(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService, platformId: object) => initializeAuth(auth, platformId),
      deps: [AuthService, PLATFORM_ID],
      multi: true,
    },
  ]);
}
