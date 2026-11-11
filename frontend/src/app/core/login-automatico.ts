import { InjectionToken } from '@angular/core';

/**
 * Login automático ligado (como no app atual): sem sessão salva o app entra
 * sozinho por /api/auth/auto-login e `#/login` redireciona para o Início.
 *
 * PARA RELIGAR A TELA DE LOGIN: trocar esta constante para `false`. Com isso
 * `#/login` mostra o formulário, a rota protegida manda para ele quando não há
 * sessão e um 401 volta para ele (em vez de renovar a sessão sozinho).
 */
export const LOGIN_AUTOMATICO_ATIVO = true;

/** Lido pelas rotas, pela guarda de sessão e pelo interceptor (os testes trocam o valor). */
export const LOGIN_AUTOMATICO = new InjectionToken<boolean>('LOGIN_AUTOMATICO', {
  providedIn: 'root',
  factory: () => LOGIN_AUTOMATICO_ATIVO,
});
