import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withHashLocation, withRouterConfig } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // hash: os endereços continuam "#/pedidos/novo" e o servidor não precisa de fallback de SPA
    // 'computed': ao cancelar uma saída (guarda de dados não salvos) o histórico volta à posição certa
    provideRouter(routes, withHashLocation(), withRouterConfig({ canceledNavigationResolution: 'computed' })),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
  ],
};
