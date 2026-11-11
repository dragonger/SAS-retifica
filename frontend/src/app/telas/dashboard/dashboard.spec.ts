import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { esperar, provedoresDeTela } from '../../testing/ajuda';
import { GrupoEncerrados } from '../encerrados/encerrados';
import { Dashboard } from './dashboard';

const pedido = (id: number, cliente: string) => ({ id, clienteNome: cliente, situacao: 'Finalizado', componentesResumo: 'Cabeçote', dataEntrega: '01/10/2026', totalGeral: 100, finalizado: true });

const GRUPOS: GrupoEncerrados[] = [
  {
    mes: 'Outubro de 2026', quantidade: 2, total: 1500, pedidos: [pedido(10, 'Ana'), pedido(9, 'Bia')],
    porCliente: [{ descricao: 'Ana', total: 1000 }, { descricao: 'Bia', total: 500 }],
    porCategoria: [{ descricao: 'Cabeçote', total: 1500 }],
  },
  {
    mes: 'Setembro de 2026', quantidade: 1, total: 300, pedidos: [pedido(5, 'Caio')],
    porCliente: [{ descricao: 'Caio', total: 300 }],
    porCategoria: [{ descricao: 'Bloco', total: 300 }],
  },
];

describe('Dashboard', () => {
  let http: HttpTestingController;

  async function criar(grupos: GrupoEncerrados[]) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    http.expectOne('/api/pedidos/encerrados').flush(grupos);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const botaoSeg = (html: HTMLElement, texto: string) =>
    [...html.querySelectorAll<HTMLButtonElement>('.seg button')].find(b => b.textContent === texto)!;

  afterEach(() => http.verify());

  it('mostra o mês mais recente: cards, pedidos e agregado por cliente', async () => {
    const { html } = await criar(GRUPOS);
    const valores = [...html.querySelectorAll('.stat-value')].map(e => e.textContent);
    expect(valores).toEqual(['R$ 1.500,00', '2']);
    expect(html.querySelector('.stat-sub')?.textContent).toBe('2 pedidos');
    expect(html.querySelectorAll('.linha').length).toBe(2);
    expect(botaoSeg(html, 'Por cliente').classList.contains('active')).toBe(true);
    expect(botaoSeg(html, 'Por categoria').classList.contains('active')).toBe(false);
    expect([...html.querySelectorAll('.bar-label')].map(e => e.textContent)).toEqual(['Ana', 'Bia']);
    expect(html.querySelector('.total-box')?.textContent).toContain('Total (cliente)');
    expect(html.querySelector('.total-box .valor')?.textContent).toBe('R$ 1.500,00');
  });

  it('as barras são proporcionais ao maior valor', async () => {
    const { html } = await criar(GRUPOS);
    const larguras = [...html.querySelectorAll<HTMLElement>('.bar-fill')].map(e => e.style.width);
    expect(larguras).toEqual(['100%', '50%']);
  });

  it('alternar para "Por categoria" troca as barras e o título do total', async () => {
    const { fixture, html } = await criar(GRUPOS);
    botaoSeg(html, 'Por categoria').click();
    await esperar(fixture);
    expect(botaoSeg(html, 'Por categoria').classList.contains('active')).toBe(true);
    expect([...html.querySelectorAll('.bar-label')].map(e => e.textContent)).toEqual(['Cabeçote']);
    expect(html.querySelector('.total-box')?.textContent).toContain('Total (categoria)');
  });

  it('trocar o mês atualiza tudo e mantém o tipo de agregado escolhido', async () => {
    const { fixture, html } = await criar(GRUPOS);
    botaoSeg(html, 'Por categoria').click();
    await esperar(fixture);
    const sel = html.querySelector('select') as HTMLSelectElement;
    expect([...sel.options].map(o => o.value)).toEqual(['Outubro de 2026', 'Setembro de 2026']);
    sel.value = 'Setembro de 2026';
    sel.dispatchEvent(new Event('change'));
    await esperar(fixture);
    expect([...html.querySelectorAll('.stat-value')].map(e => e.textContent)).toEqual(['R$ 300,00', '1']);
    expect(html.querySelector('.stat-sub')?.textContent).toBe('1 pedido');
    expect([...html.querySelectorAll('.bar-label')].map(e => e.textContent)).toEqual(['Bloco']);
    expect(html.textContent).toContain('Nº 0005');
  });

  it('sem pedidos encerrados mostra a mensagem', async () => {
    const { html } = await criar([]);
    expect(html.querySelector('.empty')?.textContent).toBe('Nenhum pedido encerrado ainda.');
    expect(html.querySelector('select')).toBeNull();
  });
});
