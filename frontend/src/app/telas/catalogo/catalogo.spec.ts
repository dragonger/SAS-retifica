import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { esperar, provedoresDeTela } from '../../testing/ajuda';
import { Catalogo } from './catalogo';

describe('Catalogo (menu)', () => {
  let http: HttpTestingController;

  async function criar(resposta: { status: number; corpo: object }) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
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
});
