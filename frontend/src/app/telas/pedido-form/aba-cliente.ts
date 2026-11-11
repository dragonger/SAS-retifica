import { Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { CacheService } from '../../core/cache.service';
import { clientesRecentesIds } from '../../core/clientes-recentes';
import { DialogoService } from '../../core/dialogo.service';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';
import { Cliente } from '../../shared/modelos';
import { comOcupado } from '../../shared/ocupado';
import { exibirAoSair, mascararAoDigitar, telefoneCombina, telefoneExibicao } from '../../shared/telefone';
import { EstadoPedidoForm } from './estado-pedido-form';

/** Etapa "Cliente" do pedido: cliente escolhido, recentes, busca e cadastro rápido. */
@Component({
  selector: 'app-aba-cliente',
  imports: [Campo],
  host: { style: 'display: contents' },
  template: `
    @if (estado.cliente(); as c) {
      <div class="cliente-selecionado card-destaque elev-sm blueprint">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div>
          <div class="card-destaque-titulo">{{ c.nome }}</div>
          <div style="font-size:12px;opacity:.7">{{ telefoneExibicao(c.telefone) }}</div>
        </div>
        <button type="button" (click)="estado.cliente.set(null)">Trocar</button>
      </div>
    }

    <div [hidden]="!!estado.cliente()">
      <div class="field" [hidden]="!recentes().length">
        <label>Recentes</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          @for (c of recentes(); track c.id) {
            <button type="button" class="chip chip-outline" (click)="estado.escolherCliente(c)">{{ c.nome }}</button>
          }
        </div>
      </div>
      <!-- o campo tem margin-bottom próprio; aqui a lista vem logo abaixo da busca -->
      <app-campo rotulo="Buscar cliente" style="margin-bottom:0">
        <input class="input" type="search" placeholder="Buscar por nome ou telefone..." [value]="busca()" (input)="busca.set(valorDe($event))">
      </app-campo>
      <div class="lista-escolha">
        @if (!filtrados().length) {
          <div class="lista-escolha-vazia">Nenhum cliente encontrado</div>
        }
        @for (c of filtrados(); track c.id) {
          <button type="button" (click)="estado.escolherCliente(c)">{{ c.nome }}@if (c.telefone) {<span class="tel">{{ ' — ' + telefoneExibicao(c.telefone) }}</span>}</button>
        }
      </div>
    </div>

    <button type="button" class="btn btn-secondary btn-block" [hidden]="!!estado.cliente()"
            (click)="estado.novoClienteAberto.set(!estado.novoClienteAberto())">Novo cliente</button>
    <div class="caixa-form blueprint" [hidden]="!estado.novoClienteAberto()">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <app-campo rotulo="Nome">
        <input class="input" type="text" maxlength="255" placeholder="Nome completo" [value]="estado.novoClienteNome()"
               (input)="estado.novoClienteNome.set(valorDe($event))">
      </app-campo>
      <app-campo rotulo="Telefone">
        <input class="input" type="tel" inputmode="tel" maxlength="255" placeholder="(31) 90000-0000" [value]="estado.novoClienteTelefone()"
               (input)="estado.novoClienteTelefone.set(mascararAoDigitar($event))"
               (blur)="estado.novoClienteTelefone.set(exibirAoSair($event))">
      </app-campo>
      <button type="button" class="btn btn-secondary btn-block" [disabled]="salvando()" (click)="salvarCliente()">{{ salvando() ? 'Salvando…' : 'Salvar cliente' }}</button>
    </div>
  `,
})
export class AbaCliente {
  protected readonly estado = inject(EstadoPedidoForm);
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);
  private readonly dialogo = inject(DialogoService);

  protected readonly busca = signal('');
  protected readonly salvando = signal(false);
  protected readonly valorDe = valorDe;
  protected readonly telefoneExibicao = telefoneExibicao;
  protected readonly mascararAoDigitar = mascararAoDigitar;
  protected readonly exibirAoSair = exibirAoSair;

  /** Clientes dos últimos pedidos criados neste aparelho (até 5), para o caso comum de cliente recorrente. */
  protected readonly recentes = computed(() => {
    const clientes = this.estado.catalogo().clientes;
    return clientesRecentesIds()
      .map(rid => clientes.find(c => c.id === rid))
      .filter((c): c is Cliente => !!c)
      .slice(0, 5);
  });

  protected readonly filtrados = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const clientes = this.estado.catalogo().clientes;
    return !termo ? clientes : clientes.filter(c =>
      (c.nome || '').toLowerCase().includes(termo) || telefoneCombina(c.telefone, termo));
  });

  protected async salvarCliente(): Promise<void> {
    const nome = this.estado.novoClienteNome().trim();
    if (!nome) { this.dialogo.toast('Informe o nome.', true); return; }
    const novo = await comOcupado(this.salvando, () => this.api.post<Cliente>('/api/clientes', {
      nome,
      telefone: this.estado.novoClienteTelefone().trim() || null,
    }));
    if (!novo) return;
    this.estado.adicionarAoCatalogo('clientes', novo);
    this.cache.invalidar('/api/clientes');
    this.estado.escolherCliente(novo);
    this.estado.novoClienteNome.set('');
    this.estado.novoClienteTelefone.set('');
    this.estado.novoClienteAberto.set(false);
    this.dialogo.toast('Cliente cadastrado.');
    this.estado.aoMudar();
  }
}
