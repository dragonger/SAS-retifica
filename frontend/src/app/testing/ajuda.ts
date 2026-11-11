import { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../core/auth.interceptor';

/** HttpClient com o interceptor real (ErroApi, toasts) e backend de teste, mais um roteador vazio. */
export function provedoresDeTela(): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter([]),
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
  campo.dispatchEvent(new Event(campo instanceof HTMLSelectElement ? 'change' : 'input'));
}
