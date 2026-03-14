/**
 * SSR cookie interceptor — forwards browser cookies to the API server.
 *
 * During server-side rendering, `withCredentials: true` has no effect because
 * there is no browser cookie jar. This interceptor reads the `Cookie` header
 * from the incoming Express Request and forwards it to every outgoing API call,
 * so awesome-node-auth receives the user's auth cookies correctly.
 */

import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID, InjectionToken } from '@angular/core';
import { isPlatformServer } from '@angular/common';

export const REQUEST = new InjectionToken<{ headers?: { cookie?: string } }>('REQUEST');

export const ssrCookieInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const request    = inject(REQUEST, { optional: true });

  if (!isPlatformServer(platformId) || !request) {
    return next(req);
  }

  const cookieHeader = request.headers?.cookie;
  if (!cookieHeader) return next(req);

  return next(req.clone({ setHeaders: { Cookie: cookieHeader } }));
};
