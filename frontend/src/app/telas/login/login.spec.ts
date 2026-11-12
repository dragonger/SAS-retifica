import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService, CHAVE_AUTH } from '../../core/auth.service';
import { RECARREGAR } from '../../core/sessao.service';
import { digitar, esperar } from '../../testing/ajuda';
import { Login } from './login';

describe('Login', () => {
  let navegar: ReturnType<typeof vi.spyOn>;
  let recarregar: ReturnType<typeof vi.fn>;

  function criar() {
    localStorage.clear();
    recarregar = vi.fn();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: RECARREGAR, useValue: recarregar }] });
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Login);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const campo = (html: HTMLElement, placeholder: string) => html.querySelector(`input[placeholder^="${placeholder}"]`) as HTMLInputElement;
  const erro = (html: HTMLElement) => html.querySelector('.empty') as HTMLElement;
  const entrar = (html: HTMLElement) => html.querySelector('button.btn-primary') as HTMLButtonElement;
  const abrirDemo = (html: HTMLElement) => [...html.querySelectorAll('button')].find(b => b.textContent?.includes('Abrir demonstração'))!;
  const erroDemo = (html: HTMLElement) => html.querySelector('.demo-login .empty') as HTMLElement;

  function resposta(status: number, corpo: object = {}) {
    return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('mostra título, campos de e-mail e senha e a mensagem de erro escondida', async () => {
    const { fixture, html } = criar();
    await esperar(fixture);
    expect(html.querySelector('h2.titulo')!.textContent).toBe('Retífica');
    expect(html.textContent).toContain('Entre com sua conta');
    expect(campo(html, 'seu@email.com').type).toBe('email');
    expect(campo(html, 'Senha').type).toBe('password');
    expect(erro(html).hidden).toBe(true);
  });

  it('sem e-mail ou sem senha: "Preencha e-mail e senha." e não chama o servidor', async () => {
    const f = resposta(200);
    vi.stubGlobal('fetch', f);
    const { fixture, html } = criar();
    digitar(campo(html, 'seu@email.com'), '   ');
    entrar(html).click();
    await esperar(fixture);
    expect(erro(html).hidden).toBe(false);
    expect(erro(html).textContent).toBe('Preencha e-mail e senha.');
    expect(f).not.toHaveBeenCalled();
  });

  it('sucesso: POST /api/auth/login com o e-mail aparado, grava retifica_auth e recarrega no Início (zera os caches)', async () => {
    const f = resposta(200, { token: 'abc', nome: 'Ana', empresaNome: 'DIH' });
    vi.stubGlobal('fetch', f);
    const { fixture, html } = criar();
    digitar(campo(html, 'seu@email.com'), '  ana@dih.com ');
    digitar(campo(html, 'Senha'), 'segredo');
    entrar(html).click();
    await esperar(fixture);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'ana@dih.com', senha: 'segredo' });
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!)).toEqual({ token: 'abc', nome: 'Ana', empresaNome: 'DIH' });
    expect(TestBed.inject(AuthService).sessao()?.token).toBe('abc');
    expect(recarregar).toHaveBeenCalledWith('#/inicio');
  });

  it('Enter no campo de senha também entra', async () => {
    const f = resposta(200, { token: 'abc' });
    vi.stubGlobal('fetch', f);
    const { fixture, html } = criar();
    digitar(campo(html, 'seu@email.com'), 'a@b.com');
    digitar(campo(html, 'Senha'), 'x');
    campo(html, 'Senha').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await esperar(fixture);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('credenciais recusadas: "E-mail ou senha inválidos." e fica na tela', async () => {
    vi.stubGlobal('fetch', resposta(401));
    const { fixture, html } = criar();
    digitar(campo(html, 'seu@email.com'), 'a@b.com');
    digitar(campo(html, 'Senha'), 'errada');
    entrar(html).click();
    await esperar(fixture);
    expect(erro(html).textContent).toBe('E-mail ou senha inválidos.');
    expect(localStorage.getItem(CHAVE_AUTH)).toBeNull();
    expect(recarregar).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('sem rede: "Sem conexão com o servidor."', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { fixture, html } = criar();
    digitar(campo(html, 'seu@email.com'), 'a@b.com');
    digitar(campo(html, 'Senha'), 'x');
    entrar(html).click();
    await esperar(fixture);
    expect(erro(html).textContent).toBe('Sem conexão com o servidor.');
  });

  it('tem a opção de demonstração, explicando que os dados são fictícios e apagados em 2 horas', async () => {
    const { fixture, html } = criar();
    await esperar(fixture);
    expect(html.querySelector('.demo-login')!.textContent).toContain('dados fictícios');
    expect(html.querySelector('.demo-login')!.textContent).toContain('2 horas');
    expect(abrirDemo(html)).toBeTruthy();
    expect(erroDemo(html).hidden).toBe(true);
  });

  it('Abrir demonstração: POST /api/auth/demo, grava a sessão e recarrega no Início', async () => {
    const f = resposta(200, { token: 'demo', nome: 'Visitante', empresaNome: 'Retífica Demonstração' });
    vi.stubGlobal('fetch', f);
    const { fixture, html } = criar();
    abrirDemo(html).click();
    await esperar(fixture);
    expect(f).toHaveBeenCalledWith('/api/auth/demo', { method: 'POST' });
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!).empresaNome).toBe('Retífica Demonstração');
    expect(recarregar).toHaveBeenCalledWith('#/inicio');
  });

  it('demonstração recusada por limite (429): avisa para tentar depois e não entra', async () => {
    vi.stubGlobal('fetch', resposta(429, { erro: 'x' }));
    const { fixture, html } = criar();
    abrirDemo(html).click();
    await esperar(fixture);
    expect(erroDemo(html).hidden).toBe(false);
    expect(erroDemo(html).textContent).toContain('Tente de novo em alguns minutos');
    expect(localStorage.getItem(CHAVE_AUTH)).toBeNull();
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('demonstração desligada (503): avisa que não está disponível', async () => {
    vi.stubGlobal('fetch', resposta(503, { erro: 'x' }));
    const { fixture, html } = criar();
    abrirDemo(html).click();
    await esperar(fixture);
    expect(erroDemo(html).textContent).toBe('A demonstração não está disponível no momento.');
  });
});
