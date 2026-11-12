import { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../core/auth.interceptor';

/** HttpClient com o interceptor real (ErroApi, toasts) e backend de teste, mais um roteador vazio. */
export function provedoresDeTela(): (Provider | EnvironmentProviders)[] {
  return [
    // o 401 leva a /login (auth.interceptor): a rota precisa existir para a navegação não falhar fora do teste
    provideRouter([{ path: 'login', children: [] }]),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideHttpClientTesting(),
  ];
}

/** Deixa a tela assentar: promessas encadeadas, detecção de mudanças e temporizadores curtos. */
export async function esperar(fixture: ComponentFixture<unknown>, ciclos = 4): Promise<void> {
  for (let i = 0; i < ciclos; i++) {
    await new Promise(r => setTimeout(r, 0));
    await fixture.whenStable();
  }
}

/** Escreve num campo e dispara `input`, como o usuário digitando. */
export function digitar(campo: HTMLInputElement | HTMLSelectElement, valor: string): void {
  campo.value = valor;
  campo.dispatchEvent(new Event(campo instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); // como no navegador: o evento sobe até o formulário
}

/** JWT de teste (a assinatura não é conferida pelo front): só o que `AuthService.claims()` lê. */
export function tokenDeTeste(claims: object = { usuarioId: 7, empresaId: 3 }): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64({ alg: 'none' }) + '.' + b64(claims) + '.assinatura';
}
