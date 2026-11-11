import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { Campo } from '../../shared/campo';
import { ModeloEntrada, ValorInicial } from '../../shared/entradas';
import { valorDe } from '../../shared/evento';
import { CATEGORIAS_COMPONENTE } from '../../shared/itens-pedido';
import { agruparPorCategoria } from '../../shared/lista-agrupada';
import { Cabecote, ValoresCategoria } from '../../shared/modelos';
import { comOcupado } from '../../shared/ocupado';
import { filtrarPorPalavras, semAcentoBusca } from '../../shared/texto';
import { EstadoPedidoForm } from './estado-pedido-form';

/** Sem texto na busca o seletor mostra só os primeiros modelos (o catálogo tem mais de mil); com texto, todos os que casam. */
export const LIMITE_MODELOS_SEM_BUSCA = 150;
const ATRASO_BUSCA_MS = 120;

/** Etapa "Componentes": categorias envolvidas, valores por categoria e modelos (com cadastro rápido). */
@Component({
  selector: 'app-aba-componentes',
  imports: [Campo, ModeloEntrada, ValorInicial],
  host: { style: 'display: contents' },
  template: `
    <div class="field">
      <label>Categorias envolvidas</label>
      <div class="chip-group">
        @for (cat of chips(); track cat.nome) {
          <button type="button" [class]="'chip' + (estado.marcada(cat.nome) ? ' active' : '')" [attr.data-categoria]="cat.nome"
                  (click)="estado.alternarCategoria(cat.nome)">{{ cat.rotulo }}</button>
        }
      </div>
    </div>

    <!-- um valor de serviços + um de peças por categoria, em vez de preço por item -->
    <div style="display:flex;flex-direction:column;gap:12px">
      @for (c of cartoes(); track c.nome + ':' + estado.versao()) {
        <div class="card-destaque elev-md blueprint" style="padding:14px">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          <div class="card-destaque-titulo" style="margin-bottom:10px">{{ estado.rotuloCategoria(c.nome) }}</div>
          <div class="row">
            <app-campo rotulo="Valor serviços">
              <input class="input" type="number" min="0" step="0.01" placeholder="0,00" data-valor="servicos"
                     [appValorInicial]="c.valores.valorServicos || ''" (input)="definirValor(c.nome, 'valorServicos', $event)">
            </app-campo>
            <app-campo rotulo="Valor peças">
              <input class="input" type="number" min="0" step="0.01" placeholder="0,00" data-valor="pecas"
                     [appValorInicial]="c.valores.valorPecas || ''" (input)="definirValor(c.nome, 'valorPecas', $event)">
            </app-campo>
          </div>
        </div>
      }
    </div>

    <div>
      <div class="empty" style="padding:16px 0" [hidden]="temCategoria()">Marque uma categoria acima pra ver os modelos disponíveis.</div>
      <div [hidden]="!temCategoria()">
        <div class="field">
          <label>Adicionar modelo</label>
          <!-- o catálogo de modelos é grande (centenas de motores): a busca filtra a lista antes de abrir o seletor -->
          <div style="display:flex;flex-direction:column;gap:8px">
            <input class="input" type="search" placeholder="Buscar modelo (ex.: AP 1.8, Fire, OM 366)..." aria-label="Buscar modelo"
                   [appModelo]="textoBusca()" (appModeloChange)="aoDigitarBusca($event)">
            <select class="input" aria-label="Modelo" (change)="modeloSel.set(valorDe($event))">
              <option value="" [selected]="modeloSel() === ''">{{ opcoes().placeholder }}</option>
              @for (g of opcoes().grupos; track g.rotulo) {
                <optgroup [label]="g.rotulo">
                  @for (i of g.itens; track i.id) {
                    <option [value]="i.id" [selected]="modeloSel() === '' + i.id">{{ i.nome }}</option>
                  }
                </optgroup>
              }
            </select>
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-block" (click)="adicionarModelo()">Adicionar modelo</button>
        <button type="button" class="btn btn-ghost btn-block" style="gap:8px" (click)="novoAberto.set(!novoAberto())">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>Novo modelo
        </button>
        <div class="caixa-form blueprint" style="margin-top:10px" [hidden]="!novoAberto()">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          <app-campo rotulo="Categoria">
            <select class="input" (change)="novaCategoria.set(valorDe($event))">
              @for (cat of estado.categoriasDeComponente(); track cat) {
                <option [value]="cat" [selected]="novaCategoria() === cat">{{ estado.rotuloCategoria(cat) }}</option>
              }
            </select>
          </app-campo>
          <app-campo rotulo="Nome / Motor">
            <input class="input" type="text" maxlength="255" placeholder="Nome / Motor" [value]="novoNome()" (input)="novoNome.set(valorDe($event))">
          </app-campo>
          <div class="row">
            <app-campo rotulo="Móvel">
              <input class="input" type="text" maxlength="255" placeholder="Móvel (ex.: 25,045-27,070)" [value]="novoMovel()" (input)="novoMovel.set(valorDe($event))">
            </app-campo>
            <app-campo rotulo="Fixo">
              <input class="input" type="text" maxlength="255" placeholder="Fixo (ex.: 29,990-30,015)" [value]="novoFixo()" (input)="novoFixo.set(valorDe($event))">
            </app-campo>
          </div>
          <button type="button" class="btn btn-secondary btn-block" [disabled]="salvando()" (click)="salvarModelo()">{{ salvando() ? 'Salvando…' : 'Salvar modelo' }}</button>
        </div>
        <div>
          @if (!estado.componentes().length) {
            <div style="text-align:center;font-size:13px;opacity:.55;padding:10px 0">Nenhum modelo adicionado ainda</div>
          }
          @for (item of estado.componentes(); track item.id; let idx = $index) {
            <div class="item-linha">
              <span>{{ item.nome }}</span>
              <button type="button" aria-label="Remover modelo" (click)="remover(idx)">✕</button>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class AbaComponentes {
  protected readonly estado = inject(EstadoPedidoForm);
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);

  protected readonly valorDe = valorDe;

  /** Chips das categorias que têm componente técnico (as de montagem/outro ficam de fora). */
  protected readonly chips = computed(() =>
    this.estado.catalogo().categorias.filter(cat => CATEGORIAS_COMPONENTE.includes(cat.nome)));

  /** Um cartão de valores por categoria de componente marcada, na ordem fixa das categorias. */
  protected readonly cartoes = computed(() => {
    const marcadas = this.estado.categorias();
    return CATEGORIAS_COMPONENTE
      .map(nome => ({ nome, valores: marcadas.find(([c]) => c === nome)?.[1] }))
      .filter((c): c is { nome: string; valores: ValoresCategoria } => !!c.valores);
  });

  protected readonly temCategoria = computed(() => this.estado.categoriasDeComponente().length > 0);

  // busca: o texto do campo é imediato, mas a lista só filtra depois que a digitação parar
  protected readonly textoBusca = signal('');
  private readonly termo = signal('');
  private temporizadorBusca: ReturnType<typeof setTimeout> | undefined;

  /** Opções do seletor: categorias marcadas + busca (cada palavra no nome, sem acento/maiúscula). */
  protected readonly opcoes = computed(() => {
    const relevantes = this.estado.categoriasDeComponente();
    const palavras = semAcentoBusca(this.termo()).split(/\s+/).filter(Boolean);
    const casam = filtrarPorPalavras(this.estado.catalogo().cabecotes.filter(c => relevantes.includes(c.categoria)), this.termo());
    const mostrados = palavras.length ? casam
      : agruparPorCategoria(casam).flatMap(g => g.itens).slice(0, LIMITE_MODELOS_SEM_BUSCA);
    const placeholder = casam.length
      ? (palavras.length
        ? casam.length + (casam.length === 1 ? ' modelo encontrado' : ' modelos encontrados')
        : (casam.length > LIMITE_MODELOS_SEM_BUSCA
          ? 'Selecione · digite para buscar entre ' + casam.length + ' modelos'
          : 'Selecione'))
      : 'Nenhum modelo com esse nome';
    return { casam, placeholder, grupos: agruparPorCategoria(mostrados) };
  });

  /** Modelo escolhido no seletor: volta ao "Selecione" quando as opções mudam; um resultado só já fica selecionado. */
  protected readonly modeloSel = linkedSignal(() => {
    const { casam } = this.opcoes();
    return casam.length === 1 ? String(casam[0].id) : '';
  });

  // cadastro rápido de modelo
  protected readonly novoAberto = signal(false);
  protected readonly novaCategoria = linkedSignal(() => this.estado.categoriasDeComponente()[0] ?? '');
  protected readonly novoNome = signal('');
  protected readonly novoMovel = signal('');
  protected readonly novoFixo = signal('');
  protected readonly salvando = signal(false);

  protected definirValor(nome: string, campo: keyof ValoresCategoria, ev: Event): void {
    const texto = valorDe(ev);
    this.estado.definirValorDaCategoria(nome, campo, texto !== '' ? Number(texto) : 0);
  }

  protected aoDigitarBusca(texto: string): void {
    this.textoBusca.set(texto);
    clearTimeout(this.temporizadorBusca);
    this.temporizadorBusca = setTimeout(() => this.termo.set(texto), ATRASO_BUSCA_MS);
  }

  private limparBusca(): void {
    clearTimeout(this.temporizadorBusca);
    this.textoBusca.set('');
    this.termo.set('');
  }

  protected adicionarModelo(): void {
    const item = this.estado.catalogo().cabecotes.find(c => String(c.id) === this.modeloSel());
    if (!item) { this.dialogo.toast('Selecione um modelo.', true); return; }
    if (this.estado.componentes().some(c => c.id === item.id)) { this.dialogo.toast('Esse modelo já foi adicionado.', true); return; }
    this.estado.componentes.update(l => [...l, { id: item.id, nome: item.nome }]);
    this.limparBusca();
  }

  protected remover(idx: number): void {
    this.estado.componentes.update(l => l.filter((_, i) => i !== idx));
  }

  protected async salvarModelo(): Promise<void> {
    const nome = this.novoNome().trim();
    if (!nome) { this.dialogo.toast('Informe o nome.', true); return; }
    const novo = await comOcupado(this.salvando, () => this.api.post<Cabecote>('/api/cabecotes', {
      categoria: this.novaCategoria(),
      nome,
      movelFaixa: this.novoMovel().trim() || null,
      fixoFaixa: this.novoFixo().trim() || null,
    }));
    if (!novo) return;
    this.estado.adicionarAoCatalogo('cabecotes', novo);
    this.cache.invalidar('/api/cabecotes');
    this.estado.componentes.update(l => [...l, { id: novo.id, nome: novo.nome }]);
    this.novoNome.set('');
    this.novoMovel.set('');
    this.novoFixo.set('');
    this.novoAberto.set(false);
    this.dialogo.toast('Modelo cadastrado.');
    this.estado.aoMudar();
  }
}
