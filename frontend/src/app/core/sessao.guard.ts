import { inject } from '@angular/core';
import { CanActivateChildFn } from '@angular/router';
import { AuthService } from './auth.service';
import { DialogoService } from './dialogo.service';
import { IdentidadeService } from './identidade.service';

/**
 * Equivale ao início do rotear() do app.js: sem sessão, entra sozinho via
 * /api/auth/auto-login (a tela de login está desativada) e carrega a
 * identidade da empresa uma vez. Se o login automático falhar (sem conexão),
 * avisa e deixa a navegação seguir; a próxima navegação tenta de novo.
 */
export const exigirSessao: CanActivateChildFn = async () => {
  const auth = inject(AuthService);
  const identidade = inject(IdentidadeService);
  const dialogo = inject(DialogoService);

  if (!(await auth.garantirAutoLogin())) {
    dialogo.toast('Sem conexão com o servidor.', true);
    return true;
  }
  identidade.garantir();
  return true;
};
