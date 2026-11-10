import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CacheService } from '../../core/cache.service';
import { Dashboard, Inicio } from './inicio';

const DASH: Dashboard = {
  abertos: 5, hoje: 2, prontos: 1, atrasados: 3,
  entregasHoje: [{ id: 137, clienteNome: 'Oficina Silva', situacao: 'Pronto', componentesResumo: 'Cabeçote', dataEntrega: '10/11/2026', totalGeral: 4760 }],
};

describe('Inicio', () => {
  function criar(dash: Dashboard) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
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

  it('o card leva a #/pedidos?filtro=...', async () => {
    const fixture = criar(DASH);
    await fixture.whenStable();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.stat-card')[3].click();
    expect(navegar).toHaveBeenCalledWith(['/pedidos'], { queryParams: { filtro: 'atrasados' } });
  });

  it('sem entregas mostra a mensagem vazia', async () => {
    const fixture = criar({ ...DASH, entregasHoje: [] });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nenhuma entrega prevista para hoje.');
  });
});
