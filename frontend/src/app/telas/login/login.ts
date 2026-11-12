import { Component, inject, signal } from '@angular/core';
import { SessaoService } from '../../core/sessao.service';
import { TopoService } from '../../core/topo.service';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';

/**
 * Login (#/login): e-mail e senha da conta da retífica. Embaixo, "Abrir demonstração" para quem quer
 * conhecer o sistema: uma empresa isolada com dados fictícios, apagada depois de 2 horas.
 */
@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  imports: [Campo],
})
export class Login {
  private readonly sessao = inject(SessaoService);

  protected readonly email = signal('');
  protected readonly senha = signal('');
  protected readonly erro = signal('');
  protected readonly erroDemo = signal('');
  protected readonly ocupado = signal(false);

  protected readonly valorDe = valorDe;

  constructor() {
    inject(TopoService).definirTitulo('Entrar');
  }

  protected async entrar(): Promise<void> {
    if (this.ocupado()) return;
    this.erro.set('');
    const email = this.email().trim();
    if (!email || !this.senha()) { this.erro.set('Preencha e-mail e senha.'); return; }
    this.ocupado.set(true);
    try {
      const resultado = await this.sessao.entrar(email, this.senha());
      if (resultado === 'semConexao') this.erro.set('Sem conexão com o servidor.');
      if (resultado === 'invalido') this.erro.set('E-mail ou senha inválidos.');
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async abrirDemonstracao(): Promise<void> {
    if (this.ocupado()) return;
    this.erroDemo.set('');
    this.ocupado.set(true);
    try {
      const resultado = await this.sessao.abrirDemonstracao();
      if (resultado === 'limite') this.erroDemo.set('Muitas demonstrações abertas agora. Tente de novo em alguns minutos.');
      if (resultado === 'indisponivel') this.erroDemo.set('A demonstração não está disponível no momento.');
      if (resultado === 'semConexao') this.erroDemo.set('Sem conexão com o servidor.');
    } finally {
      this.ocupado.set(false);
    }
  }
}
