import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { CacheService } from './cache.service';
import { DialogoService } from './dialogo.service';
import { OrcamentoCacheService } from './orcamento-cache.service';

export interface PedidoDoMenu {
  id: number | string;
  finalizado: boolean;
}

/**
 * Menu "⋮ Mais opções" da barra do topo em #/pedidos/<id> (btnMenuPedido/menuPedidoPopover do
 * app.js). A tela do pedido registra o pedido carregado; o shell desenha o botão e o popover.
 */
@Injectable({ providedIn: 'root' })
export class MenuPedidoService {
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);
  private readonly orcamentos = inject(OrcamentoCacheService);
  private readonly router = inject(Router);

  /** Pedido da tela aberta; null enquanto carrega (popover vazio) e fora da tela do pedido. */
  readonly pedido = signal<PedidoDoMenu | null>(null);
  readonly aberto = signal(false);

  registrar(pedido: PedidoDoMenu): void {
    this.pedido.set(pedido);
  }

  limpar(): void {
    this.pedido.set(null);
    this.aberto.set(false);
  }

  alternar(): void {
    this.aberto.update(a => !a);
  }

  fechar(): void {
    this.aberto.set(false);
  }

  editar(): void {
    const p = this.pedido();
    this.fechar();
    if (p) void this.router.navigate(['/pedidos', p.id, 'editar']);
  }

  async excluir(): Promise<void> {
    const p = this.pedido();
    this.fechar();
    if (!p) return;
    if (!(await this.dialogo.confirmar('Excluir o pedido #' + p.id + '? Essa ação não pode ser desfeita.', 'Excluir', true))) return;
    try {
      await this.api.delete('/api/pedidos/' + p.id);
    } catch {
      return; // o interceptor já avisou
    }
    this.cache.invalidarPedidos();
    this.orcamentos.invalidar(p.id);
    this.dialogo.toast('Pedido deletado.');
    void this.router.navigate(['/pedidos']);
  }
}
