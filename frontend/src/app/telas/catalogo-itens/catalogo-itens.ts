import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { ComGuardaSaida, GuardaSaida } from '../../core/guarda-saida.service';
import { TopoService } from '../../core/topo.service';
import { BotoesCadastro } from '../../shared/botoes-cadastro';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';
import { moeda } from '../../shared/formatacao';
import { FormularioRecolhivel } from '../../shared/formulario-recolhivel';
import { ListaAgrupada, agruparPorCategoria } from '../../shared/lista-agrupada';
import { Categoria, ItemCatalogo } from '../../shared/modelos';
import { comOcupado } from '../../shared/ocupado';
import { SeletorCategoria } from '../../shared/seletor-categoria';
import { cadastrados, chaveNome } from '../../shared/texto';

/**
 * Serviços (#/servicos) e Peças (#/pecas): telaCatalogo(tipo) do app.js. A rota
 * informa o tipo em `data.tipo` ('servicos' | 'pecas').
 */
@Component({
  selector: 'app-catalogo-itens',
  templateUrl: './catalogo-itens.html',
  imports: [Campo, SeletorCategoria, ListaAgrupada, BotoesCadastro, FormularioRecolhivel],
})
export class CatalogoItens implements ComGuardaSaida {
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);

  protected readonly ehServico = inject(ActivatedRoute).snapshot.data['tipo'] === 'servicos';
  protected readonly titulo = this.ehServico ? 'Serviços' : 'Peças';
  private readonly base = this.ehServico ? '/api/servicos-catalogo' : '/api/pecas-catalogo';

  protected readonly lista = signal<ItemCatalogo[]>([]);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly carregado = signal(false);
  protected readonly grupos = computed(() => agruparPorCategoria(this.lista()));
  protected readonly subtitulo = computed(() => cadastrados(this.lista().length));

  protected readonly emEdicaoId = signal<number | null>(null);
  protected readonly categoria = signal('');
  protected readonly nome = signal('');
  protected readonly valor = signal('');
  protected readonly salvando = signal(false);
  protected readonly removendo = signal(false);

  protected readonly cadastro = viewChild<FormularioRecolhivel<ItemCatalogo>>('cadastro');

  protected readonly valorDe = valorDe;
  protected readonly moeda = moeda;

  /** Valores dos campos juntos (detecta alterações não salvas). */
  protected readonly fotografia = () => [this.categoria(), this.nome(), this.valor()].join('\u0001');

  constructor() {
    inject(TopoService).definirTitulo(this.titulo);
    void this.carregar();
  }

  guardaSaida(): GuardaSaida | null {
    return this.cadastro()?.guardaSaida() ?? null;
  }

  private async carregar(): Promise<void> {
    try {
      const [lista, categorias] = await this.cache.carregarComCache<[ItemCatalogo[], Categoria[]]>([this.base, '/api/categorias']);
      this.lista.set(lista);
      this.categorias.set(categorias);
      this.carregado.set(true);
    } catch { /* o interceptor já avisou */ }
  }

  private async recarregarLista(): Promise<void> {
    this.cache.invalidar(this.base);
    try {
      this.lista.set(await this.cache.buscarECachear<ItemCatalogo[]>(this.base));
    } catch { /* o interceptor já avisou; a próxima visita busca de novo */ }
  }

  protected preencher(item: ItemCatalogo): void {
    this.emEdicaoId.set(item.id);
    this.categoria.set(item.categoria);
    this.nome.set(item.nome || '');
    this.valor.set(item.valor != null ? String(item.valor) : '');
  }

  protected limpar(): void {
    this.emEdicaoId.set(null);
    this.categoria.set(this.categorias()[0]?.nome ?? '');
    this.nome.set('');
    this.valor.set('');
  }

  protected async remover(): Promise<void> {
    const alvo = this.emEdicaoId();
    if (alvo === null) return;
    if (!(await this.dialogo.confirmar('Remover este item do catálogo?', 'Remover', true))) return;
    await comOcupado(this.removendo, async () => {
      await this.api.delete(this.base + '/' + alvo);
      this.cadastro()?.fechar();
      this.dialogo.toast('Removido.');
      await this.recarregarLista();
    });
  }

  protected async salvar(ev: Event): Promise<void> {
    ev.preventDefault();
    if (!this.nome().trim()) { this.dialogo.toast('Informe o nome.', true); return; }
    const corpo = { categoria: this.categoria(), nome: this.nome().trim(), valor: Number(this.valor() || 0) };
    const alvo = this.emEdicaoId();
    // mesmo nome na mesma categoria aparece duas vezes na hora de montar
    // o pedido e acaba entrando repetido: bloqueia já no cadastro
    if (this.lista().some(i => i.id !== alvo && i.categoria === corpo.categoria && chaveNome(i.nome) === chaveNome(corpo.nome))) {
      this.dialogo.toast((this.ehServico ? 'Já existe um serviço' : 'Já existe uma peça') + ' com esse nome nessa categoria.', true);
      return;
    }
    await comOcupado(this.salvando, async () => {
      if (alvo) await this.api.put(this.base + '/' + alvo, corpo);
      else await this.api.post(this.base, corpo);
      this.cadastro()?.fechar();
      this.dialogo.toast('Salvo.');
      await this.recarregarLista();
    });
  }
}
