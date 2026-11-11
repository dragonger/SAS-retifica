import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CacheService, PEDIDOS_ABERTOS } from '../../core/cache.service';
import { TopoService } from '../../core/topo.service';
import { valorDe } from '../../shared/evento';
import { LinhaPedido } from '../../shared/linha-pedido';
import { Cliente, PedidoLista } from '../../shared/modelos';
import { semAcentoBusca } from '../../shared/texto';

interface FiltroPedidos {
  rotulo: string;
  fn: (p: PedidoLista) => boolean;
}

/** "31/10/2026" (dia de hoje, no formato do dataEntrega). */
export function dataHojeBr(): string {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

/** FILTROS_PEDIDOS do app.js (?filtro=...). */
export const FILTROS_PEDIDOS: Record<string, FiltroPedidos> = {
  abertos: { rotulo: 'Em aberto', fn: p => !p.finalizado },
  hoje: { rotulo: 'Entregas hoje', fn: p => !p.finalizado && p.dataEntrega === dataHojeBr() },
  prontos: { rotulo: 'Prontos', fn: p => !p.finalizado && p.status === 'PRONTO' },
  atrasados: { rotulo: 'Atrasados', fn: p => !!p.atrasado },
};

/** Pedidos (#/pedidos, ?filtro=abertos|hoje|prontos|atrasados ou ?cliente=ID): telaPedidos do app.js. */
@Component({
  selector: 'app-pedidos',
  templateUrl: './pedidos.html',
  imports: [LinhaPedido],
})
export class Pedidos {
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destruido = signal(false);

  /** Chave do filtro da URL ("abertos"...). Só uma das duas query params vale por vez, como no regex do app.js. */
  private readonly filtroChave = signal<string | null>(null);
  protected readonly filtro = computed(() => {
    const chave = this.filtroChave();
    return chave && Object.hasOwn(FILTROS_PEDIDOS, chave) ? FILTROS_PEDIDOS[chave] : undefined;
  });

  /** Só os abertos: finalizados já ficam na aba Encerrados (trazer todos fazia a lista crescer sem limite). */
  protected readonly abertos = signal<PedidoLista[] | null>(null);
  protected readonly clientes = signal<Cliente[] | null>(null);
  protected readonly busca = signal('');
  /** Valor do select de cliente ("" = todos). */
  protected readonly clienteSel = signal('');
  /** Finalizados, carregados só na primeira busca. */
  private readonly encerrados = signal<PedidoLista[] | null>(null);
  private buscandoEncerrados = false;

  protected readonly clientesOrdenados = computed(() =>
    (this.clientes() ?? []).slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')));
  /** Cliente da URL ainda não carregado: o select mostra "Carregando..." com o id dele. */
  protected readonly clienteCarregando = computed(() => this.clientes() === null && this.clienteSel() !== '');

  private readonly termo = computed(() => semAcentoBusca(this.busca()));
  protected readonly filtrando = computed(() => !!this.termo() || !!this.clienteSel());

  private readonly doFiltroDaUrl = computed(() => {
    const abertos = this.abertos() ?? [];
    const f = this.filtro();
    return f ? abertos.filter(f.fn) : abertos;
  });

  protected readonly subtitulo = computed(() => {
    const n = this.doFiltroDaUrl().length;
    if (this.filtrando()) return this.encontrados(this.visiveis().length);
    const f = this.filtro();
    return f ? f.rotulo + ' — ' + n : n + ' em aberto';
  });

  protected readonly visiveis = computed(() =>
    this.doFiltroDaUrl().filter(p => this.doCliente(p) && this.combinaComBusca(p)));

  protected readonly vazio = computed(() =>
    this.filtrando() ? 'Nenhum pedido em aberto encontrado.'
      : this.filtro() ? 'Nenhum pedido nessa situação.' : 'Nenhum pedido em aberto.');

  /** Finalizados que combinam com a busca/cliente (seção à parte: buscar um cliente e achar o histórico dele). */
  protected readonly finalizados = computed(() => {
    const enc = this.encerrados();
    if (!this.filtrando() || !enc) return [];
    return enc.filter(p => this.doCliente(p) && this.combinaComBusca(p));
  });

  protected readonly valorDe = valorDe;

  constructor() {
    inject(TopoService).definirTitulo('Pedidos');
    inject(DestroyRef).onDestroy(() => this.destruido.set(true));

    // a mesma tela serve #/pedidos, ?filtro= e ?cliente=: trocar a query refaz o estado (como renderizar de novo)
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(q => {
      const cliente = q.get('cliente');
      this.filtroChave.set(cliente !== null ? null : q.get('filtro'));
      this.clienteSel.set(cliente && /^\d+$/.test(cliente) ? cliente : '');
      this.busca.set('');
      this.encerrados.set(null);
    });

    this.cache.carregarComCache<[Cliente[]]>(['/api/clientes'])
      .then(([lista]) => {
        if (this.destruido()) return;
        this.clientes.set(lista);
        // cliente da URL que não existe mais: o select volta a "Todos os clientes"
        if (this.clienteSel() && !lista.some(c => String(c.id) === this.clienteSel())) this.clienteSel.set('');
      })
      .catch(() => { /* o interceptor já avisou */ });

    this.cache.comCache<PedidoLista[]>(PEDIDOS_ABERTOS, lista => this.abertos.set(lista))
      .catch(() => { /* o interceptor já avisou */ });

    // buscar (ou filtrar por cliente) também procura nos encerrados: carrega uma vez, depois que os abertos apareceram
    effect(() => {
      this.busca();
      this.clienteSel();
      if (this.abertos() === null || !this.filtrando() || this.encerrados() !== null || this.buscandoEncerrados) return;
      this.buscandoEncerrados = true;
      this.api.get<{ pedidos: PedidoLista[] }[] | null>('/api/pedidos/encerrados')
        .then(grupos => {
          if (!this.destruido()) this.encerrados.set((grupos || []).flatMap(g => g.pedidos));
        })
        .catch(() => { /* o interceptor já avisou; a próxima busca tenta de novo */ })
        .finally(() => { this.buscandoEncerrados = false; });
    });
  }

  private doCliente(p: PedidoLista): boolean {
    const id = this.clienteSel();
    return !id || String(p.clienteId) === id;
  }

  /** Cliente, modelos e nº do pedido (com ou sem "#" e zeros à esquerda), sem acento e sem maiúscula. */
  private combinaComBusca(p: PedidoLista): boolean {
    const termo = this.termo();
    if (!termo) return true;
    return semAcentoBusca(p.clienteNome).includes(termo)
      || semAcentoBusca(p.componentesResumo).includes(termo)
      || String(p.id) === termo.replace(/^#/, '').replace(/^0+/, '');
  }

  private encontrados(n: number): string {
    return n + (n === 1 ? ' em aberto encontrado' : ' em aberto encontrados');
  }

  protected escolherCliente(ev: Event): void {
    this.clienteSel.set(valorDe(ev));
  }

  protected verTodos(): void {
    void this.router.navigate(['/pedidos']);
  }

  protected verFinalizados(): void {
    void this.router.navigate(['/encerrados']);
  }

  protected novoPedido(): void {
    void this.router.navigate(['/pedidos/novo']);
  }
}
