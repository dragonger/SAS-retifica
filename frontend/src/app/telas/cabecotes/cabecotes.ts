import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ApiService, ErroApi } from '../../core/api.service';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { ComGuardaSaida, GuardaSaida } from '../../core/guarda-saida.service';
import { TopoService } from '../../core/topo.service';
import { BotoesCadastro } from '../../shared/botoes-cadastro';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';
import { FormularioRecolhivel } from '../../shared/formulario-recolhivel';
import { ListaAgrupada, agruparPorCategoria } from '../../shared/lista-agrupada';
import { Cabecote, Categoria } from '../../shared/modelos';
import { comOcupado } from '../../shared/ocupado';
import { SeletorCategoria } from '../../shared/seletor-categoria';
import { cadastrados, filtrarPorPalavras } from '../../shared/texto';

const PATH = '/api/cabecotes';
/** Só os primeiros itens aparecem; "Mostrar mais" acrescenta o próximo lote. */
const LOTE_PRODUTOS = 100;
const ATRASO_BUSCA_MS = 120;

/** Produtos (#/cabecotes): telaCabecotes do app.js. */
@Component({
  selector: 'app-cabecotes',
  templateUrl: './cabecotes.html',
  imports: [Campo, SeletorCategoria, ListaAgrupada, BotoesCadastro, FormularioRecolhivel],
})
export class Cabecotes implements ComGuardaSaida {
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);

  protected readonly lista = signal<Cabecote[]>([]);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly carregado = signal(false);
  protected readonly subtitulo = computed(() => 'Cabeçotes, blocos, bielas e virabrequins — ' + cadastrados(this.lista().length));

  // busca: cada palavra precisa aparecer no nome (sem acento/maiúscula) — "ap 1.8", "om 366", "fire 16v"
  protected readonly termo = signal('');
  private readonly limite = signal(LOTE_PRODUTOS);
  private temporizadorBusca: ReturnType<typeof setTimeout> | undefined;

  protected readonly visiveis = computed(() => filtrarPorPalavras(this.lista(), this.termo()));
  /** Agrupa antes de cortar: assim o corte não intercala categorias e "Mostrar mais" só acrescenta itens ao fim da lista. */
  protected readonly exibidos = computed(() => agruparPorCategoria(this.visiveis()).flatMap(g => g.itens).slice(0, this.limite()));
  protected readonly grupos = computed(() => agruparPorCategoria(this.exibidos()));
  protected readonly restantes = computed(() => this.visiveis().length - this.exibidos().length);

  protected readonly emEdicaoId = signal<number | null>(null);
  protected readonly categoria = signal('');
  protected readonly nome = signal('');
  protected readonly movel = signal('');
  protected readonly fixo = signal('');
  protected readonly salvando = signal(false);
  protected readonly removendo = signal(false);

  protected readonly cadastro = viewChild<FormularioRecolhivel<Cabecote>>('cadastro');
  protected readonly valorDe = valorDe;

  protected readonly fotografia = () => [this.categoria(), this.nome(), this.movel(), this.fixo()].join('\u0001');

  constructor() {
    inject(TopoService).definirTitulo('Produtos');
    void this.carregar();
  }

  guardaSaida(): GuardaSaida | null {
    return this.cadastro()?.guardaSaida() ?? null;
  }

  private async carregar(): Promise<void> {
    try {
      const [lista, categorias] = await this.cache.carregarComCache<[Cabecote[], Categoria[]]>([PATH, '/api/categorias']);
      this.lista.set(lista);
      this.categorias.set(categorias);
      this.carregado.set(true);
    } catch { /* o interceptor já avisou */ }
  }

  private async recarregarLista(): Promise<void> {
    this.cache.invalidar(PATH);
    try {
      this.lista.set(await this.cache.buscarECachear<Cabecote[]>(PATH));
    } catch { /* o interceptor já avisou; a próxima visita busca de novo */ }
  }

  /** Espera a digitação parar antes de filtrar (não redesenha a cada tecla). */
  protected aoDigitarBusca(ev: Event): void {
    const novo = valorDe(ev);
    clearTimeout(this.temporizadorBusca);
    this.temporizadorBusca = setTimeout(() => {
      if (novo !== this.termo()) this.limite.set(LOTE_PRODUTOS);
      this.termo.set(novo);
    }, ATRASO_BUSCA_MS);
  }

  protected mostrarMais(): void {
    this.limite.update(l => l + LOTE_PRODUTOS);
  }

  protected preencher(c: Cabecote): void {
    this.emEdicaoId.set(c.id);
    this.categoria.set(c.categoria);
    this.nome.set(c.nome || '');
    this.movel.set(c.movelFaixa || '');
    this.fixo.set(c.fixoFaixa || '');
  }

  protected limpar(): void {
    this.emEdicaoId.set(null);
    this.categoria.set(this.categorias()[0]?.nome ?? '');
    this.nome.set('');
    this.movel.set('');
    this.fixo.set('');
  }

  protected async remover(): Promise<void> {
    const alvo = this.emEdicaoId();
    if (alvo === null) return;
    if (!(await this.dialogo.confirmar('Remover este produto?', 'Remover', true))) return;
    await comOcupado(this.removendo, async () => {
      try {
        await this.api.delete(PATH + '/' + alvo, { statusSemAviso: [409] });
      } catch (e) {
        if (e instanceof ErroApi && e.status === 409) this.dialogo.toast('Não foi possível remover: esse modelo está em pedidos.', true);
        return;
      }
      this.cadastro()?.fechar();
      this.dialogo.toast('Removido.');
      await this.recarregarLista();
    });
  }

  protected async salvar(ev: Event): Promise<void> {
    ev.preventDefault();
    if (!this.nome().trim()) { this.dialogo.toast('Informe o nome.', true); return; }
    const corpo = {
      categoria: this.categoria(),
      nome: this.nome().trim(),
      movelFaixa: this.movel().trim() || null,
      fixoFaixa: this.fixo().trim() || null,
    };
    const alvo = this.emEdicaoId();
    await comOcupado(this.salvando, async () => {
      if (alvo) await this.api.put(PATH + '/' + alvo, corpo);
      else await this.api.post(PATH, corpo);
      this.cadastro()?.fechar();
      this.dialogo.toast('Salvo.');
      await this.recarregarLista();
    });
  }
}
