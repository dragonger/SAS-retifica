import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { criarRotas } from './app.routes';
import { CHAVE_AUTH } from './core/auth.service';
import { LOGIN_AUTOMATICO, LOGIN_AUTOMATICO_ATIVO } from './core/login-automatico';
import { exigirSessao } from './core/sessao.guard';
import { Login } from './telas/login/login';

@Component({ selector: 'app-vazio', template: '' })
class Vazio {}

describe('rota #/login (modo do login automático)', () => {
  /** Só as rotas de login e início do app, com o início trocado por um componente vazio. */
  function roteador(loginAutomatico: boolean) {
    const login = criarRotas(loginAutomatico).find(r => r.path === 'login')!;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([login, { path: 'inicio', component: Vazio }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    return TestBed.inject(Router);
  }

  it('hoje o login automático está ligado (a constante é o único interruptor)', () => {
    expect(LOGIN_AUTOMATICO_ATIVO).toBe(true);
    expect(TestBed.inject(LOGIN_AUTOMATICO)).toBe(true);
  });

  it('ligado: #/login redireciona para o Início, como o app atual', async () => {
    const router = roteador(true);
    await router.navigateByUrl('/login');
    expect(router.url).toBe('/inicio');
  });

  it('desligado: #/login mostra a tela de login', async () => {
    const router = roteador(false);
    await router.navigateByUrl('/login');
    expect(router.url).toBe('/login');
    expect(criarRotas(false).find(r => r.path === 'login')!.component).toBe(Login);
  });

  it('as demais rotas não dependem do modo (mesmos caminhos nos dois)', () => {
    const caminhos = (l: boolean) => JSON.stringify(criarRotas(l).map(r => r.path ?? 'matcher'));
    expect(caminhos(true)).toBe(caminhos(false));
  });
});

describe('guarda de sessão nos dois modos', () => {
  function executar(loginAutomatico: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LOGIN_AUTOMATICO, useValue: loginAutomatico },
      ],
    });
    return TestBed.runInInjectionContext(() => exigirSessao(null as never, null as never));
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('desligado e sem sessão: manda para #/login sem tentar o login automático', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await executar(false);
    expect(String(r)).toBe('/login');
    expect(f).not.toHaveBeenCalled();
  });

  it('desligado e com sessão: segue', async () => {
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 't' }));
    expect(await executar(false)).toBe(true);
  });

  it('ligado e sem sessão: entra sozinho por /api/auth/auto-login', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'auto' }) });
    vi.stubGlobal('fetch', f);
    expect(await executar(true)).toBe(true);
    expect(f).toHaveBeenCalledWith('/api/auth/auto-login', { method: 'POST' });
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!).token).toBe('auto');
  });
});
