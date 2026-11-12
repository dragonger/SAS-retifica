import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CHAVE_AUTH } from '../../core/auth.service';
import { RECARREGAR } from '../../core/sessao.service';
import { esperar, provedoresDeTela, tokenDeTeste } from '../../testing/ajuda';
import { Catalogo } from './catalogo';

describe('Catalogo (menu)', () => {
  let http: HttpTestingController;

  let recarregar: ReturnType<typeof vi.fn>;

  async function criar(resposta: { status: number; corpo: object }, claims: object = { usuarioId: 7, empresaId: 3 }) {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: tokenDeTeste(claims) }));
    recarregar = vi.fn();
    TestBed.configureTestingModule({ providers: [...provedoresDeTela(), { provide: RECARREGAR, useValue: recarregar }] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Catalogo);
    http.expectOne('/api/alto-medidas/status').flush(resposta.corpo, { status: resposta.status, statusText: 'x' });
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const titulos = (html: HTMLElement) => [...html.querySelectorAll('.menu-card-titulo')].map(e => e.textContent);

  afterEach(() => http.verify());

  it('sem a integração: Clientes, Serviços, Peças e Minha empresa', async () => {
    const { html } = await criar({ status: 200, corpo: { habilitado: false } });
    expect(titulos(html)).toEqual(['Clientes', 'Serviços', 'Peças', 'Minha empresa']);
  });

  it('com a integração do Alto Medidas aparece "Virabrequins do Daniel" antes de Minha empresa', async () => {
    const { html } = await criar({ status: 200, corpo: { habilitado: true } });
    expect(titulos(html)).toEqual(['Clientes', 'Serviços', 'Peças', 'Virabrequins do Daniel', 'Minha empresa']);
  });

  it('erro 403 na consulta esconde o cartão em silêncio', async () => {
    const { html } = await criar({ status: 403, corpo: {} });
    expect(titulos(html)).not.toContain('Virabrequins do Daniel');
  });

  it('tocar num cartão navega para a rota dele', async () => {
    const { html } = await criar({ status: 200, corpo: { habilitado: true } });
    const ir = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const cartoes = [...html.querySelectorAll<HTMLElement>('.menu-card')];
    cartoes[0].click();
    cartoes[3].click();
    cartoes[4].click();
    expect(ir.mock.calls.map(c => c[0])).toEqual(['/clientes', '/alto-medidas', '/empresa']);
  });

  const conta = (html: HTMLElement) => [...html.querySelectorAll('.conta a, .conta button')].map(e => e.textContent?.trim());

  it('Conta: Trocar senha e Sair; Sair limpa a sessão e recarrega na tela de login', async () => {
    const { html } = await criar({ status: 200, corpo: { habilitado: false } });
    expect(conta(html)).toEqual(['Trocar senha', 'Sair']);
    expect(html.querySelector('.conta a')!.getAttribute('href')).toBe('/trocar-senha');
    ([...html.querySelectorAll<HTMLButtonElement>('.conta button')].find(b => b.textContent?.includes('Sair')))!.click();
    expect(localStorage.getItem(CHAVE_AUTH)).toBeNull();
    expect(recarregar).toHaveBeenCalledWith('#/login');
  });

  it('na demonstração não oferece Trocar senha (o usuário dela não tem senha)', async () => {
    const { html } = await criar({ status: 200, corpo: { habilitado: false } }, { usuarioId: 9, empresaId: 8, demo: true, exp: 1794500000 });
    expect(conta(html)).toEqual(['Sair']);
  });
});
