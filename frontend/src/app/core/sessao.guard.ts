import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { IdentidadeService } from './identidade.service';

/**
 * Rotas do app exigem sessão: sem ela, vai para #/login (onde também dá para abrir a demonstração).
 * Com sessão, carrega a identidade da empresa (nome e logo) uma vez.
 */
export const exigirSessao: CanActivateChildFn = () => {
  if (!inject(AuthService).lerAuth()) return inject(Router).parseUrl('/login');
  inject(IdentidadeService).garantir();
  return true;
};
