import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, ErroApi } from '../../core/api.service';
import { CacheService } from '../../core/cache.service';
import { registrarClienteRecente } from '../../core/clientes-recentes';
import { DialogoService } from '../../core/dialogo.service';
import { DitadoService } from '../../core/ditado.service';
import { ComGuardaSaida, GuardaSaida } from '../../core/guarda-saida.service';
import { OrcamentoCacheService } from '../../core/orcamento-cache.service';
import { RascunhoService } from '../../core/rascunho.service';
import { TopoService } from '../../core/topo.service';
import { IconeMicrofone } from '../../shared/icone-microfone';
import { Cabecote, Categoria, Cliente, ItemCatalogo, PedidoDetalhe } from '../../shared/modelos';
import { comOcupado } from '../../shared/ocupado';
import {
  Aba, DadosRascunho, ORDEM_ABAS, chaveDoRascunho, dadosDoRascunho, fotografiaDoRascunho, haQuanto, tituloDoRascunho,
} from '../../shared/rascunho-pedido';
import { AbaCliente } from './aba-cliente';
import { AbaComponentes } from './aba-componentes';
import { AbaItens } from './aba-itens';
import { AbaPedido } from './aba-pedido';
import { ContextoDitado, DitadoOverlay } from './ditado-overlay';
import { CatalogoPedido, EstadoPedidoForm } from './estado-pedido-form';

/** Catálogos que o formulário carrega (CATALOGO_PATHS do app.js), nesta ordem. */
export const CATALOGO_PATHS = ['/api/cabecotes', '/api/servicos-catalogo', '/api/pecas-catalogo', '/api/categorias', '/api/clientes'];

/** Atraso para guardar o rascunho depois da última alteração. */
export const ATRASO_RASCUNHO_MS = 400;

/**
 * Formulário do pedido (#/pedidos/novo e #/pedidos/:id/editar): telaFormPedido do app.js.
 *
 * Assistente de quatro etapas (Cliente, Pedido, Componentes, Itens) com Avançar/Voltar. Só o cliente é obrigatório.
 * O que é digitado fica guardado como rascunho neste aparelho (mesma chave e formato do app atual) e a saída com
 * dados não salvos pergunta antes (guarda "pedido").
 */
@Component({
  selector: 'app-pedido-form',
  templateUrl: './pedido-form.html',
  imports: [AbaCliente, AbaPedido, AbaComponentes, AbaItens, DitadoOverlay, IconeMicrofone],
  providers: [EstadoPedidoForm],
  host: { style: 'display: contents' },
})
export class PedidoForm implements ComGuardaSaida {
  protected readonly estado = inject(EstadoPedidoForm);
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);
  private readonly ditado = inject(DitadoService);
  private readonly orcamentos = inject(OrcamentoCacheService);
  private readonly rascunhos = inject(RascunhoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly topo = inject(TopoService);

  /** null = pedido novo. */
  protected readonly id = signal<string | null>(null);
  protected readonly pronto = signal(false);
  protected readonly naoEncontrado = signal(false);
  /** Pedido finalizado não é editável (o servidor também recusa com 409). */
  protected readonly finalizado = signal(false);
  protected readonly salvando = signal(false);
  protected readonly formulario = viewChild<ElementRef<HTMLFormElement>>('formulario');

  /** Ordem das etapas (o ditado decide para qual ir primeiro). */
  readonly ordemAbas = ORDEM_ABAS;

  // — ditar o pedido: só em pedido novo e só quando a IA está ligada no servidor (barraDitado do app.js) —
  protected readonly ditadoLigado = signal(false);
  protected readonly ditadoAberto = signal(false);
  private abrindoDitado = false;
  /** O que o painel do ditado usa do formulário (ctx do abrirDitado). */
  protected readonly contextoDitado: ContextoDitado = {
    obterAtual: () => this.obterAtual(),
    catalogo: () => this.catalogo(),
    aplicar: dados => this.aplicar(dados),
    cadastrarCliente: nome => this.cadastrarCliente(nome),
    irParaAba: aba => this.irParaAba(aba),
    ordemAbas: ORDEM_ABAS,
  };

  private carga = 0;
  private destruido = false;

  // — rascunho —
  private chave = 'novo';
  /** Fotografia do formulário ao abrir (antes de aplicar um rascunho): igual a ela = nada mudou. */
  private linhaBase = '';
  private encerrado = false;
  private guardaAtiva = false;
  private temporizadorRascunho: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      clearTimeout(this.temporizadorRascunho);
    });
    this.estado.aoMudar = () => this.agendarRascunho();
    // o mesmo componente serve a /pedidos/novo e a /pedidos/<id>/editar: trocar de id refaz tudo (como renderizar de novo)
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(m => void this.carregar(m.get('id')));
  }

  // ---------- carga ----------

  private async carregarCatalogos(): Promise<CatalogoPedido> {
    const [cabecotes, servicos, pecas, categorias, clientes] =
      await this.cache.carregarComCache<[Cabecote[], ItemCatalogo[], ItemCatalogo[], Categoria[], Cliente[]]>(CATALOGO_PATHS);
    // cópias: os cadastros inline do formulário não mexem no cache; a atualização em segundo plano vai só pro cache
    // (próxima visita), nunca pro formulário já aberto: não troca opções no meio da edição
    return { cabecotes: cabecotes.slice(), servicos: servicos.slice(), pecas: pecas.slice(), categorias: categorias.slice(), clientes: clientes.slice() };
  }

  private async carregar(id: string | null): Promise<void> {
    const minha = ++this.carga;
    clearTimeout(this.temporizadorRascunho);
    this.encerrado = false;
    this.guardaAtiva = false;
    this.linhaBase = '';
    this.pronto.set(false);
    this.naoEncontrado.set(false);
    this.finalizado.set(false);
    this.id.set(id);
    this.ditadoLigado.set(false);
    this.ditadoAberto.set(false);
    this.chave = chaveDoRascunho(id);
    this.topo.definirTitulo(id ? 'Editar pedido #' + id : 'Novo pedido');
    let catalogo: CatalogoPedido;
    let pedido: PedidoDetalhe | null;
    try {
      [catalogo, pedido] = await Promise.all([
        this.carregarCatalogos(),
        id ? this.api.get<PedidoDetalhe | null>('/api/pedidos/' + id) : Promise.resolve(null),
      ]);
    } catch {
      return; // o interceptor já avisou; fica em "Carregando..."
    }
    if (minha !== this.carga || this.destruido) return; // usuário já saiu dessa tela
    if (id && !pedido) { this.naoEncontrado.set(true); return; }
    if (pedido?.finalizado) { this.finalizado.set(true); return; }

    this.estado.iniciar(catalogo, pedido);
    this.selecionarAba('cliente');
    this.linhaBase = this.fotografia();
    this.pronto.set(true);
    // "Ditar pedido": só em pedido novo e só com a IA ligada no servidor (a resposta fica guardada no DitadoService)
    if (!id) {
      void this.ditado.habilitado().then(ligado => { if (ligado && minha === this.carga && !this.destruido) this.ditadoLigado.set(true); });
    }

    // rascunho guardado: o cartão "Continuar" já abre direto nele; senão pergunta
    const guardado = this.rascunhos.ler(this.chave);
    if (guardado) {
      let usar = this.rascunhos.consumirRetomada(this.chave);
      if (!usar) {
        const editando = !!id;
        const quando = haQuanto(guardado.quando);
        const resposta = await this.dialogo.escolher<'continuar' | 'descartar'>(
          editando
            ? 'Há alterações não salvas deste pedido, guardadas ' + quando + ' neste aparelho.'
            : 'Você tem um pedido incompleto, guardado ' + quando + ' neste aparelho' + (guardado.titulo ? ' (' + guardado.titulo + ')' : '') + '.',
          [
            { rotulo: editando ? 'Continuar de onde parei' : 'Continuar pedido incompleto', valor: 'continuar', estilo: 'btn-primary' },
            { rotulo: editando ? 'Descartar e usar o pedido salvo' : 'Começar um novo (descarta o rascunho)', valor: 'descartar', estilo: 'btn-danger' },
          ]);
        if (minha !== this.carga || this.destruido) return; // saiu da tela com o aviso aberto: não decide nada por conta própria
        usar = resposta === 'continuar';
        if (!usar) this.rascunhos.remover(this.chave);
      }
      if (usar) this.aplicarRascunho(guardado.dados);
    }
    this.guardaAtiva = true;
  }

  // ---------- etapas ----------

  protected idxAba(): number {
    return ORDEM_ABAS.indexOf(this.estado.aba());
  }

  protected ultimaEtapa(): boolean {
    return this.idxAba() === ORDEM_ABAS.length - 1;
  }

  private selecionarAba(aba: Aba): void {
    this.estado.aba.set(aba);
    const conteudo = document.getElementById('conteudo');
    if (conteudo) conteudo.scrollTop = 0;
  }

  protected voltarPasso(): void {
    const idx = this.idxAba();
    if (idx > 0) this.selecionarAba(ORDEM_ABAS[idx - 1]);
  }

  /** Botão principal: "Avançar" nas 3 primeiras etapas, "Salvar" (o submit do formulário) na última. */
  protected avancar(ev: Event): void {
    if (this.ultimaEtapa()) return; // deixa o submit do formulário cuidar de salvar
    ev.preventDefault();
    if (this.estado.aba() === 'cliente' && !this.estado.cliente()) {
      this.dialogo.toast('Selecione ou cadastre um cliente.', true);
      return;
    }
    this.selecionarAba(ORDEM_ABAS[this.idxAba() + 1]);
  }

  protected cancelar(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/pedidos', id] : ['/pedidos']);
  }

  // ---------- salvar ----------

  protected async salvar(ev: Event): Promise<void> {
    ev.preventDefault();
    const cliente = this.estado.cliente();
    if (!cliente) {
      this.dialogo.toast('Selecione ou cadastre um cliente.', true);
      this.selecionarAba('cliente');
      return;
    }
    // Validação feita aqui (novalidate no formulário): a do navegador trava o envio em silêncio quando o campo
    // inválido está numa etapa escondida (ex.: valor negativo digitado na etapa de valores).
    const invalido = this.formulario()?.nativeElement.querySelector<HTMLInputElement>(':invalid');
    if (invalido) {
      const etapa = invalido.closest('[data-aba]')?.getAttribute('data-aba') as Aba | null;
      if (etapa) this.selecionarAba(etapa);
      this.dialogo.toast('Tem um campo com valor inválido (ex.: número negativo). Confira o campo destacado.', true);
      setTimeout(() => { invalido.focus(); invalido.reportValidity?.(); }, 50);
      return;
    }

    const e = this.estado;
    const valorDesconto = e.descontoValor();
    const body = {
      componenteIds: e.componentes().map(c => c.id),
      clienteId: cliente.id,
      categoriaValores: e.categorias().map(([categoria, v]) => ({
        categoria,
        valorServicos: v.valorServicos || 0,
        valorPecas: v.valorPecas || 0,
      })),
      status: e.status(),
      pedidoDescricao: e.descricao().trim() || null,
      observacao: e.observacao().trim() || null,
      datEntregaEstimada: e.entrega() || null,
      servicos: e.servicos(),
      pecas: e.pecas(),
      descontoTipo: e.descontoTipo() || null,
      descontoValor: valorDesconto !== '' ? Number(valorDesconto) : null,
    };

    // Criar pedido pode levar vários segundos (servidor acordando / banco longe): o botão trava para um segundo
    // toque não duplicar o pedido.
    const id = this.id();
    let recusado: string | undefined;
    const salvo = await comOcupado(this.salvando, async () => {
      try {
        return await (id
          ? this.api.put<{ id: number }>('/api/pedidos/' + id, body, { statusSemAviso: [409] })
          : this.api.post<{ id: number }>('/api/pedidos', body));
      } catch (e) {
        // finalizado em outro aparelho enquanto este editava: o servidor recusa com a mensagem certa
        if (e instanceof ErroApi && e.status === 409) recusado = e.detalhe || 'Este pedido já foi finalizado e não pode mais ser editado.';
        throw e;
      }
    });
    if (recusado) { this.dialogo.toast(recusado, true); return; }
    if (!salvo) return;
    this.cache.invalidarPedidos();
    this.orcamentos.invalidar(salvo.id);
    registrarClienteRecente(cliente.id);
    this.encerrarRascunho();
    this.dialogo.toast('Pedido salvo.');
    void this.router.navigate(['/pedidos', salvo.id]);
  }

  // ---------- rascunho ----------

  private fotografia(): string {
    return fotografiaDoRascunho(this.estado.partes());
  }

  /** Dados do formulário no formato do rascunho; `comAba` junta a etapa atual (só serve para voltar de onde parou). */
  private dados(comAba: boolean): DadosRascunho {
    return dadosDoRascunho(this.estado.partes(), comAba ? this.estado.aba() : undefined);
  }

  private guardarRascunhoAgora(): void {
    clearTimeout(this.temporizadorRascunho);
    if (this.encerrado) return;
    if (this.fotografia() === this.linhaBase) this.rascunhos.remover(this.chave);
    else this.rascunhos.gravar(this.chave, tituloDoRascunho(this.estado.cliente(), this.estado.descricao()), this.dados(true));
  }

  /** Chamado a cada input/change/click do formulário (e pelos cadastros inline). */
  protected agendarRascunho(): void {
    if (this.encerrado || !this.guardaAtiva) return;
    clearTimeout(this.temporizadorRascunho);
    this.temporizadorRascunho = setTimeout(() => this.guardarRascunhoAgora(), ATRASO_RASCUNHO_MS);
  }

  private encerrarRascunho(): void {
    this.encerrado = true;
    clearTimeout(this.temporizadorRascunho);
    this.rascunhos.remover(this.chave);
  }

  private aplicarRascunho(d: Partial<DadosRascunho>): void {
    this.estado.aplicar(d);
    if (d.aba && (ORDEM_ABAS as readonly string[]).includes(d.aba)) this.selecionarAba(d.aba as Aba);
  }

  /** Guarda de saída (tipo "pedido"): sair com dados não salvos pergunta e pode guardar o rascunho. */
  guardaSaida(): GuardaSaida | null {
    if (!this.guardaAtiva) return null;
    return {
      tipo: 'pedido',
      sujo: () => !this.encerrado && this.fotografia() !== this.linhaBase,
      aoGuardar: () => this.guardarRascunhoAgora(),
      aoDescartar: () => {
        this.encerrado = true;
        clearTimeout(this.temporizadorRascunho);
        this.rascunhos.remover(this.chave);
      },
    };
  }

  // ---------- ditado (ctx do abrirDitado do app.js) ----------

  /** Botão "Ditar pedido": mostra o aviso de privacidade (só na primeira vez) e abre o painel. */
  protected async abrirDitado(): Promise<void> {
    if (this.abrindoDitado || this.ditadoAberto()) return;
    this.abrindoDitado = true;
    try {
      if (!(await this.ditado.avisoDePrivacidade()) || this.destruido) return;
      this.ditadoAberto.set(true);
    } finally {
      this.abrindoDitado = false;
    }
  }

  /** Dados atuais do formulário, no formato do rascunho (sem a etapa). */
  obterAtual(): DadosRascunho {
    return this.dados(false);
  }

  /** Clientes e modelos carregados no formulário (o que o ditado usa para casar nomes). */
  catalogo(): { clientes: Cliente[]; cabecotes: Cabecote[] } {
    const c = this.estado.catalogo();
    return { clientes: c.clientes, cabecotes: c.cabecotes };
  }

  /** Preenche o formulário com os dados do ditado e já guarda o rascunho. */
  aplicar(dados: Partial<DadosRascunho>): void {
    this.aplicarRascunho(dados);
    this.guardarRascunhoAgora();
  }

  /** Abre o cadastro rápido de cliente com o nome já preenchido. */
  cadastrarCliente(nome: string): void {
    this.estado.novoClienteNome.set(nome || '');
    this.estado.novoClienteAberto.set(true);
  }

  irParaAba(aba: string): void {
    if ((ORDEM_ABAS as readonly string[]).includes(aba)) this.selecionarAba(aba as Aba);
  }
}
