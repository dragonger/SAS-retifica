import { Component, ElementRef, WritableSignal, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { Campo } from '../../shared/campo';
import { ModeloEntrada } from '../../shared/entradas';
import { valorDe } from '../../shared/evento';
import { itensDisponiveis, mesmoItem, rotuloDoItem } from '../../shared/itens-pedido';
import { agruparPorCategoria } from '../../shared/lista-agrupada';
import { ItemCatalogo, ItemPedido } from '../../shared/modelos';
import { comOcupado } from '../../shared/ocupado';
import { chaveNome } from '../../shared/texto';
import { EstadoPedidoForm } from './estado-pedido-form';

/**
 * Seleção em lote de serviços ou peças (criarPickerBatch do app.js) + a lista do que já está no pedido.
 * Como os itens não carregam preço, marcam-se vários de uma vez; o "Novo serviço/Nova peça" cadastra no
 * catálogo (ou reaproveita o de mesmo nome) e já adiciona ao pedido.
 */
@Component({
  selector: 'app-seletor-itens',
  imports: [Campo, ModeloEntrada],
  host: { style: 'display: contents' },
  template: `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;flex-direction:column;gap:14px">
        @if (!disponiveis().length) {
          <div class="empty" style="padding:12px 0">Nenhum item disponível pra adicionar.</div>
        }
        @for (g of grupos(); track g.rotulo) {
          <div class="grupo-categoria">
            <h3>{{ g.rotulo }}</h3>
            @for (item of g.itens; track item.id) {
              <label class="item-linha" style="cursor:pointer">
                <div style="display:flex;align-items:center;gap:10px">
                  <input type="checkbox" [checked]="marcados().has(item.id)" (change)="alternar(item.id)">
                  <span>{{ item.nome }}</span>
                </div>
                @if (comQuantidade()) {
                  <input class="input" type="number" min="1" step="1" style="width:56px" [hidden]="!marcados().has(item.id)"
                         [appModelo]="quantidadeDe(item.id)" (appModeloChange)="definirQuantidade(item.id, $event)">
                }
              </label>
            }
          </div>
        }
      </div>
      <button type="button" class="btn btn-secondary btn-block" (click)="adicionarSelecionados()">Adicionar selecionados</button>
      <button type="button" class="btn btn-ghost btn-block" style="gap:8px" (click)="alternarNovo()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>{{ rotuloNovo() }}
      </button>
      <div class="caixa-form blueprint" style="margin-top:10px" [hidden]="!novoAberto()">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <app-campo rotulo="Categoria">
          <select class="input" (change)="novaCategoria.set(valorDe($event))">
            @for (c of categoriasNovo(); track c.nome) {
              <option [value]="c.nome" [selected]="novaCategoria() === c.nome">{{ c.rotulo }}</option>
            }
          </select>
        </app-campo>
        <app-campo rotulo="Nome">
          <input #campoNome class="input" type="text" maxlength="255" [placeholder]="(feminino() ? 'Nome da ' : 'Nome do ') + singular()"
                 [value]="novoNome()" (input)="novoNome.set(valorDe($event))">
        </app-campo>
        @if (comQuantidade()) {
          <app-campo rotulo="Quantidade">
            <input class="input" type="number" min="1" step="1" [appModelo]="novaQuantidade()" (appModeloChange)="novaQuantidade.set($event)">
          </app-campo>
        }
        <button type="button" class="btn btn-secondary btn-block" [disabled]="salvando()" (click)="salvarNovo()">{{ salvando() ? 'Salvando…' : 'Salvar ' + singular() }}</button>
      </div>
    </div>

    <!-- o que já está no pedido -->
    <div>
      @if (!lista().length) {
        <div style="text-align:center;font-size:13px;opacity:.55;padding:20px 0">Nenhum item adicionado ainda</div>
      }
      @for (item of lista(); track $index; let idx = $index) {
        <div class="item-linha">
          <span>{{ rotulo(idx) }}</span>
          <button type="button" aria-label="Remover item" (click)="remover(idx)">✕</button>
        </div>
      }
    </div>
  `,
})
export class SeletorItens {
  private readonly estado = inject(EstadoPedidoForm);
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);

  readonly tipo = input.required<'servicos' | 'pecas'>();
  readonly comQuantidade = input(false);
  readonly rotuloNovo = input.required<string>();
  readonly singular = input.required<string>();
  readonly feminino = input(false);
  readonly endpoint = input.required<string>();

  protected readonly valorDe = valorDe;

  protected readonly lista = computed<ItemPedido[]>(() => this.estado[this.tipo()]());
  private get listaSinal(): WritableSignal<ItemPedido[]> { return this.estado[this.tipo()]; }
  private readonly catalogo = computed<ItemCatalogo[]>(() => this.estado.catalogo()[this.tipo()]);

  /** Itens do catálogo das categorias marcadas que ainda não estão no pedido (muda só quando a lista de fato muda). */
  protected readonly disponiveis = computed(
    () => itensDisponiveis(this.catalogo(), this.estado.categorias(), this.lista()),
    { equal: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) },
  );
  protected readonly grupos = computed(() => agruparPorCategoria(this.disponiveis()));

  /** Marcados e quantidades: recomeçam sempre que a lista de itens disponíveis muda (o app.js reconstrói o seletor). */
  protected readonly marcados = linkedSignal<ItemCatalogo[], Set<number>>({ source: this.disponiveis, computation: () => new Set<number>() });
  private readonly quantidades = linkedSignal<ItemCatalogo[], Map<number, string>>({ source: this.disponiveis, computation: () => new Map<number, string>() });

  // cadastro rápido
  protected readonly novoAberto = signal(false);
  protected readonly novoNome = signal('');
  protected readonly novaQuantidade = signal('1');
  protected readonly salvando = signal(false);
  /** Categorias marcadas no pedido primeiro (é onde o item novo vai aparecer no filtro); sem nenhuma marcada, todas. */
  protected readonly categoriasNovo = computed(() => {
    const todas = this.estado.catalogo().categorias;
    const marcadas = todas.filter(c => this.estado.marcada(c.nome));
    return marcadas.length ? marcadas : todas;
  }, { equal: (a, b) => a.map(c => c.nome).join() === b.map(c => c.nome).join() });
  protected readonly novaCategoria = linkedSignal(() => this.categoriasNovo()[0]?.nome ?? '');

  protected rotulo(idx: number): string {
    return rotuloDoItem(this.lista(), idx, nome => this.estado.rotuloCategoria(nome), this.comQuantidade());
  }

  protected quantidadeDe(id: number): string {
    return this.quantidades().get(id) ?? '1';
  }

  protected definirQuantidade(id: number, texto: string): void {
    this.quantidades.update(m => new Map(m).set(id, texto));
  }

  protected alternar(id: number): void {
    this.marcados.update(s => {
      const novo = new Set(s);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  }

  protected remover(idx: number): void {
    this.listaSinal.update(l => l.filter((_, i) => i !== idx));
  }

  private readonly campoNome = viewChild<ElementRef<HTMLInputElement>>('campoNome');

  protected alternarNovo(): void {
    this.novoAberto.set(!this.novoAberto());
    if (this.novoAberto()) setTimeout(() => this.campoNome()?.nativeElement.focus(), 0); // depois de o campo aparecer
  }

  protected adicionarSelecionados(): void {
    let algum = false;
    const novos: ItemPedido[] = [];
    const naTela = this.grupos().flatMap(g => g.itens); // na ordem em que aparecem
    for (const item of naTela) {
      if (!this.marcados().has(item.id)) continue;
      algum = true;
      // já no pedido (inclusive marcado agora, se o catálogo tiver o mesmo nome duas vezes na categoria): não repete
      if ([...this.lista(), ...novos].some(i => mesmoItem(i, item.nome, item.categoria))) continue;
      const entrada: ItemPedido = { descricao: item.nome, categoria: item.categoria };
      if (this.comQuantidade()) entrada.quantidade = Math.max(1, parseInt(this.quantidadeDe(item.id) || '1', 10) || 1);
      novos.push(entrada);
    }
    if (!algum) { this.dialogo.toast('Selecione pelo menos um item.', true); return; }
    this.listaSinal.update(l => [...l, ...novos]);
    this.marcados.set(new Set()); // o seletor recomeça sem nada marcado
  }

  protected async salvarNovo(): Promise<void> {
    const nome = this.novoNome().trim();
    const categoria = this.novaCategoria();
    const fem = this.feminino();
    const singular = this.singular();
    if (!nome) { this.dialogo.toast('Informe o nome.', true); return; }
    if (this.lista().some(i => mesmoItem(i, nome, categoria))) {
      this.dialogo.toast((fem ? 'Essa ' : 'Esse ') + singular + ' já está no pedido.', true);
      return;
    }
    // já existe no catálogo com esse nome: só adiciona, sem duplicar
    let item: ItemCatalogo | undefined = this.catalogo().find(c => chaveNome(c.nome) === chaveNome(nome) && c.categoria === categoria);
    if (!item) {
      item = await comOcupado(this.salvando, () => this.api.post<ItemCatalogo>(this.endpoint(), { categoria, nome, valor: 0 }));
      if (!item) return;
      this.estado.adicionarAoCatalogo(this.tipo(), item);
      this.cache.invalidar(this.endpoint());
    }
    const entrada: ItemPedido = { descricao: item.nome, categoria: item.categoria };
    if (this.comQuantidade()) entrada.quantidade = Math.max(1, parseInt(this.novaQuantidade() || '1', 10) || 1);
    this.listaSinal.update(l => [...l, entrada]);
    this.novoNome.set('');
    if (this.comQuantidade()) this.novaQuantidade.set('1');
    this.novoAberto.set(false);
    const Singular = singular.charAt(0).toUpperCase() + singular.slice(1);
    this.dialogo.toast(Singular + (fem ? ' adicionada: ' : ' adicionado: ') + item.nome);
    this.estado.aoMudar();
  }
}
