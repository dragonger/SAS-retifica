import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { criarRotas } from './app.routes';
import { CHAVE_AUTH } from './core/auth.service';
import { exigirSessao } from './core/sessao.guard';
import { Login } from './telas/login/login';

@Component({ selector: 'app-vazio', template: '' })
class Vazio {}

describe('rota #/login', () => {
  it('mostra a tela de login (o login automático foi removido em 2026-11-12)', async () => {
    const login = criarRotas().find(r => r.path === 'login')!;
    expect(login.component).toBe(Login);
    TestBed.configureTestingModule({
      providers: [provideRouter([login, { path: 'inicio', component: Vazio }]), provideHttpClient(), provideHttpClientTesting()],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/login');
    expect(router.url).toBe('/login');
  });
});

describe('guarda de sessão', () => {
  function executar() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    return TestBed.runInInjectionContext(() => exigirSessao(null as never, null as never));
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('sem sessão: manda para #/login sem chamar o servidor', () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(String(executar())).toBe('/login');
    expect(f).not.toHaveBeenCalled();
  });

  it('com sessão: segue', () => {
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 't' }));
    expect(executar()).toBe(true);
  });
});
