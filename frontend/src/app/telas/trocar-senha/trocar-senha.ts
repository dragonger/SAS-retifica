import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { DialogoService } from '../../core/dialogo.service';
import { ComGuardaSaida, GuardaSaida } from '../../core/guarda-saida.service';
import { TopoService } from '../../core/topo.service';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';

/** Status de erro que a tela trata com mensagem própria (sem o toast genérico "Erro ao acessar..."). */
const ERROS_PROPRIOS = Array.from({ length: 200 }, (_, i) => 400 + i);

/** Trocar senha (#/trocar-senha): telaTrocarSenha do app.js. O botão do topo continua escondido, como hoje. */
@Component({
  selector: 'app-trocar-senha',
  templateUrl: './trocar-senha.html',
  imports: [Campo],
})
export class TrocarSenha implements ComGuardaSaida {
  private readonly api = inject(ApiService);
  private readonly dialogo = inject(DialogoService);
  private readonly router = inject(Router);

  protected readonly atual = signal('');
  protected readonly nova = signal('');
  protected readonly confirma = signal('');
  protected readonly desconectando = signal(false);

  protected readonly valorDe = valorDe;

  constructor() {
    inject(TopoService).definirTitulo('Trocar senha');
  }

  /** Alterações não salvas: qualquer campo preenchido. */
  guardaSaida(): GuardaSaida {
    return { tipo: 'formulario', sujo: () => !!(this.atual() || this.nova() || this.confirma()) };
  }

  protected async salvar(): Promise<void> {
    if (this.nova().length < 6) { this.dialogo.toast('A nova senha precisa ter pelo menos 6 caracteres.', true); return; }
    if (this.nova() !== this.confirma()) { this.dialogo.toast('As senhas não coincidem.', true); return; }
    try {
      await this.api.put('/api/usuario/senha', { senhaAtual: this.atual(), novaSenha: this.nova() }, {
        statusSemAviso: ERROS_PROPRIOS,
        erro401Proprio: true, // 401 aqui é "senha atual incorreta", não sessão vencida
      });
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 401) this.dialogo.toast('Senha atual incorreta.', true);
      else if (status) this.dialogo.toast('Não foi possível trocar a senha.', true);
      // sem status (sem conexão): o interceptor já avisou
      return;
    }
    // o servidor derruba as outras sessões e manda o token novo deste aparelho no X-Auth-Refresh (o interceptor guarda)
    this.dialogo.toast('Senha alterada. Os outros aparelhos vão precisar entrar de novo.');
    this.atual.set(''); this.nova.set(''); this.confirma.set(''); // nada a perder: a guarda deixa sair
    void this.router.navigateByUrl('/inicio');
  }

  /** Desconecta todos os outros aparelhos; este continua (token novo no X-Auth-Refresh). */
  protected async sairDosOutros(): Promise<void> {
    if (this.desconectando()) return;
    const ok = await this.dialogo.confirmar(
      'Desconectar todos os outros aparelhos? Quem estiver usando o sistema neles vai precisar entrar de novo com a senha.',
      'Desconectar');
    if (!ok) return;
    this.desconectando.set(true);
    try {
      await this.api.post('/api/usuario/sair-dos-outros-aparelhos', undefined, { statusSemAviso: ERROS_PROPRIOS });
      this.dialogo.toast('Os outros aparelhos foram desconectados.');
    } catch (e) {
      if ((e as { status?: number })?.status) this.dialogo.toast('Não foi possível desconectar os outros aparelhos.', true);
    } finally {
      this.desconectando.set(false);
    }
  }
}
