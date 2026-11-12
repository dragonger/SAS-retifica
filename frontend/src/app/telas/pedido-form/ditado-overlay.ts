import { Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DialogoService } from '../../core/dialogo.service';
import { DitadoService, ResultadoDitado } from '../../core/ditado.service';
import { DitadoVoz } from '../../core/ditado-voz';
import {
  CatalogoDitado, Entendimento, OpcaoDuvida, Pergunta, RefEntendida, RespostaDitado, ValorEntendido,
  escolherOpcao, moeda, montarRespostas, paraRascunho, primeiraAba, rotuloCategoria,
} from '../../shared/ditado-regra';
import { IconeMicrofone } from '../../shared/icone-microfone';
import { DadosRascunho } from '../../shared/rascunho-pedido';

/** O que o formulário do pedido oferece ao ditado (o ctx do abrirDitado do app.js). */
export interface ContextoDitado {
  obterAtual(): DadosRascunho;
  catalogo(): CatalogoDitado;
  aplicar(dados: Partial<DadosRascunho>): void;
  cadastrarCliente(nome: string): void;
  irParaAba(aba: string): void;
  ordemAbas: readonly string[];
}

export type FaseDitado = 'gravar' | 'entendendo' | 'perguntas' | 'conferir';

/** Uma linha da conferência (✔ entendi / dúvida / não achei). */
interface Linha {
  cls: 'ok' | 'duvida' | 'falta';
  tag: string;
  texto: string;
  /** Opções para tocar quando é dúvida. */
  opcoes?: OpcaoDuvida[];
  escolher?: (id: number) => void;
  /** Campos editáveis que acompanham a linha. */
  extra?: 'valores' | 'entrega';
  valor?: ValorEntendido;
  rotuloValor?: string;
  remover?: () => void;
}

const MSG_ENTENDER = 'Não consegui entender agora. Tente de novo ou preencha à mão.';
const MSG_RESPONDER = 'Não consegui entender agora. Tente de novo ou toque em "Pular e conferir".';
const MSG_RECOMECAR = 'Não consegui recomeçar. Tente de novo ou preencha à mão.';

/**
 * Painel "Ditar pedido" (abrirDitado do app.js): falar ou escrever, a IA entende (e pode perguntar), conferência e
 * preenchimento do formulário. Nada é salvo aqui: "Preencher formulário" só entrega os dados ao formulário.
 */
@Component({
  selector: 'app-ditado-overlay',
  templateUrl: './ditado-overlay.html',
  imports: [IconeMicrofone],
  host: {
    style: 'display: contents',
    '(document:keydown)': 'aoTecla($event)',
    '(window:hashchange)': 'fechar()',
  },
})
export class DitadoOverlay {
  readonly contexto = input.required<ContextoDitado>();
  /** O painel foi fechado (Cancelar, Esc, troca de rota ou depois de preencher). */
  readonly fechou = output<void>();

  private readonly ditado = inject(DitadoService);
  private readonly dialogo = inject(DialogoService);

  protected readonly fundo = viewChild<ElementRef<HTMLElement>>('fundo');
  protected readonly campoTexto = viewChild<ElementRef<HTMLTextAreaElement>>('campoTexto');

  protected readonly fase = signal<FaseDitado>('gravar');
  protected readonly textoEspera = signal('Entendendo o pedido…');
  protected readonly erro = signal<string | null>(null);

  // — gravar —
  /** Há texto na caixa (liga "Entender o pedido"). */
  protected readonly temTexto = signal(false);
  protected readonly ouvindo = signal(false);
  protected readonly pronto = signal(false);
  protected readonly comVoz = this.ditado.vozDisponivel();
  protected textoOriginal = '';
  private voz: DitadoVoz | null = null;

  // — perguntas —
  protected readonly perguntas = signal<Pergunta[]>([]);
  /** escolhas[perguntaId] = índice da opção (número) ou texto livre. */
  protected readonly escolhas = signal<Record<string, number | string>>({});
  protected readonly rodada = signal(1);
  protected readonly maxRodadas = signal(4);
  protected readonly micsGravando = signal<ReadonlySet<string>>(new Set());
  private readonly vozesLocais = new Map<string, DitadoVoz>();

  // — conferência —
  protected readonly entendimento = signal<Entendimento>({});
  private avisosServidor: string[] = [];
  private sessaoId = '';

  protected readonly podeResponder = computed(() => montarRespostas(this.perguntas(), this.escolhas()).length > 0);
  private readonly revisao = computed(() => paraRascunho(this.entendimento(), this.contexto().obterAtual(), this.contexto().catalogo()));
  protected readonly linhas = computed(() => this.montarLinhas(this.entendimento()));
  protected readonly conflitos = computed(() => this.revisao().conflitos);
  protected readonly pendencias = computed(() => this.revisao().pendencias.map(p => p.texto).concat(this.avisosServidor));

  protected readonly rotuloCategoria = rotuloCategoria;

  private fechado = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.encerrarVozes());
  }

  /** Esc fecha, menos quando há um diálogo aberto por cima (o `.ocultar-esc` do app.js). */
  protected aoTecla(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && !this.dialogo.dialogos().length) this.fechar();
  }

  protected fechar(): void {
    if (this.fechado) return;
    this.fechado = true;
    this.encerrarVozes();
    this.fechou.emit();
  }

  private encerrarVozes(): void {
    if (this.voz) { this.voz.encerrar(); this.voz = null; }
    this.vozesLocais.forEach(v => v.encerrar());
    this.vozesLocais.clear();
    this.micsGravando.set(new Set());
  }

  private irPara(fase: FaseDitado): void {
    this.encerrarVozes();
    this.fase.set(fase);
    this.ouvindo.set(false);
    this.pronto.set(false);
    const fundo = this.fundo();
    if (fundo) fundo.nativeElement.scrollTop = 0;
  }

  // ---------- 1) gravar / escrever ----------

  protected faseGravar(mensagemErro: string | null = null): void {
    this.irPara('gravar');
    this.erro.set(mensagemErro);
    this.temTexto.set(!!this.textoOriginal.trim());
    setTimeout(() => { try { this.campoTexto()?.nativeElement.focus(); } catch { /* sem foco */ } }, 50);
  }

  protected aoDigitar(): void {
    this.temTexto.set(!!this.campoTexto()?.nativeElement.value.trim());
  }

  /** Botão Falar/Parar: o reconhecedor é criado na primeira vez, escrevendo na caixa de texto. */
  protected alternarVoz(): void {
    const alvo = this.campoTexto()?.nativeElement;
    if (!alvo) return;
    if (!this.voz) {
      this.voz = this.ditado.criarVoz(alvo, {
        aoMudar: () => this.aoDigitar(),
        aoParar: () => { this.pronto.set(false); this.sincronizarVoz(); },
        aoPronto: ok => { this.pronto.set(ok); this.sincronizarVoz(); },
      });
      if (!this.voz) return;
    }
    if (this.voz.ativo()) this.voz.parar(); else this.voz.iniciar();
    this.sincronizarVoz();
  }

  private sincronizarVoz(): void {
    this.ouvindo.set(!!this.voz && this.voz.ativo());
  }

  protected async enviar(): Promise<void> {
    if (this.voz) this.voz.parar();
    this.textoOriginal = (this.campoTexto()?.nativeElement.value ?? '').trim();
    if (!this.textoOriginal) return;
    this.faseEntendendo('Entendendo o pedido…');
    try {
      this.receber(await this.ditado.iniciar(this.textoOriginal));
    } catch (e) {
      if (this.fechado) return;
      this.faseGravar(detalheDe(e) || MSG_ENTENDER);
    }
  }

  // ---------- 2) aguardando a IA ----------

  private faseEntendendo(texto: string): void {
    this.irPara('entendendo');
    this.textoEspera.set(texto);
  }

  private receber(r: ResultadoDitado): void {
    if (this.fechado) return;
    this.sessaoId = r.sessaoId;
    this.perguntas.set(r.perguntas || []);
    const e = r.entendimento || {};
    this.entendimento.set({ ...e, componentes: e.componentes || [], servicos: e.servicos || [], pecas: e.pecas || [], valores: e.valores || [] });
    this.avisosServidor = r.avisos || [];
    this.rodada.set(r.rodada);
    this.maxRodadas.set(r.maxRodadas);
    this.escolhas.set({});
    if (r.situacao === 'PERGUNTAS' && this.perguntas().length) this.fasePerguntas(); else this.faseConferir();
  }

  // ---------- 3) perguntas de esclarecimento ----------

  private fasePerguntas(mensagemErro: string | null = null): void {
    this.irPara('perguntas');
    this.erro.set(mensagemErro);
  }

  private marcar(perguntaId: string, valor: number | string): void {
    this.escolhas.update(e => ({ ...e, [perguntaId]: valor }));
  }

  protected escolherChip(p: Pergunta, indice: number, livre: HTMLInputElement): void {
    livre.value = '';
    this.marcar(p.id, indice);
  }

  protected aoDigitarResposta(p: Pergunta, livre: HTMLInputElement): void {
    if (livre.value.trim()) this.marcar(p.id, livre.value);
    else this.escolhas.update(e => { const { [p.id]: _, ...resto } = e; return resto; });
  }

  protected alternarMic(p: Pergunta, livre: HTMLInputElement): void {
    let v = this.vozesLocais.get(p.id);
    if (!v) {
      const nova = this.ditado.criarVoz(livre, {
        aoMudar: () => livre.dispatchEvent(new Event('input')),
        aoParar: () => this.marcarMic(p.id, false),
      });
      if (!nova) return;
      this.vozesLocais.set(p.id, nova);
      v = nova;
    }
    if (v.ativo()) { v.parar(); this.marcarMic(p.id, false); } else { v.iniciar(); this.marcarMic(p.id, true); }
  }

  private marcarMic(id: string, gravando: boolean): void {
    this.micsGravando.update(s => { const n = new Set(s); if (gravando) n.add(id); else n.delete(id); return n; });
  }

  protected async responder(): Promise<void> {
    const respostas = montarRespostas(this.perguntas(), this.escolhas());
    if (!respostas.length) return;
    this.faseEntendendo('Entendendo as respostas…');
    try {
      this.receber(await this.ditado.responder(this.sessaoId, respostas));
    } catch (e) {
      if (this.fechado) return;
      if (statusDe(e) === 404) { await this.recomecarComOQueJaFoiDito(respostas); return; }
      this.fasePerguntas(detalheDe(e) || MSG_RESPONDER);
    }
  }

  protected pularEConferir(): void {
    this.perguntas.set([]);
    this.faseConferir();
  }

  /** A conversa guardada no servidor expirou (ficou parada ou o servidor reiniciou): recomeça com o que já foi dito. */
  private async recomecarComOQueJaFoiDito(respostas: RespostaDitado[]): Promise<void> {
    const jaRespondido = respostas.map(r => {
      const p = this.perguntas().find(x => x.id === r.perguntaId);
      const o = p && typeof r.opcaoIndice === 'number' ? (p.opcoes || []).find(x => x.indice === r.opcaoIndice) : null;
      return (p ? p.texto + ' ' : '') + (o ? o.rotulo : (r.texto || ''));
    }).join('. ');
    this.textoOriginal = (this.textoOriginal + '. ' + jaRespondido).slice(0, 2000);
    this.faseEntendendo('A conversa expirou; recomeçando com o que você já disse…');
    try {
      this.receber(await this.ditado.iniciar(this.textoOriginal));
    } catch (e) {
      if (this.fechado) return;
      this.faseGravar(detalheDe(e) || MSG_RECOMECAR);
    }
  }

  // ---------- 4) conferência ----------

  protected faseConferir(): void {
    this.irPara('conferir');
  }

  /** Mudou algo dentro de `entendimento` (remover, escolher opção): refaz a conferência. */
  private atualizar(): void {
    this.entendimento.update(e => ({ ...e }));
  }

  private montarLinhas(e: Entendimento): Linha[] {
    const linhas: Linha[] = [];
    const remover = (fn: () => void) => () => { fn(); this.atualizar(); };

    const refs = (rotulo: string, lista: RefEntendida[], nomeTipo: string) => {
      lista.forEach((r, i) => {
        if (r.estado === 'OK') linhas.push({ cls: 'ok', tag: 'Entendi', texto: rotulo + ': ' + r.nome, remover: remover(() => lista.splice(i, 1)) });
        else if (r.estado === 'DUVIDA') linhas.push(this.duvida(nomeTipo, r, escolhida => { lista[i] = escolhida; }));
        else if (r.estado === 'NAO_ENCONTRADO') {
          linhas.push({ cls: 'falta', tag: 'Não achei', texto: rotulo + ' "' + (r.ouvido || '') + '" não está cadastrado.', remover: remover(() => lista.splice(i, 1)) });
        }
      });
    };

    // o cliente é um só (não uma lista): a dúvida troca entendimento.cliente
    const c = e.cliente;
    if (c && c.estado !== 'AUSENTE') {
      if (c.estado === 'OK') linhas.push({ cls: 'ok', tag: 'Entendi', texto: 'Cliente: ' + c.nome });
      else if (c.estado === 'DUVIDA') linhas.push(this.duvida('cliente', c, escolhida => { e.cliente = escolhida; }));
      else linhas.push({ cls: 'falta', tag: 'Não achei', texto: 'Cliente "' + (c.ouvido || '') + '" não está cadastrado. Você poderá cadastrar ao preencher.' });
    }
    refs('Modelo', e.componentes || [], 'modelo');

    const itensLista = (rotulo: string, lista: RefEntendida[], nomeTipo: string) => {
      lista.forEach((i, idx) => {
        const qtd = i.quantidade ? i.quantidade + ' × ' : '';
        const cat = i.categoria ? ' (' + rotuloCategoria(i.categoria) + ')' : '';
        if (i.estado === 'DUVIDA') linhas.push(this.duvida(nomeTipo, i, escolhida => { lista[idx] = escolhida; }));
        else {
          linhas.push({ cls: 'ok', tag: i.estado === 'LIVRE' ? 'Texto livre' : 'Entendi', texto: rotulo + ': ' + qtd + (i.nome || '') + cat,
            remover: remover(() => lista.splice(idx, 1)) });
        }
      });
    };
    itensLista('Serviço', e.servicos || [], 'serviço');
    itensLista('Peça', e.pecas || [], 'peça');

    (e.valores || []).forEach((v, idx) => {
      linhas.push({ cls: 'ok', tag: 'Entendi', texto: 'Valores de ' + rotuloCategoria(v.categoria), extra: 'valores', valor: v,
        rotuloValor: rotuloCategoria(v.categoria), remover: remover(() => (e.valores as ValorEntendido[]).splice(idx, 1)) });
    });

    if (e.entregaData) linhas.push({ cls: 'ok', tag: 'Entendi', texto: 'Entrega:', extra: 'entrega', remover: remover(() => { e.entregaData = null; }) });
    if (e.descricao) linhas.push({ cls: 'ok', tag: 'Entendi', texto: 'Descrição: ' + e.descricao, remover: remover(() => { e.descricao = null; }) });
    if (e.observacao) linhas.push({ cls: 'ok', tag: 'Entendi', texto: 'Observação: ' + e.observacao, remover: remover(() => { e.observacao = null; }) });
    if (e.status) linhas.push({ cls: 'ok', tag: 'Entendi', texto: 'Situação: ' + e.status.replace('_', ' ').toLowerCase(), remover: remover(() => { e.status = null; }) });
    if (e.descontoTipo) {
      linhas.push({ cls: 'ok', tag: 'Entendi',
        texto: 'Desconto: ' + (e.descontoTipo === 'PERCENTUAL' ? e.descontoValor + '%' : moeda(e.descontoValor)),
        remover: remover(() => { e.descontoTipo = null; e.descontoValor = null; }) });
    }
    return linhas;
  }

  private duvida(nomeTipo: string, ref: RefEntendida, trocar: (escolhida: RefEntendida) => void): Linha {
    return {
      cls: 'duvida', tag: 'Dúvida', texto: 'Qual ' + nomeTipo + '?', opcoes: ref.opcoes || [],
      escolher: id => { trocar(escolherOpcao(ref, id)); this.atualizar(); },
    };
  }

  protected definirValor(v: ValorEntendido, chave: 'valorServicos' | 'valorPecas', campo: HTMLInputElement): void {
    v[chave] = Math.max(0, Number(campo.value) || 0);
  }

  protected definirEntrega(campo: HTMLInputElement): void {
    this.entendimento().entregaData = campo.value || null;
  }

  protected preencher(): void {
    const ctx = this.contexto();
    const r = paraRascunho(this.entendimento(), ctx.obterAtual(), ctx.catalogo());
    ctx.aplicar(r.dados);
    const cadastrar = r.pendencias.find(p => p.acao === 'cadastrarCliente');
    if (cadastrar) ctx.cadastrarCliente(cadastrar.nome || '');
    const aba = primeiraAba(r.pendencias, r.conflitos, ctx.ordemAbas);
    if (aba) ctx.irParaAba(aba);
    this.dialogo.toast(r.pendencias.length ? 'Formulário preenchido. Falta completar o que ficou pendente.' : 'Formulário preenchido. Confira e salve.');
    this.fechar();
  }
}

function statusDe(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}

function detalheDe(e: unknown): string | undefined {
  return (e as { detalhe?: string } | null)?.detalhe;
}
