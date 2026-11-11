import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ApiService, ErroApi } from '../../core/api.service';
import { DialogoService } from '../../core/dialogo.service';
import { ComGuardaSaida, GuardaSaida } from '../../core/guarda-saida.service';
import { IdentidadeService } from '../../core/identidade.service';
import { OrcamentoCacheService } from '../../core/orcamento-cache.service';
import { TopoService } from '../../core/topo.service';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';
import { comOcupado } from '../../shared/ocupado';
import { exibirAoSair, mascararAoDigitar, telefoneExibicao } from '../../shared/telefone';

export const LOGO_BYTES_MAX = 5 * 1024 * 1024;

/** Resposta de GET /api/empresa. */
interface DadosEmpresa {
  nome?: string | null;
  telefone?: string | null;
  instagram?: string | null;
  slogan?: string | null;
}

/** Minha empresa (#/empresa): telaEmpresa do app.js — logo e dados que aparecem no orçamento. */
@Component({
  selector: 'app-empresa',
  templateUrl: './empresa.html',
  imports: [Campo],
})
export class Empresa implements ComGuardaSaida {
  private readonly api = inject(ApiService);
  private readonly dialogo = inject(DialogoService);
  private readonly identidade = inject(IdentidadeService);
  private readonly orcamentos = inject(OrcamentoCacheService);

  /** Logo guardada no aparelho (data URL), ou null. */
  protected readonly logo = signal<string | null>(this.identidade.logoGuardada()?.dataUrl ?? null);
  protected readonly enviando = signal(false);
  protected readonly removendo = signal(false);
  protected readonly salvando = signal(false);

  protected readonly nome = signal('');
  protected readonly telefone = signal('');
  protected readonly instagram = signal('');
  protected readonly slogan = signal('');

  /** Fotografia dos dados quando chegaram do servidor/foram salvos; null = ainda não chegaram (sem guarda). */
  private readonly base = signal<string | null>(null);

  private readonly seletor = viewChild.required<ElementRef<HTMLInputElement>>('seletor');

  protected readonly valorDe = valorDe;
  protected readonly mascararAoDigitar = mascararAoDigitar;
  protected readonly exibirAoSair = exibirAoSair;

  constructor() {
    inject(TopoService).definirTitulo('Minha empresa');
    this.api.get<DadosEmpresa>('/api/empresa').then(d => {
      this.nome.set(d.nome || '');
      this.telefone.set(telefoneExibicao(d.telefone || ''));
      this.instagram.set(d.instagram || '');
      this.slogan.set(d.slogan || '');
      this.base.set(this.fotografia());
    }).catch(() => { /* o interceptor já avisou */ });
  }

  private fotografia(): string {
    return [this.nome(), this.telefone(), this.instagram(), this.slogan()].join('\u0001');
  }

  /** Alterações não salvas: só vale depois que os dados do servidor chegaram. */
  guardaSaida(): GuardaSaida {
    return { tipo: 'formulario', sujo: () => this.base() !== null && this.fotografia() !== this.base() };
  }

  protected escolherImagem(): void {
    this.seletor().nativeElement.click();
  }

  /** A logo faz parte do PDF: invalida os orçamentos já preparados e baixa a identidade de novo. */
  private async atualizarTudo(): Promise<void> {
    this.orcamentos.invalidarTodos();
    await this.identidade.carregar();
    this.logo.set(this.identidade.logoGuardada()?.dataUrl ?? null);
  }

  protected async aoEscolherArquivo(ev: Event): Promise<void> {
    const campo = ev.target as HTMLInputElement;
    const arquivo = campo.files && campo.files[0];
    campo.value = '';
    if (!arquivo) return;
    if (!/^image\/(png|jpeg)$/.test(arquivo.type)) { this.dialogo.toast('Use uma imagem PNG ou JPG.', true); return; }
    if (arquivo.size > LOGO_BYTES_MAX) { this.dialogo.toast('A imagem passa de 5 MB.', true); return; }
    const dados = new FormData();
    dados.append('logo', arquivo);
    let motivo: string | undefined;
    const enviada = await comOcupado(this.enviando, async () => {
      try {
        await this.api.put('/api/empresa/logo', dados, { statusSemAviso: [400, 413] });
        return true;
      } catch (e) {
        motivo = e instanceof ErroApi ? e.detalhe : undefined;
        throw e;
      }
    });
    if (!enviada) { this.dialogo.toast(motivo || 'Não foi possível enviar a logo.', true); return; }
    await this.atualizarTudo();
    this.dialogo.toast('Logo atualizada.');
  }

  protected async removerLogo(): Promise<void> {
    if (!(await this.dialogo.confirmar('Remover a logo da empresa?', 'Remover', true))) return;
    const removida = await comOcupado(this.removendo, async () => {
      await this.api.delete('/api/empresa/logo');
      return true;
    });
    if (!removida) return; // o interceptor já avisou
    await this.atualizarTudo();
    this.dialogo.toast('Logo removida.');
  }

  protected async salvarDados(): Promise<void> {
    let motivo: string | undefined;
    const salvo = await comOcupado(this.salvando, async () => {
      try {
        await this.api.put('/api/empresa', {
          nome: this.nome(), telefone: this.telefone(), instagram: this.instagram(), slogan: this.slogan(),
        }, { statusSemAviso: [400] });
        return true;
      } catch (e) {
        motivo = e instanceof ErroApi ? e.detalhe : undefined;
        throw e;
      }
    });
    if (!salvo) { this.dialogo.toast(motivo || 'Não foi possível salvar.', true); return; }
    this.orcamentos.invalidarTodos();
    await this.identidade.carregar();
    this.base.set(this.fotografia());
    this.dialogo.toast('Dados salvos.');
  }
}
