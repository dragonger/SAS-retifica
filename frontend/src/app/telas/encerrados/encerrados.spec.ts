import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { esperar, provedoresDeTela } from '../../testing/ajuda';
import { Encerrados, GrupoEncerrados } from './encerrados';

const pedido = (id: number, cliente: string) => ({ id, clienteNome: cliente, situacao: 'Finalizado', componentesResumo: 'Cabeçote', dataEntrega: '01/10/2026', totalGeral: 100, finalizado: true });

export const GRUPOS: GrupoEncerrados[] = [
  { mes: 'Outubro de 2026', quantidade: 2, total: 1500, pedidos: [pedido(10, 'Ana'), pedido(9, 'Bia')], porCliente: [], porCategoria: [] },
  { mes: 'Setembro de 2026', quantidade: 1, total: 300, pedidos: [pedido(5, 'Caio')], porCliente: [], porCategoria: [] },
];

describe('Encerrados', () => {
  let http: HttpTestingController;

  async function criar(grupos: GrupoEncerrados[]) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Encerrados);
    expect((fixture.nativeElement as HTMLElement).textContent).toBe('');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando...');
    http.expectOne('/api/pedidos/encerrados').flush(grupos);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => http.verify());

  it('mostra o total de pedidos e um acordeão por mês; só o mais recente começa aberto', async () => {
    const { html } = await criar(GRUPOS);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('3 pedidos concluídos');
    const cabs = [...html.querySelectorAll<HTMLElement>('.accordion-cab')];
    expect(cabs.map(c => c.querySelector('.linha-titulo')?.textContent)).toEqual(['Outubro de 2026', 'Setembro de 2026']);
    expect(cabs[0].querySelector('.accordion-meta')?.textContent).toContain('2 · R$ 1.500,00');
    const corpos = [...html.querySelectorAll<HTMLElement>('.accordion-body')];
    expect(corpos[0].hidden).toBe(false);
    expect(corpos[1].hidden).toBe(true);
    expect(cabs.map(c => c.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    expect(corpos[0].textContent).toContain('Nº 0010');
  });

  it('tocar no cabeçalho abre/fecha o mês', async () => {
    const { fixture, html } = await criar(GRUPOS);
    const cabs = [...html.querySelectorAll<HTMLElement>('.accordion-cab')];
    cabs[1].click();
    cabs[0].click();
    await esperar(fixture);
    const corpos = [...html.querySelectorAll<HTMLElement>('.accordion-body')];
    expect(corpos[0].hidden).toBe(true);
    expect(corpos[1].hidden).toBe(false);
    expect(cabs[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('sem pedidos encerrados mostra a mensagem', async () => {
    const { html } = await criar([]);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('0 pedidos concluídos');
    expect(html.querySelector('.empty')?.textContent).toBe('Nenhum pedido encerrado ainda.');
  });
});
