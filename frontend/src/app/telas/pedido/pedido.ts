import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ApiService, ErroApi } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CacheService } from '../../core/cache.service';
import { CompartilharService } from '../../core/compartilhar.service';
import { DialogoService } from '../../core/dialogo.service';
import { FotoOrcamentoService } from '../../core/foto-orcamento.service';
import { ComGuardaSaida, GuardaSaida } from '../../core/guarda-saida.service';
import { MenuPedidoService } from '../../core/menu-pedido.service';
import { OrcamentoCacheService } from '../../core/orcamento-cache.service';
import { TopoService } from '../../core/topo.service';
import { TagSituacao } from '../../shared/tag-situacao';
import { formatarDataBr, moeda } from '../../shared/formatacao';
import { ItemPedido, PedidoDetalhe } from '../../shared/modelos';
import { comOcupado } from '../../shared/ocupado';
import { soDigitos, telefoneExibicao } from '../../shared/telefone';
import { chaveNome } from '../../shared/texto';
import { WhatsAppService } from '../../core/whatsapp.service';

const ROTULOS_CATEGORIA: Record<string, string> = {
  CABECOTE: 'Cabeçote', BLOCO: 'Bloco', BIELA: 'Biela', VIRABREQUIM: 'Virabrequim', MONTAGEM: 'Montagem', OUTRO: 'Outro',
};

/** Link wa.me pro número (DDI 55 se vier só com DDD); null se não parecer celular/fixo BR (linkWhatsApp do app.js). */
export function linkWhatsApp(telefone: string | null | undefined, texto?: string): string | null {
  let d = soDigitos(telefone);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  else if (!(d.startsWith('55') && (d.length === 12 || d.length === 13))) return null;
  return 'https://wa.me/' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

/** Pedido (#/pedidos/<id>): telaVisualizarPedido do app.js. */
@Component({
  selector: 'app-pedido',
  templateUrl: './pedido.html',
  imports: [TagSituacao],
  host: { style: 'display: contents' }, // a barra do total é sticky em relação ao <main>
})
export class Pedido implements ComGuardaSaida {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);
  private readonly orcamentos = inject(OrcamentoCacheService);
  private readonly compartilhar = inject(CompartilharService);
  private readonly fotos = inject(FotoOrcamentoService);
  private readonly whatsApp = inject(WhatsAppService);
  private readonly menu = inject(MenuPedidoService);
  private readonly topo = inject(TopoService);
  private readonly route = inject(ActivatedRoute);

  /** undefined = carregando; null = não encontrado. */
  protected readonly pedido = signal<PedidoDetalhe | null | undefined>(undefined);
  protected id = '';
  private carga = 0;
  private destruido = false;

  // — orçamento (PDF) —
  /** Preenchido ao tocar em algo que precisa do PDF ou pelo pré-carregamento depois da tela pintada. */
  private pdfPromise: Promise<Blob> | null = null;
  /** PDFs já prontos (por promise): com o PDF em mãos, baixar e abrir a conversa acontecem no mesmo toque. */
  private readonly pdfsProntos = new WeakMap<Promise<Blob>, Blob | null>();

  // — foto do componente pra ir junto no orçamento: nunca é enviada pro servidor nem salva em lugar
  // nenhum, só passa direto no compartilhamento —
  protected readonly fotoSelecionada = signal<File | null>(null);
  /** PDF com a foto já embutida, montado assim que a foto é escolhida: no toque ele já está pronto. */
  private pdfFotoPromise: Promise<Blob> | null = null;
  /** Plano B: se não deu pra juntar, o PDF vai sozinho e depois aparece o botão pra mandar a foto num segundo compartilhamento. */
  protected readonly pdfJaEnviado = signal(false);
  /** A foto só existe neste aparelho e na tela: sair antes de enviá-la a descarta. */
  private fotoUsada = false;

  // — WhatsApp —
  protected readonly modoApi = signal(false);
  protected readonly pdfSalvoPraWa = signal(false);
  /** Texto do botão enquanto ocupado ("Preparando o PDF…" / "Enviando…"); null = livre. */
  protected readonly waOcupado = signal<string | null>(null);
  protected readonly finalizando = signal(false);

  private readonly previaFoto = viewChild<ElementRef<HTMLElement>>('previaFoto');

  protected readonly moeda = moeda;
  protected readonly telefoneExibicao = telefoneExibicao;

  protected readonly numeroOrcamento = computed(() => String(this.pedido()?.id ?? this.id).padStart(4, '0'));

  protected readonly enderecoCliente = computed(() => {
    const c = this.pedido()?.cliente;
    if (!c || !(c.rua || c.municipio)) return null;
    return [c.rua, c.numero].filter(Boolean).join(', ')
      + (c.bairro ? ' – ' + c.bairro : '')
      + (c.municipio ? ', ' + c.municipio + (c.uf ? '/' + c.uf : '') : '');
  });

  /** Componentes agrupados por categoria ("Cabeçote: A, B"); vazio se o pedido não tem componentes. */
  protected readonly linhasComponente = computed<[string, string][]>(() => {
    const comps = this.pedido()?.componentes;
    if (!comps || !comps.length) return [];
    const porCategoria = new Map<string, string[]>();
    comps.forEach(c => {
      const rotulo = c.categoriaRotulo || 'Modelo';
      if (!porCategoria.has(rotulo)) porCategoria.set(rotulo, []);
      porCategoria.get(rotulo)!.push(c.nome);
    });
    return Array.from(porCategoria.entries()).map(([rotulo, nomes]) => [rotulo, nomes.join(', ')]);
  });

  private readonly primeiroNome = computed(() => {
    const nome = this.pedido()?.cliente?.nome;
    return nome ? nome.trim().split(/\s+/)[0].toLowerCase().replace(/^./, c => c.toUpperCase()) : '';
  });

  private readonly linkWa = computed(() => {
    const p = this.pedido();
    if (!p || !p.cliente) return null;
    const nomeEmpresa = this.auth.sessao()?.empresaNome || 'Retífica Dih Soluções';
    // "Modelo" igual ao do PDF: os modelos do pedido, ou a descrição dele.
    const modelo = p.componentes && p.componentes.length
      ? p.componentes.map(c => c.nome).filter(Boolean).join(', ')
      : (p.pedidoDescricao || '').trim();
    const primeiro = this.primeiroNome();
    return linkWhatsApp(p.cliente.telefone,
      'Olá' + (primeiro ? ', ' + primeiro : '') + '! Segue o orçamento nº ' + this.numeroOrcamento() + ' da ' + nomeEmpresa + '.'
      + (modelo ? '\nModelo: ' + modelo : ''));
  });

  protected readonly temWhatsApp = computed(() => this.linkWa() !== null);

  protected readonly rotuloWhatsApp = computed(() => {
    if (this.modoApi()) return 'Enviar orçamento no WhatsApp do cliente';
    return this.pdfSalvoPraWa() ? 'Abrir conversa no WhatsApp' : 'Enviar no WhatsApp do cliente';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      this.menu.limpar();
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(m => void this.carregar(m.get('id') ?? ''));
  }

  guardaSaida(): GuardaSaida | null {
    return {
      tipo: 'formulario',
      sujo: () => !!this.fotoSelecionada() && !this.fotoUsada,
      mensagem: 'Você escolheu uma foto para o orçamento, mas ainda não a enviou. Se sair agora, a escolha será descartada.',
      rotuloSair: 'Sair e descartar a foto',
    };
  }

  private async carregar(id: string): Promise<void> {
    const minha = ++this.carga;
    this.id = id;
    this.topo.definirTitulo('Pedido #' + id);
    this.pedido.set(undefined);
    this.menu.limpar();
    this.pdfPromise = null;
    this.pdfFotoPromise = null;
    this.fotoSelecionada.set(null);
    this.pdfJaEnviado.set(false);
    this.fotoUsada = false;
    this.modoApi.set(false);
    this.pdfSalvoPraWa.set(false);

    let p: PedidoDetalhe | null;
    try {
      p = await this.api.get<PedidoDetalhe | null>('/api/pedidos/' + id);
    } catch {
      return; // o interceptor já avisou; fica em "Carregando..."
    }
    if (minha !== this.carga || this.destruido) return; // usuário já saiu dessa tela
    if (!p) { this.pedido.set(null); return; }

    this.pedido.set(p);
    this.menu.registrar({ id, finalizado: !!p.finalizado });

    if (this.linkWa()) {
      void this.whatsApp.apiHabilitada().then(ligada => {
        if (ligada && minha === this.carga && !this.destruido) this.modoApi.set(true);
      });
    }

    // Pré-carrega o PDF (necessário pro share no iOS), mas só depois da tela pintada e só se o
    // usuário ainda estiver nela.
    const depoisDaPintura = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f: () => void) => setTimeout(f, 0);
    depoisDaPintura(() => setTimeout(() => {
      if (minha === this.carga && !this.destruido && !this.pdfPromise) this.pdfBase();
    }, 0));
  }

  // ---------- apresentação ----------

  protected formatarData = formatarDataBr;

  protected rotuloItem(itens: ItemPedido[], i: ItemPedido, idx: number, comQuantidade: boolean): string {
    // mesmo nome em dois componentes: mostra de qual é cada um
    const ambiguo = itens.some((o, j) => j !== idx && chaveNome(o.descricao) === chaveNome(i.descricao));
    const rotulo = i.descricao + (ambiguo && i.categoria ? ' · ' + (ROTULOS_CATEGORIA[i.categoria] || i.categoria) : '');
    return comQuantidade ? rotulo + ' ×' + i.quantidade : rotulo;
  }

  protected rotuloDesconto(p: PedidoDetalhe): string {
    return p.descontoTipo === 'PERCENTUAL' ? 'Desconto (' + p.descontoValor + '%)' : 'Desconto';
  }

  protected descontoAplicado(p: PedidoDetalhe): number {
    return (p.subtotal ?? 0) - (p.totalGeral ?? 0);
  }

  // ---------- PDF ----------

  /** Lembra o blob quando a promessa resolve, pra o toque seguinte já ter o PDF em mãos. */
  private lembrarPdf(promessa: Promise<Blob>): Promise<Blob> {
    if (!this.pdfsProntos.has(promessa)) {
      this.pdfsProntos.set(promessa, null);
      promessa.then(b => this.pdfsProntos.set(promessa, b), () => { /* tratado no toque */ });
    }
    return promessa;
  }

  private pdfBase(): Promise<Blob> {
    if (!this.pdfPromise) this.pdfPromise = this.orcamentos.preparar(this.id);
    return this.lembrarPdf(this.pdfPromise);
  }

  private pdfAtual(): Promise<Blob> {
    if (this.fotoSelecionada()) this.fotoUsada = true;
    return this.fotoSelecionada() && this.pdfFotoPromise ? this.lembrarPdf(this.pdfFotoPromise) : this.pdfBase();
  }

  /**
   * Toque em "Gerar orçamento". Tudo aqui roda síncrono até o navigator.share (dentro de
   * compartilharOrcamento): canShare() é síncrono e decide ANTES de abrir qualquer aba. Se for
   * tentar o Web Share não abre aba nenhuma: window.open() consome a permissão do toque e sem ela
   * navigator.share() rejeita com NotAllowedError. Só reserva a aba (evita bloqueio de pop-up)
   * quando o Web Share nem vai ser tentado.
   */
  protected gerarOrcamento(): void {
    const vaiTentarCompartilhar = this.compartilhar.temSuporteACompartilharArquivo();
    const novaAba = vaiTentarCompartilhar ? null : window.open('', '_blank');
    const pdfSimples = this.pdfPromise || this.orcamentos.preparar(this.id);
    let fotoFicouDeFora = false;
    const pdfFinal = this.fotoSelecionada() && this.pdfFotoPromise
      ? this.pdfFotoPromise.catch(() => {
        // não deu pra juntar (ex.: sem internet pra baixar a biblioteca na 1ª vez): manda só o orçamento
        fotoFicouDeFora = true;
        return pdfSimples;
      })
      : pdfSimples;
    void this.compartilhar.compartilharOrcamento(pdfFinal, 'orcamento-' + this.id + '.pdf', novaAba).then(r => {
      if (r === 'compartilhado' && !fotoFicouDeFora) this.fotoUsada = true;
      if (r === 'compartilhado' && fotoFicouDeFora && this.fotoSelecionada()) {
        this.pdfJaEnviado.set(true);
        setTimeout(() => this.previaFoto()?.nativeElement.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 0);
        this.dialogo.toast('Não deu pra juntar a foto ao PDF. Toque em "Enviar a foto também".', true);
      }
    });
  }

  // ---------- finalizar ----------

  protected async finalizar(): Promise<void> {
    if (!(await this.dialogo.confirmar('Finalizar o pedido #' + this.id + '? A data de entrega será registrada agora.', 'Finalizar'))) return;
    const id = this.id;
    await comOcupado(this.finalizando, async () => {
      await this.api.post('/api/pedidos/' + id + '/finalizar');
      this.cache.invalidarPedidos();
      this.orcamentos.invalidar(id);
      this.dialogo.toast('Pedido finalizado.');
      void this.carregar(id); // desenha de novo (sem o Finalizar nem o Editar)
    });
  }

  // ---------- foto ----------

  protected fotoEscolhida(ev: Event): void {
    const foto = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.fotoSelecionada.set(foto);
    this.pdfJaEnviado.set(false);
    this.fotoUsada = false;
    this.pdfFotoPromise = foto ? this.fotos.pdfComFoto(this.pdfPromise || this.orcamentos.preparar(this.id), foto) : null;
    this.pdfFotoPromise?.catch(() => { /* tratado no toque */ });
    this.resetarWhatsApp();
  }

  protected removerFoto(entrada: HTMLInputElement): void {
    this.fotoSelecionada.set(null);
    this.pdfFotoPromise = null;
    entrada.value = '';
    this.resetarWhatsApp();
  }

  protected async enviarFotoTambem(): Promise<void> {
    const foto = this.fotoSelecionada();
    if (!foto) return;
    if (await this.compartilhar.compartilharFoto(foto)) {
      this.fotoUsada = true;
      this.dialogo.toast('Foto compartilhada.');
    }
  }

  /** Foto trocada/removida: o PDF salvo antes não vale mais. */
  private resetarWhatsApp(): void {
    if (this.pdfFotoPromise) this.lembrarPdf(this.pdfFotoPromise);
    if (this.pdfSalvoPraWa() && !this.modoApi()) this.pdfSalvoPraWa.set(false);
  }

  // ---------- WhatsApp ----------

  private async comOcupadoWa<T>(texto: string, acao: () => Promise<T>): Promise<T | undefined> {
    if (this.waOcupado() !== null) return undefined;
    this.waOcupado.set(texto);
    try {
      return await acao();
    } catch {
      return undefined;
    } finally {
      this.waOcupado.set(null);
    }
  }

  /**
   * Com a API do WhatsApp Business ligada no servidor: envia direto. Senão (ou se o envio falhar),
   * modo manual: salva o PDF no aparelho e abre a conversa. Com o PDF em mãos, baixar e abrir a
   * conversa acontecem no mesmo toque: depois de um await o navegador pode bloquear a abertura.
   */
  protected async enviarNoWhatsApp(): Promise<void> {
    if (this.modoApi()) { await this.enviarPelaApi(); return; }
    if (this.pdfSalvoPraWa()) { this.abrirWhatsApp(); return; }
    const promessa = this.pdfAtual();
    const pronto = this.pdfsProntos.get(promessa);
    if (pronto) {
      this.compartilhar.baixarArquivo(pronto, 'orcamento-' + this.numeroOrcamento() + '.pdf');
      this.dialogo.toast('PDF salvo no aparelho — na conversa, anexe em 📎 › Documento.');
      this.abrirWhatsApp();
      return;
    }
    // PDF ainda gerando: salva quando ficar pronto e pede um segundo toque
    const blob = await this.comOcupadoWa('Preparando o PDF…', () => promessa.catch(() => this.pdfBase()));
    if (!blob) { this.dialogo.toast('Não foi possível gerar o PDF.', true); return; }
    this.compartilhar.baixarArquivo(blob, 'orcamento-' + this.numeroOrcamento() + '.pdf');
    this.pdfSalvoPraWa.set(true);
    this.dialogo.toast('PDF salvo no aparelho. Toque de novo pra abrir a conversa.');
  }

  private abrirWhatsApp(): void {
    const link = this.linkWa();
    if (link) this.compartilhar.abrirLink(link);
  }

  private async enviarPelaApi(): Promise<void> {
    const p = this.pedido();
    if (!p || !p.cliente) return;
    const numero = this.numeroOrcamento();
    const tel = telefoneExibicao(p.cliente.telefone);
    if (!(await this.dialogo.confirmar('Enviar o orçamento nº ' + numero + ' pro WhatsApp de ' + p.cliente.nome + ' (' + tel + ')?', 'Enviar'))) return;
    await this.comOcupadoWa('Enviando…', async () => {
      // o PDF deste aparelho (com a foto, se tiver); se não sair, o servidor gera o padrão
      const blob = await this.pdfAtual().catch(() => this.pdfBase()).catch(() => null);
      try {
        await this.whatsApp.enviar(this.id, blob, 'orcamento-' + numero + '.pdf');
        this.dialogo.toast('Orçamento enviado pro WhatsApp de ' + (this.primeiroNome() || 'cliente') + '.');
      } catch (e) {
        const status = e instanceof ErroApi ? e.status : undefined;
        const detalhe = e instanceof ErroApi ? e.detalhe : undefined;
        if (status === 401) return;
        // limite de envios: só avisa, sem trocar pro modo manual
        if (status === 429) { this.dialogo.toast(detalhe || 'Espere um pouco pra enviar de novo.', true); return; }
        this.dialogo.toast((detalhe || 'Não foi possível enviar automático.') + ' Toque de novo pra enviar pela conversa.', true);
        this.modoApi.set(false);
      }
    });
  }
}
