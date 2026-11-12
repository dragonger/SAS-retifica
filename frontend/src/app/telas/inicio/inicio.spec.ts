import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AltoMedidasService, ResumoAltoMedidas } from '../../core/alto-medidas.service';
import { CacheService } from '../../core/cache.service';
import { CHAVE_AUTH } from '../../core/auth.service';
import { tokenDeTeste } from '../../testing/ajuda';
import { gravarRascunhosDeTeste } from '../../testing/rascunhos';
import { Dashboard, Inicio } from './inicio';

const DASH: Dashboard = {
  abertos: 5, hoje: 2, prontos: 1, atrasados: 3,
  entregasHoje: [{ id: 137, clienteNome: 'Oficina Silva', situacao: 'Pronto', componentesResumo: 'Cabeçote', dataEntrega: '10/11/2026', totalGeral: 4760 }],
};

describe('Inicio', () => {
  function criar(dash: Dashboard, daniel: ResumoAltoMedidas | null = null) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AltoMedidasService, useValue: { resumo: async () => daniel } },
        { provide: CacheService, useValue: { comCache: async (_p: string, render: (d: Dashboard) => void) => render(dash) } },
      ],
    });
    const fixture = TestBed.createComponent(Inicio);
    return fixture;
  }

  it('mostra "Carregando..." antes do dado e os cards depois', async () => {
    const fixture = criar(DASH);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const valores = [...html.querySelectorAll('.stat-value')].map(e => e.textContent);
    expect(valores).toEqual(['5', '2', '1', '3']);
    expect(html.textContent).toContain('Oficina Silva');
    expect(html.textContent).toContain('Nº 0137');
    expect(html.textContent).toContain('R$ 4.760,00');
  });

  it('mostra a marca "Versão nova" no rodapé (para distinguir do app antigo durante a migração)', async () => {
    const fixture = criar(DASH);
    await fixture.whenStable();
    const marca = (fixture.nativeElement as HTMLElement).querySelector('.marca-versao');
    expect(marca?.textContent?.trim()).toBe('Versão nova');
  });

  it('o card leva a #/pedidos?filtro=...', async () => {
    const fixture = criar(DASH);
    await fixture.whenStable();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.stat-card')[3].click();
    expect(navegar).toHaveBeenCalledWith(['/pedidos'], { queryParams: { filtro: 'atrasados' } });
  });

  it('sem resumo do Daniel (integração desligada) não mostra o cartão', async () => {
    const fixture = criar(DASH);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.card-destaque')).toBeNull();
  });

  it('com valor devido ao Daniel mostra o cartão pequeno, antes dos cards, e o toque abre o Alto Medidas', async () => {
    const fixture = criar(DASH, { devidoAoDaniel: 1234.5, quantidadeDevida: 2 });
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const cartao = html.querySelector('.card-destaque') as HTMLElement;
    expect(cartao.textContent).toContain('Você deve ao Daniel');
    expect(cartao.textContent).toContain('R$ 1.234,50');
    expect(cartao.textContent).toContain('2 virabrequins que o cliente já pagou · toque para conferir');
    expect(cartao.style.padding).toBe('14px');
    expect(cartao.compareDocumentPosition(html.querySelector('.stat-grid')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const ir = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    cartao.click();
    expect(ir).toHaveBeenCalledWith('/alto-medidas');
  });

  it('nada a repassar (quantidade 0) não mostra o cartão', async () => {
    const fixture = criar(DASH, { devidoAoDaniel: 0, quantidadeDevida: 0 });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.card-destaque')).toBeNull();
  });

  it('sem entregas mostra a mensagem vazia', async () => {
    const fixture = criar({ ...DASH, entregasHoje: [] });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nenhuma entrega prevista para hoje.');
  });

  describe('rascunhos do pedido ("Pedido incompleto")', () => {
    const entrar = () => localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: tokenDeTeste({ usuarioId: 7, empresaId: 3 }) }));

    it('sem rascunho guardado não mostra a seção', async () => {
      localStorage.clear();
      entrar();
      const fixture = criar(DASH);
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Pedido incompleto');
    });

    it('com rascunhos mostra um cartão por rascunho, depois da data e antes dos cards de números', async () => {
      localStorage.clear();
      entrar();
      gravarRascunhosDeTeste({
        novo: { quando: Date.now() - 5 * 60_000, titulo: 'Maria · Retífica' },
        'pedido:12': { quando: Date.now() - 10 * 60_000, titulo: 'Oficina Silva' },
      });
      const fixture = criar(DASH, { devidoAoDaniel: 100, quantidadeDevida: 1 });
      await fixture.whenStable();
      const html = fixture.nativeElement as HTMLElement;
      const titulos = [...html.querySelectorAll('.card-destaque-titulo')].map(e => e.textContent);
      // os dois do rascunho primeiro, depois o cartão do Daniel
      expect(titulos).toEqual(['Pedido incompleto', 'Alterações não salvas · pedido #12', 'Você deve ao Daniel']);
      const primeiro = html.querySelector('.card-destaque')!;
      expect(html.querySelector('.data-hoje')!.compareDocumentPosition(primeiro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(primeiro.compareDocumentPosition(html.querySelector('.stat-grid')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('Continuar leva ao formulário do rascunho', async () => {
      localStorage.clear();
      entrar();
      gravarRascunhosDeTeste({ novo: { quando: Date.now() - 60_000, titulo: 'T' } });
      const fixture = criar(DASH);
      await fixture.whenStable();
      const ir = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent === 'Continuar')!.click();
      expect(ir).toHaveBeenCalledWith('/pedidos/novo');
    });
  });
});
