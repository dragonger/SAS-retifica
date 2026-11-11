import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, ErroApi } from '../../core/api.service';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { ComGuardaSaida, GuardaSaida } from '../../core/guarda-saida.service';
import { TopoService } from '../../core/topo.service';
import { BotoesCadastro } from '../../shared/botoes-cadastro';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';
import { FormularioRecolhivel } from '../../shared/formulario-recolhivel';
import { Cliente } from '../../shared/modelos';
import { comOcupado } from '../../shared/ocupado';
import { exibirAoSair, mascararAoDigitar, telefoneCombina, telefoneExibicao } from '../../shared/telefone';
import { cadastrados } from '../../shared/texto';

const PATH = '/api/clientes';

/** Clientes (#/clientes): telaClientes do app.js. */
@Component({
  selector: 'app-clientes',
  templateUrl: './clientes.html',
  imports: [Campo, BotoesCadastro, FormularioRecolhivel],
})
export class Clientes implements ComGuardaSaida {
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);
  private readonly router = inject(Router);

  protected readonly lista = signal<Cliente[]>([]);
  protected readonly carregado = signal(false);
  protected readonly busca = signal('');
  protected readonly subtitulo = computed(() => cadastrados(this.lista().length));
  protected readonly filtrados = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const lista = this.lista();
    return !termo ? lista : lista.filter(c =>
      (c.nome || '').toLowerCase().includes(termo) || telefoneCombina(c.telefone, termo));
  });

  protected readonly emEdicaoId = signal<number | null>(null);
  protected readonly nome = signal('');
  protected readonly telefone = signal('');
  protected readonly rua = signal('');
  protected readonly numero = signal('');
  protected readonly bairro = signal('');
  protected readonly cep = signal('');
  protected readonly municipio = signal('');
  protected readonly uf = signal('');
  protected readonly salvando = signal(false);
  protected readonly removendo = signal(false);

  protected readonly cadastro = viewChild<FormularioRecolhivel<Cliente>>('cadastro');
  protected readonly valorDe = valorDe;
  protected readonly telefoneExibicao = telefoneExibicao;
  protected readonly mascararAoDigitar = mascararAoDigitar;
  protected readonly exibirAoSair = exibirAoSair;

  protected readonly fotografia = () => [this.nome(), this.telefone(), this.rua(), this.numero(),
    this.bairro(), this.cep(), this.municipio(), this.uf()].join('\u0001');

  constructor() {
    inject(TopoService).definirTitulo('Clientes');
    void this.carregar();
  }

  guardaSaida(): GuardaSaida | null {
    return this.cadastro()?.guardaSaida() ?? null;
  }

  private async carregar(): Promise<void> {
    try {
      const [lista] = await this.cache.carregarComCache<[Cliente[]]>([PATH]);
      this.lista.set(lista);
      this.carregado.set(true);
    } catch { /* o interceptor já avisou */ }
  }

  private async recarregarLista(): Promise<void> {
    this.cache.invalidar(PATH);
    try {
      this.lista.set(await this.cache.buscarECachear<Cliente[]>(PATH));
    } catch { /* o interceptor já avisou; a próxima visita busca de novo */ }
  }

  protected preencher(c: Cliente): void {
    this.emEdicaoId.set(c.id);
    this.nome.set(c.nome || '');
    this.telefone.set(telefoneExibicao(c.telefone));
    this.rua.set(c.rua || '');
    this.numero.set(c.numero || '');
    this.bairro.set(c.bairro || '');
    this.cep.set(c.cep || '');
    this.municipio.set(c.municipio || '');
    this.uf.set(c.uf || '');
  }

  protected limpar(): void {
    this.emEdicaoId.set(null);
    for (const campo of [this.nome, this.telefone, this.rua, this.numero, this.bairro, this.cep, this.municipio, this.uf]) campo.set('');
  }

  /** Na edição: atalho pros pedidos deste cliente (abertos e finalizados). */
  protected verPedidos(): void {
    const id = this.emEdicaoId();
    if (id !== null) void this.router.navigate(['/pedidos'], { queryParams: { cliente: id } });
  }

  protected async remover(): Promise<void> {
    const alvo = this.emEdicaoId();
    if (alvo === null) return;
    if (!(await this.dialogo.confirmar('Remover este cliente?', 'Remover', true))) return;
    await comOcupado(this.removendo, async () => {
      try {
        await this.api.delete(PATH + '/' + alvo, { statusSemAviso: [409] });
      } catch (e) {
        if (e instanceof ErroApi && e.status === 409) this.dialogo.toast('Não foi possível remover: cliente tem pedidos vinculados.', true);
        return;
      }
      this.cadastro()?.fechar();
      this.dialogo.toast('Removido.');
      await this.recarregarLista();
    });
  }

  protected async salvar(ev: Event): Promise<void> {
    ev.preventDefault();
    if (!this.nome().trim()) { this.dialogo.toast('Informe o nome do cliente.', true); return; }
    const corpo = {
      nome: this.nome().trim(),
      telefone: this.telefone().trim() || null,
      rua: this.rua().trim() || null,
      numero: this.numero().trim() || null,
      bairro: this.bairro().trim() || null,
      cep: this.cep().trim() || null,
      municipio: this.municipio().trim() || null,
      uf: this.uf().trim() || null,
    };
    const alvo = this.emEdicaoId();
    await comOcupado(this.salvando, async () => {
      if (alvo) await this.api.put(PATH + '/' + alvo, corpo);
      else await this.api.post(PATH, corpo);
      this.cadastro()?.fechar();
      this.dialogo.toast('Cliente salvo.');
      await this.recarregarLista();
    });
  }
}
