/*
 * Ditar o pedido: a parte PURA (sem DOM nem rede). Porta de backend/src/main/resources/static/ditado.js, com o mesmo
 * comportamento: transforma o que a IA entendeu em dados do formulário de pedido e diz o que ainda ficou pendente.
 *
 * Regra de ouro: nada que a pessoa já preencheu é trocado sozinho. Se o ditado diz outra coisa, vira CONFLITO
 * (aparece na conferência) e o formulário continua como estava.
 */
import { CategoriaMarcada, ClienteEscolhido, ComponentePedido, ItemPedido, ValoresCategoria } from './modelos';
import { DadosRascunho } from './rascunho-pedido';

const ROTULO_CATEGORIA: Record<string, string> = {
  CABECOTE: 'Cabeçote', BLOCO: 'Bloco', BIELA: 'Biela', VIRABREQUIM: 'Virabrequim', MONTAGEM: 'Montagem', OUTRO: 'Outro',
};

/** Estado de cada campo que a IA devolve (`LIVRE` só para serviços e peças). */
export type EstadoEntendido = 'OK' | 'DUVIDA' | 'NAO_ENCONTRADO' | 'AUSENTE' | 'LIVRE';

export interface OpcaoDuvida {
  id: number;
  nome: string;
}

/** Cliente, modelo, serviço ou peça entendido (campos de `entendimento` da resposta do servidor). */
export interface RefEntendida {
  estado: EstadoEntendido;
  id?: number | null;
  nome?: string | null;
  categoria?: string | null;
  quantidade?: number | null;
  opcoes?: OpcaoDuvida[];
  ouvido?: string | null;
}

export interface ValorEntendido {
  categoria: string;
  valorServicos?: number | null;
  valorPecas?: number | null;
}

/** `entendimento` da resposta de POST /api/ditado (já validado contra o catálogo da empresa pelo servidor). */
export interface Entendimento {
  cliente?: RefEntendida | null;
  componentes?: RefEntendida[] | null;
  servicos?: RefEntendida[] | null;
  pecas?: RefEntendida[] | null;
  valores?: ValorEntendido[] | null;
  entregaData?: string | null;
  entregaOuvido?: string | null;
  status?: string | null;
  descricao?: string | null;
  observacao?: string | null;
  descontoTipo?: string | null;
  descontoValor?: number | string | null;
}

/** O que ainda precisa de atenção depois de preencher. */
export interface Pendencia {
  campo: string;
  aba: string;
  texto: string;
  acao?: 'cadastrarCliente';
  nome?: string;
}

/** O ditado diz algo diferente do que já está no formulário. */
export interface Conflito {
  campo: string;
  aba: string;
  texto: string;
}

export interface Pergunta {
  id: string;
  texto: string;
  tipo: 'ESCOLHA' | 'ABERTA' | string;
  opcoes?: { indice: number; rotulo: string }[];
}

export interface RespostaDitado {
  perguntaId: string;
  opcaoIndice?: number;
  texto?: string;
}

export interface ResultadoParaRascunho {
  /** No formato de aplicar() do formulário. */
  dados: DadosRascunho;
  pendencias: Pendencia[];
  conflitos: Conflito[];
}

/** Catálogo do formulário que o ditado usa para completar o telefone do cliente e a categoria do modelo. */
export interface CatalogoDitado {
  clientes?: { id: number; nome: string; telefone?: string | null }[];
  cabecotes?: { id: number; nome: string; categoria?: string | null }[];
}

export function rotuloCategoria(cat: string | null | undefined): string {
  return (cat && ROTULO_CATEGORIA[cat]) || cat || '';
}

/** O construtor de reconhecimento de voz do navegador, ou null (Firefox, navegadores antigos). */
export function reconhecimentoDisponivel(win: unknown): (new () => unknown) | null {
  if (!win) return null;
  const w = win as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function semAcento(texto: unknown): string {
  return String(texto || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Mesmo serviço/peça no pedido: mesmo nome e mesma categoria (item antigo, sem categoria, casa com qualquer uma).
 * Diferente do mesmoItem de shared/itens-pedido.ts: este ignora também o acento (o que a IA devolve vem do catálogo,
 * mas o formulário pode ter o item digitado à mão).
 */
export function mesmoItem(entrada: Pick<ItemPedido, 'descricao' | 'categoria'>, nome: string, categoria?: string | null): boolean {
  return semAcento(entrada.descricao) === semAcento(nome)
    && (!entrada.categoria || !categoria || entrada.categoria === categoria);
}

export function moeda(n: unknown): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataBr(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : (iso || '');
}

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** O usuário escolheu uma opção de uma dúvida: devolve o campo já resolvido (estado OK, com id e nome). */
export function escolherOpcao(ref: RefEntendida, opcaoId: number): RefEntendida {
  const op = (ref.opcoes || []).find(o => o.id === opcaoId);
  if (!op) return ref;
  return Object.assign({}, ref, { estado: 'OK' as const, id: op.id, nome: op.nome, opcoes: [] });
}

/**
 * Monta os dados do formulário a partir do que a IA entendeu.
 *
 * @param entendimento `entendimento` da resposta do servidor
 * @param atual        dados do formulário agora (obterAtual do formulário)
 * @param catalogo     { clientes, cabecotes } carregados no formulário
 */
export function paraRascunho(
  entendimento: Entendimento | null | undefined,
  atual: Partial<DadosRascunho> | null | undefined,
  catalogo?: CatalogoDitado | null,
): ResultadoParaRascunho {
  const e = entendimento || {};
  const cat = catalogo || {};
  const dados = JSON.parse(JSON.stringify(atual || {})) as DadosRascunho;
  dados.componentes = dados.componentes || [];
  dados.servicos = dados.servicos || [];
  dados.pecas = dados.pecas || [];
  dados.categorias = dados.categorias || [];
  const pendencias: Pendencia[] = [];
  const conflitos: Conflito[] = [];

  function entradaCategoria(categoria: string): ValoresCategoria {
    let par = dados.categorias.find(p => p[0] === categoria);
    if (!par) {
      par = [categoria, { valorServicos: 0, valorPecas: 0 }] as CategoriaMarcada;
      dados.categorias.push(par);
    }
    return par[1];
  }

  // ---- cliente
  const c: RefEntendida = e.cliente || { estado: 'AUSENTE' };
  if (c.estado === 'OK') {
    const noCatalogo = (cat.clientes || []).find(x => x.id === c.id);
    const novo = { id: c.id as number, nome: c.nome as string, telefone: noCatalogo ? noCatalogo.telefone : null } as ClienteEscolhido;
    if (!dados.cliente) dados.cliente = novo;
    else if (dados.cliente.id !== c.id) {
      conflitos.push({ campo: 'cliente', aba: 'cliente',
        texto: 'Cliente: o formulário tem "' + dados.cliente.nome + '" e você disse "' + c.nome + '".' });
    }
  } else if (!dados.cliente) {
    if (c.estado === 'DUVIDA') {
      pendencias.push({ campo: 'cliente', aba: 'cliente',
        texto: 'Qual cliente? Nomes parecidos: ' + (c.opcoes || []).map(o => o.nome).join(', ') + '.' });
    } else if (c.estado === 'NAO_ENCONTRADO') {
      pendencias.push({ campo: 'cliente', aba: 'cliente', acao: 'cadastrarCliente', nome: c.ouvido || '',
        texto: 'Cliente "' + (c.ouvido || '') + '" não está cadastrado.' });
    } else {
      pendencias.push({ campo: 'cliente', aba: 'cliente', texto: 'Falta escolher o cliente.' });
    }
  }

  // ---- componentes (modelos técnicos)
  (e.componentes || []).forEach(r => {
    if (r.estado === 'OK') {
      if (!dados.componentes.some(x => x.id === r.id)) dados.componentes.push({ id: r.id, nome: r.nome } as ComponentePedido);
      const noCatalogo = (cat.cabecotes || []).find(x => x.id === r.id);
      const categoria = (noCatalogo && noCatalogo.categoria) || r.categoria;
      if (categoria) entradaCategoria(categoria);
    } else if (r.estado === 'DUVIDA') {
      pendencias.push({ campo: 'componentes', aba: 'componentes',
        texto: 'Qual modelo? Parecidos: ' + (r.opcoes || []).map(o => o.nome).join(', ') + '.' });
    } else if (r.estado === 'NAO_ENCONTRADO') {
      pendencias.push({ campo: 'componentes', aba: 'componentes',
        texto: 'Modelo "' + (r.ouvido || '') + '" não está no catálogo.' });
    }
  });
  if (!dados.componentes.length && !pendencias.some(p => p.campo === 'componentes')) {
    pendencias.push({ campo: 'componentes', aba: 'componentes', texto: 'Falta o modelo (componente).' });
  }

  // ---- serviços e peças
  function itens(lista: RefEntendida[] | null | undefined, destino: ItemPedido[], comQuantidade: boolean, rotulo: string): void {
    (lista || []).forEach(i => {
      if (i.estado === 'DUVIDA') {
        pendencias.push({ campo: 'itens', aba: 'itens',
          texto: 'Qual ' + rotulo + '? Parecidos: ' + (i.opcoes || []).map(o => o.nome).join(', ') + '.' });
        return;
      }
      if (!i.nome) return;
      const categoria = i.categoria || null;
      const existente = destino.find(x => mesmoItem(x, i.nome as string, categoria));
      if (existente) {
        if (comQuantidade && i.quantidade && existente.quantidade && existente.quantidade !== i.quantidade) {
          conflitos.push({ campo: 'itens', aba: 'itens',
            texto: 'Peça "' + i.nome + '": o formulário tem ' + existente.quantidade + ' e você disse ' + i.quantidade + '.' });
        }
      } else {
        const linha: ItemPedido = { descricao: i.nome, categoria };
        if (comQuantidade) linha.quantidade = i.quantidade || 1;
        destino.push(linha);
      }
      if (categoria) entradaCategoria(categoria);
    });
  }
  itens(e.servicos, dados.servicos, false, 'serviço');
  itens(e.pecas, dados.pecas, true, 'peça');
  if (!dados.servicos.length && !dados.pecas.length && !pendencias.some(p => p.campo === 'itens')) {
    pendencias.push({ campo: 'itens', aba: 'itens', texto: 'Faltam serviços ou peças.' });
  }

  // ---- valores por categoria
  (e.valores || []).forEach(v => {
    const entrada = entradaCategoria(v.categoria);
    ([['valorServicos', 'serviços'], ['valorPecas', 'peças']] as const).forEach(([campo, nome]) => {
      const dito = numero(v[campo]);
      const atualValor = numero(entrada[campo]);
      if (dito <= 0) return;
      if (atualValor === 0) entrada[campo] = dito;
      else if (atualValor !== dito) {
        conflitos.push({ campo: 'valores', aba: 'itens',
          texto: 'Valor de ' + nome + ' (' + rotuloCategoria(v.categoria) + '): o formulário tem '
            + moeda(atualValor) + ' e você disse ' + moeda(dito) + '.' });
      }
    });
  });
  dados.categorias.forEach(([categoria, v]) => {
    if (numero(v.valorServicos) === 0 && numero(v.valorPecas) === 0) {
      pendencias.push({ campo: 'valores', aba: 'itens', texto: 'Falta o valor de ' + rotuloCategoria(categoria) + '.' });
    }
  });

  // ---- entrega, descrição, observação, situação, desconto
  if (e.entregaData) {
    if (!dados.entrega) dados.entrega = e.entregaData;
    else if (dados.entrega !== e.entregaData) {
      conflitos.push({ campo: 'entrega', aba: 'pedido',
        texto: 'Entrega: o formulário tem ' + dataBr(dados.entrega) + ' e você disse ' + dataBr(e.entregaData) + '.' });
    }
  } else if (!dados.entrega) {
    pendencias.push({ campo: 'entrega', aba: 'pedido', texto: 'Falta a data de entrega.' });
  }
  (['descricao', 'observacao'] as const).forEach(campo => {
    const dito = e[campo];
    if (!dito) return;
    if (!dados[campo]) dados[campo] = dito;
    else if (dados[campo] !== dito) {
      conflitos.push({ campo, aba: 'pedido',
        texto: (campo === 'descricao' ? 'Descrição' : 'Observação') + ': o formulário já tem um texto diferente.' });
    }
  });
  if (e.status) {
    if (!dados.status || dados.status === 'ABERTO') dados.status = e.status;
    else if (dados.status !== e.status) {
      conflitos.push({ campo: 'status', aba: 'pedido', texto: 'Situação: o formulário já tem outra situação.' });
    }
  }
  if (e.descontoTipo && numero(e.descontoValor) > 0) {
    if (!dados.descontoTipo) {
      dados.descontoTipo = e.descontoTipo;
      dados.descontoValor = String(e.descontoValor);
    } else if (dados.descontoTipo !== e.descontoTipo || numero(dados.descontoValor) !== numero(e.descontoValor)) {
      conflitos.push({ campo: 'desconto', aba: 'itens', texto: 'Desconto: o formulário já tem outro desconto.' });
    }
  }

  return { dados, pendencias, conflitos };
}

/** Corpo de POST /api/ditado/{id}/respostas a partir do que a pessoa escolheu: escolhas[perguntaId] = índice (número) ou texto. */
export function montarRespostas(
  perguntas: readonly { id: string }[] | null | undefined,
  escolhas: Record<string, number | string> | null | undefined,
): RespostaDitado[] {
  const respostas: RespostaDitado[] = [];
  (perguntas || []).forEach(p => {
    const e = (escolhas || {})[p.id];
    if (typeof e === 'number') respostas.push({ perguntaId: p.id, opcaoIndice: e });
    else if (typeof e === 'string' && e.trim()) respostas.push({ perguntaId: p.id, texto: e.trim().slice(0, 300) });
  });
  return respostas;
}

/** Menor aba (na ordem do formulário) que tem pendência ou conflito, ou null. */
export function primeiraAba(
  pendencias: readonly { aba: string }[] | null | undefined,
  conflitos: readonly { aba: string }[] | null | undefined,
  ordem: readonly string[] | null | undefined,
): string | null {
  const abas = (pendencias || []).concat(conflitos || []).map(x => x.aba);
  const achadas = (ordem || []).filter(a => abas.indexOf(a) >= 0);
  return achadas.length ? achadas[0] : null;
}
