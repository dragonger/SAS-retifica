import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TopoService } from '../../core/topo.service';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';

/**
 * Login (#/login): telaLogin do app.js. Hoje a rota só redireciona para o Início
 * (login automático, ver core/login-automatico.ts); o componente fica pronto para
 * quando a tela de login for religada.
 */
@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  imports: [Campo],
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly senha = signal('');
  protected readonly erro = signal('');

  protected readonly valorDe = valorDe;

  constructor() {
    inject(TopoService).definirTitulo('Entrar');
  }

  protected async entrar(): Promise<void> {
    this.erro.set('');
    const email = this.email().trim();
    if (!email || !this.senha()) { this.erro.set('Preencha e-mail e senha.'); return; }
    const resultado = await this.auth.entrar(email, this.senha());
    if (resultado === 'semConexao') { this.erro.set('Sem conexão com o servidor.'); return; }
    if (resultado === 'invalido') { this.erro.set('E-mail ou senha inválidos.'); return; }
    await this.router.navigateByUrl('/inicio');
  }
}
