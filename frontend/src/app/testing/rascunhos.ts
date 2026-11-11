import { CHAVE_RASCUNHOS } from '../core/auth.service';

const DADOS = { cliente: null, status: 'ABERTO', descricao: '', entrega: '', observacao: '', descontoTipo: '', descontoValor: '', categorias: [], componentes: [], servicos: [], pecas: [] };

/** Grava rascunhos como o app atual: { "<dono>": { "<chave>": { quando, titulo, dados } } }. */
export function gravarRascunhosDeTeste(itens: Record<string, { quando: number; titulo: string }>, dono = '7|3'): void {
  const meus: Record<string, unknown> = {};
  for (const [chave, r] of Object.entries(itens)) meus[chave] = { ...r, dados: DADOS };
  const todos = JSON.parse(localStorage.getItem(CHAVE_RASCUNHOS) || '{}');
  todos[dono] = meus;
  localStorage.setItem(CHAVE_RASCUNHOS, JSON.stringify(todos));
}
