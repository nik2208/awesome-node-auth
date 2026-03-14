import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { appConfig } from './app.config';
import { ssrCookieInterceptor } from './auth/ssr-cookie.interceptor';
import { authInterceptor } from './auth/auth.interceptor';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    provideHttpClient(
      withFetch(),
      withInterceptors([ssrCookieInterceptor, authInterceptor]),
    ),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
