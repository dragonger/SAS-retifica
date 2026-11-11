import { Injectable, computed, signal } from '@angular/core';
import { CATEGORIAS_COMPONENTE, clonarItem } from '../../shared/itens-pedido';
import {
  Cabecote, Categoria, CategoriaMarcada, ClienteEscolhido, Cliente, ComponentePedido, ItemCatalogo, ItemPedido,
  PedidoDetalhe, ValoresCategoria,
} from '../../shared/modelos';
import { Aba, DadosRascunho, PartesDoFormulario, STATUS_OPCOES, partesDoRascunho } from '../../shared/rascunho-pedido';
import { totaisDoPedido } from '../../shared/totais-pedido';

/** Catálogos que o formulário usa (catalogoCache do app.js). */
export interface CatalogoPedido {
  cabecotes: Cabecote[];
  servicos: ItemCatalogo[];
  pecas: ItemCatalogo[];
  categorias: Categoria[];
  clientes: Cliente[];
}

export const CATALOGO_VAZIO: CatalogoPedido = { cabecotes: [], servicos: [], pecas: [], categorias: [], clientes: [] };

/**
 * Tudo o que o formulário do pedido tem preenchido, em signals, compartilhado entre o formulário e as quatro
 * etapas (cada tela do app.js guardava isso em variáveis da função e campos do DOM). Fica no `providers` do
 * formulário: cada abertura da tela começa com um estado novo.
 */
@Injectable()
export class EstadoPedidoForm {
  readonly editando = signal(false);
  readonly catalogo = signal<CatalogoPedido>(CATALOGO_VAZIO);

  readonly cliente = signal<ClienteEscolhido | null>(null);
  readonly status = signal('ABERTO');
  readonly descricao = signal('');
  readonly entrega = signal('');
  readonly observacao = signal('');
  readonly descontoTipo = signal('');
  /** Texto do campo (como o input entrega), não número: é o que vai para o rascunho. */
  readonly descontoValor = signal('');
  readonly categorias = signal<CategoriaMarcada[]>([]);
  readonly componentes = signal<ComponentePedido[]>([]);
  readonly servicos = signal<ItemPedido[]>([]);
  readonly pecas = signal<ItemPedido[]>([]);
  readonly aba = signal<Aba>('cliente');

  /** Cadastro rápido de cliente (aba Cliente): fica aqui para o ditado poder abri-lo já com o nome. */
  readonly novoClienteAberto = signal(false);
  readonly novoClienteNome = signal('');
  readonly novoClienteTelefone = signal('');

  /** Sobe a cada carga ou rascunho aplicado: campos que só são lidos (valores por categoria) são recriados. */
  readonly versao = signal(0);

  /** Avisa o formulário de uma mudança que não veio de um evento dele (cadastros inline), para guardar o rascunho. */
  aoMudar: () => void = () => { /* o formulário troca isto */ };

  readonly totais = computed(() =>
    totaisDoPedido(this.categorias().map(([, v]) => v), this.descontoTipo(), this.descontoValor()));

  /** Categorias de componente marcadas (só muda de verdade quando se marca ou desmarca uma). */
  readonly categoriasDeComponente = computed(
    () => CATEGORIAS_COMPONENTE.filter(cat => this.categorias().some(([c]) => c === cat)),
    { equal: (a, b) => a.join() === b.join() },
  );

  rotuloCategoria(nome: string): string {
    return this.catalogo().categorias.find(c => c.nome === nome)?.rotulo ?? nome;
  }

  marcada(nome: string): boolean {
    return this.categorias().some(([c]) => c === nome);
  }

  alternarCategoria(nome: string): void {
    this.categorias.update(lista => lista.some(([c]) => c === nome)
      ? lista.filter(([c]) => c !== nome)
      : [...lista, [nome, { valorServicos: 0, valorPecas: 0 }] as CategoriaMarcada]);
  }

  definirValorDaCategoria(nome: string, campo: keyof ValoresCategoria, valor: number): void {
    this.categorias.update(lista => lista.map(([c, v]) => c === nome ? [c, { ...v, [campo]: valor }] as CategoriaMarcada : [c, v]));
  }

  escolherCliente(c: ClienteEscolhido): void {
    this.cliente.set({ id: c.id, nome: c.nome, telefone: c.telefone });
    this.novoClienteAberto.set(false); // atualizarClienteUI esconde o cadastro rápido
  }

  adicionarAoCatalogo<K extends 'cabecotes' | 'servicos' | 'pecas' | 'clientes'>(chave: K, item: CatalogoPedido[K][number]): void {
    this.catalogo.update(c => ({ ...c, [chave]: [...(c[chave] as unknown[]), item] }));
  }

  /** Os campos como estão agora (o que vai para o rascunho e para a "fotografia"). */
  partes(): PartesDoFormulario {
    return {
      cliente: this.cliente(),
      status: this.status(),
      descricao: this.descricao(),
      entrega: this.entrega(),
      observacao: this.observacao(),
      descontoTipo: this.descontoTipo(),
      descontoValor: this.descontoValor(),
      categorias: this.categorias(),
      componentes: this.componentes(),
      servicos: this.servicos(),
      pecas: this.pecas(),
    };
  }

  private definir(p: PartesDoFormulario): void {
    this.cliente.set(p.cliente);
    this.status.set(p.status);
    this.descricao.set(p.descricao);
    this.entrega.set(p.entrega);
    this.observacao.set(p.observacao);
    this.descontoTipo.set(p.descontoTipo);
    this.descontoValor.set(p.descontoValor);
    this.categorias.set(p.categorias);
    this.componentes.set(p.componentes);
    this.servicos.set(p.servicos);
    this.pecas.set(p.pecas);
    if (p.cliente) this.novoClienteAberto.set(false);
    this.versao.update(v => v + 1);
  }

  /** aplicarRascunho do app.js: troca os campos pelo que veio do rascunho (feito aqui ou no app atual). */
  aplicar(d: Partial<DadosRascunho>): void {
    this.definir(partesDoRascunho(d, this.status()));
  }

  /** Começa o formulário em branco (pedido novo) ou com o pedido que veio do servidor (edição). */
  iniciar(catalogo: CatalogoPedido, pedido: PedidoDetalhe | null): void {
    this.catalogo.set(catalogo);
    this.editando.set(!!pedido);
    this.aba.set('cliente');
    this.novoClienteAberto.set(false);
    this.novoClienteNome.set('');
    this.novoClienteTelefone.set('');
    if (!pedido) {
      this.definir(partesDoRascunho({}, 'ABERTO'));
      return;
    }
    const categorias: CategoriaMarcada[] = (pedido.categoriaValores || [])
      .filter(cv => cv.categoria)
      .map(cv => [cv.categoria as string, { valorServicos: Number(cv.valorServicos) || 0, valorPecas: Number(cv.valorPecas) || 0 }]);
    const componentes: ComponentePedido[] = (pedido.componentes || []).map(c => ({ id: c.id as number, nome: c.nome }));
    // Compatibilidade: a categoria de cada componente já vinculado aparece marcada, senão o campo ficaria oculto ao editar.
    componentes.forEach(item => {
      const doCatalogo = catalogo.cabecotes.find(c => c.id === item.id);
      if (doCatalogo && !categorias.some(([c]) => c === doCatalogo.categoria)) {
        categorias.push([doCatalogo.categoria, { valorServicos: 0, valorPecas: 0 }]);
      }
    });
    const temDesconto = !!pedido.descontoTipo;
    this.definir({
      cliente: pedido.cliente ? { id: pedido.cliente.id, nome: pedido.cliente.nome, telefone: pedido.cliente.telefone } : null,
      // um status fora das três opções (o select não o tem) cai em "Aberto", como o select do app.js
      status: STATUS_OPCOES.some(([v]) => v === pedido.status) ? (pedido.status as string) : 'ABERTO',
      descricao: pedido.pedidoDescricao || '',
      entrega: pedido.datEntregaEstimada || '',
      observacao: pedido.observacao || '',
      descontoTipo: temDesconto ? (pedido.descontoTipo as string) : '',
      descontoValor: temDesconto && pedido.descontoValor != null ? String(pedido.descontoValor) : '',
      categorias,
      componentes,
      servicos: (pedido.servicos || []).map(clonarItem),
      pecas: (pedido.pecas || []).map(clonarItem),
    });
  }
}
