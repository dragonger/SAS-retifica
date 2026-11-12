import { HttpContext, HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpHeaders, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap, tap, throwError } from 'rxjs';
import { ERRO_401_PROPRIO, ErroApi, JA_RETENTOU, STATUS_SEM_AVISO } from './api.service';
import { AuthService } from './auth.service';
import { DialogoService } from './dialogo.service';
import { GuardaSaidaService } from './guarda-saida.service';
import { IdentidadeService } from './identidade.service';
import { LOGIN_AUTOMATICO } from './login-automatico';

/**
 * Equivalente ao api() do app.js:
 * - Bearer token da sessão;
 * - X-Auth-Refresh: guarda o token renovado;
 * - 401: grava o rascunho da tela, limpa a sessão, refaz o login automático e
 *   repete a chamada UMA vez (o app atual vai a #/login, que entra sozinho);
 *   com LOGIN_AUTOMATICO desligado vai a #/login e não repete;
 * - sem conexão: toast "Sem conexão com o servidor.";
 * - demais erros: toast genérico (exceto códigos de STATUS_SEM_AVISO) e
 *   ErroApi com o `detalhe` do corpo `{"erro": ...}`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const dialogo = inject(DialogoService);
  const guarda = inject(GuardaSaidaService);
  const identidade = inject(IdentidadeService);
  const loginAutomatico = inject(LOGIN_AUTOMATICO);
  const router = inject(Router);

  const comToken = (r: HttpRequest<unknown>): HttpRequest<unknown> => {
    const token = auth.lerAuth()?.token;
    return token ? r.clone({ setHeaders: { Authorization: 'Bearer ' + token } }) : r;
  };

  const renovarToken = (headers: HttpHeaders): void => {
    const renovado = headers.get('X-Auth-Refresh');
    if (renovado) auth.gravarToken(renovado);
  };

  const executar = (r: HttpRequest<unknown>): Observable<HttpEvent<unknown>> =>
    next(comToken(r)).pipe(
      tap(ev => { if (ev instanceof HttpResponse) renovarToken(ev.headers); }),
      catchError((e: unknown) => {
        if (!(e instanceof HttpErrorResponse)) return throwError(() => e);

        if (e.status === 0) {
          dialogo.toast('Sem conexão com o servidor.', true);
          return throwError(() => new ErroApi(0, undefined, r.url));
        }

        if (e.status === 401 && r.context.get(ERRO_401_PROPRIO)) {
          // o chamador trata este 401 (ex.: senha atual incorreta): a sessão continua valendo
          return throwError(() => new ErroApi(401, detalheDoCorpo(e.error), r.url));
        }

        if (e.status === 401) {
          // grava o rascunho do pedido ANTES de limpar a sessão (é ela que diz de quem é o rascunho)
          guarda.guardarSeSujo();
          auth.limpar();
          identidade.limpar();
          const falhou = () => throwError(() => new ErroApi(401, undefined, r.url));
          if (!loginAutomatico) { // com a tela de login ligada, vence a sessão: volta para ela
            void router.navigateByUrl('/login');
            return falhou();
          }
          if (r.context.get(JA_RETENTOU)) return falhou(); // segunda vez: sem laço
          return from(auth.garantirAutoLogin()).pipe(
            switchMap(ok => ok
              ? executar(r.clone({
                context: new HttpContext()
                  .set(STATUS_SEM_AVISO, r.context.get(STATUS_SEM_AVISO))
                  .set(JA_RETENTOU, true),
              }))
              : falhou()),
          );
        }

        renovarToken(e.headers);
        if (!r.context.get(STATUS_SEM_AVISO).includes(e.status)) {
          dialogo.toast('Erro ao acessar ' + r.url + ' (' + e.status + ')', true);
        }
        return throwError(() => new ErroApi(e.status, detalheDoCorpo(e.error), r.url));
      }),
    );

  return executar(req);
};

/** Mensagem do servidor ({"erro": "..."}), pra quem trata o status sem o aviso genérico. */
function detalheDoCorpo(corpo: unknown): string | undefined {
  if (corpo && typeof corpo === 'object' && 'erro' in corpo) {
    const erro = (corpo as { erro: unknown }).erro;
    return typeof erro === 'string' ? erro : undefined;
  }
  return undefined;
}
