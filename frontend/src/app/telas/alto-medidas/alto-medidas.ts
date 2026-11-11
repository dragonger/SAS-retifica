import { Component, inject, signal } from '@angular/core';
import { ErroApi } from '../../core/api.service';
import { ALTO_RESUMO, AltoMedidasService, ListaAltoMedidas, OsAltoMedidas } from '../../core/alto-medidas.service';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { TopoService } from '../../core/topo.service';
import { CartaoDevidoAoDaniel } from '../../shared/cartao-devido-ao-daniel';
import { valorDe } from '../../shared/evento';
import { moeda, rotuloMes, textoDataIso, textoQuantidade } from '../../shared/formatacao';

/** Virabrequins do Daniel (#/alto-medidas): telaAltoMedidas do app.js. Ver backend/ALTO-MEDIDAS.md. */
@Component({
  selector: 'app-alto-medidas',
  templateUrl: './alto-medidas.html',
  imports: [CartaoDevidoAoDaniel],
})
export class AltoMedidas {
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);
  private readonly alto = inject(AltoMedidasService);

  /** null = "Carregando...". */
  protected readonly dados = signal<ListaAltoMedidas | null>(null);
  /** Ids das OS com o PUT em andamento (botão desabilitado, "Salvando…"). */
  protected readonly salvando = signal<ReadonlySet<number>>(new Set());

  protected readonly moeda = moeda;
  protected readonly rotuloMes = rotuloMes;
  protected readonly textoQuantidade = textoQuantidade;

  constructor() {
    inject(TopoService).definirTitulo('Virabrequins do Daniel');
    void this.carregar();
  }

  /** As três listas, na ordem da tela, com os textos de "vazio" (com e sem mês escolhido). */
  protected secoes(d: ListaAltoMedidas) {
    return [
      { titulo: 'Pago pelo cliente — a repassar ao Daniel', g: d.aRepassar, vazioMes: 'Nenhum virabrequim deste mês pago aguardando repasse.', vazioTodos: 'Nenhum virabrequim pago aguardando repasse.' },
      { titulo: 'Aguardando o cliente pagar', g: d.aguardando, vazioMes: 'Nenhum virabrequim deste mês aguardando pagamento.', vazioTodos: 'Nenhum virabrequim aguardando pagamento.' },
      { titulo: 'Já repassado ao Daniel', g: d.repassado, vazioMes: 'Nenhum repasse confirmado neste mês.', vazioTodos: 'Nenhum repasse confirmado ainda.' },
    ];
  }

  /** O total devido é SEMPRE o geral (todos os meses); o mês só filtra as listas. */
  protected extra(d: ListaAltoMedidas): string | null {
    const doMes = d.mes !== 'todos';
    const diferente = doMes && Math.abs(Number(d.devidoAoDaniel) - Number(d.devidoNoPeriodo)) > 0.004;
    return diferente
      ? 'Em ' + rotuloMes(d.mes) + ': ' + moeda(d.devidoNoPeriodo) + ' (' + textoQuantidade(d.quantidadeDevidaNoPeriodo) + ') · o resto é de outros meses'
      : null;
  }

  protected detalhes(os: OsAltoMedidas): string {
    return [os.cliente, os.modelo, os.medidas].filter(Boolean).join(' · ');
  }

  protected datas(os: OsAltoMedidas): string {
    if (os.repassadoEm) return 'Repassado em ' + textoDataIso(os.repassadoEm);
    if (os.pago) return 'Cliente pagou em ' + textoDataIso(os.pagoEm);
    return os.finalizadoEm ? 'Finalizado em ' + textoDataIso(os.finalizadoEm) : '';
  }

  protected valor(os: OsAltoMedidas): string {
    return moeda(os.valorTotal) + (os.polir ? ' (com polimento)' : '');
  }

  protected sufixo(d: ListaAltoMedidas): string {
    return d.mes !== 'todos' ? ' — ' + rotuloMes(d.mes) : '';
  }

  protected trocarMes(ev: Event): void {
    this.alto.mesEscolhido = valorDe(ev);
    void this.carregar();
  }

  private async carregar(): Promise<void> {
    const caminho = this.alto.caminhoDaLista();
    if (!this.cache.tem(caminho)) this.dados.set(null); // "Carregando..." (mês ainda sem cache)
    try {
      await this.cache.comCache<ListaAltoMedidas>(caminho, d => {
        // resposta atrasada de um mês que já não é o escolhido não sobrescreve a tela
        if (caminho === this.alto.caminhoDaLista()) this.dados.set(d);
      });
    } catch {
      /* o interceptor já avisou; com cache a tela continua mostrando o que tinha */
    }
  }

  protected async alternarPagamento(os: OsAltoMedidas): Promise<void> {
    if (this.salvando().has(os.id)) return;
    const marcar = !os.pago;
    const pergunta = marcar
      ? 'Marcar a OS #' + os.numero + ' como paga pelo cliente? Ela passa a contar no que você deve ao Daniel (' + moeda(os.valorTotal) + ').'
      : 'Desfazer o "cliente pagou" da OS #' + os.numero + '? Ela deixa de contar no que você deve ao Daniel.';
    if (!(await this.dialogo.confirmar(pergunta, marcar ? 'Cliente pagou' : 'Desfazer', !marcar))) return;

    this.salvando.update(s => new Set(s).add(os.id));
    let motivo: string | undefined;
    let feito = false;
    try {
      await this.alto.marcarPagamento(os.id, marcar);
      feito = true;
    } catch (e) {
      motivo = e instanceof ErroApi ? e.detalhe : undefined;
    } finally {
      this.salvando.update(s => { const n = new Set(s); n.delete(os.id); return n; });
    }
    if (!feito) { this.dialogo.toast(motivo || 'Não foi possível salvar. Tente de novo.', true); return; }
    this.cache.invalidar(ALTO_RESUMO, ...this.alto.caminhosVisitados);
    await this.carregar();
  }
}
