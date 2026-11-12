import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CHAVE_AUTH } from '../core/auth.service';
import { DialogoService } from '../core/dialogo.service';
import { CATALOGO_PATHS, PedidoForm } from '../telas/pedido-form/pedido-form';
import { PedidoDetalhe } from '../shared/modelos';
import { esperar, provedoresDeTela, tokenDeTeste } from './ajuda';

/** Catálogos de teste, na ordem de CATALOGO_PATHS (cabeçotes, serviços, peças, categorias, clientes). */
export const CATALOGOS: Record<string, unknown[]> = {
  '/api/cabecotes': [
    { id: 1, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Fiat Uno' },
    { id: 2, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Gol' },
    { id: 3, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'Scania' },
  ],
  '/api/servicos-catalogo': [
    { id: 10, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Plainar', valor: 0 },
    { id: 11, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'Plainar', valor: 0 },
    { id: 12, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'Brunir', valor: 0 },
  ],
  '/api/pecas-catalogo': [
    { id: 20, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Junta', valor: 0 },
    { id: 21, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'Pistão', valor: 0 },
  ],
  '/api/categorias': [
    { nome: 'CABECOTE', rotulo: 'Cabeçote' }, { nome: 'BLOCO', rotulo: 'Bloco' }, { nome: 'BIELA', rotulo: 'Biela' },
    { nome: 'VIRABREQUIM', rotulo: 'Virabrequim' }, { nome: 'MONTAGEM', rotulo: 'Montagem' },
  ],
  '/api/clientes': [
    { id: 3, nome: 'Maria Souza', telefone: '31985565586' },
    { id: 4, nome: 'João da Silva', telefone: null },
  ],
};

export const PEDIDO_12: PedidoDetalhe = {
  id: 12,
  cliente: { id: 3, nome: 'Maria Souza', telefone: '31985565586' },
  componentes: [{ id: 1, nome: 'Fiat Uno', categoriaRotulo: 'Cabeçote' }],
  pedidoDescricao: 'Retífica completa',
  datCriacao: '01/10/2026',
  datEntregaEstimada: '2026-10-20',
  situacao: 'Pronto',
  status: 'PRONTO',
  finalizado: false,
  servicos: [{ descricao: 'Plainar', categoria: 'CABECOTE', quantidade: 1 }],
  pecas: [{ descricao: 'Junta', categoria: 'CABECOTE', quantidade: 2 }],
  categoriaValores: [{ categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', valorTotal: 1000, valorServicos: 800, valorPecas: 200 }],
  observacao: 'Entregar à tarde',
  descontoTipo: 'PERCENTUAL',
  descontoValor: 10,
  subtotal: 1000,
  totalGeral: 900,
};

export interface OpcoesFormulario {
  /** Id do pedido em edição; sem id é o pedido novo. */
  id?: string;
  pedido?: PedidoDetalhe | null;
  /** Sessão com este usuário|empresa (padrão 7|3); `false` = sem sessão. */
  sessao?: { usuarioId: number; empresaId: number } | false;
  /** Escreve no localStorage antes de abrir o formulário (rascunhos prontos, por exemplo). */
  antes?: () => void;
  /** Roda depois de o TestBed estar configurado e antes de a tela abrir (marcar o rascunho a retomar, por exemplo). */
  preparar?: () => void;
  /** O servidor tem o ditado ligado (GET /api/ditado/status)? Padrão: não. Só é perguntado em pedido novo. */
  ditado?: boolean;
  /** Responde ao aviso "Você tem um pedido incompleto..." (se aparecer) antes de seguir. */
  resposta?: 'continuar' | 'descartar';
}

/** Abre o formulário do pedido com o servidor de teste, responde às cargas e deixa a tela assentar. */
export async function montarFormulario(opcoes: OpcoesFormulario = {}) {
  localStorage.clear();
  if (opcoes.sessao !== false) {
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: tokenDeTeste(opcoes.sessao ?? { usuarioId: 7, empresaId: 3 }), empresaNome: 'DIH' }));
  }
  opcoes.antes?.();
  const parametros = new BehaviorSubject(convertToParamMap(opcoes.id ? { id: opcoes.id } : {}));
  TestBed.configureTestingModule({
    providers: [...provedoresDeTela(), { provide: ActivatedRoute, useValue: { paramMap: parametros } }],
  });
  opcoes.preparar?.();
  const http = TestBed.inject(HttpTestingController);
  const dialogo = TestBed.inject(DialogoService);
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PedidoForm);
  await fixture.whenStable();
  for (const path of CATALOGO_PATHS) http.expectOne(path).flush(CATALOGOS[path]);
  if (opcoes.id) http.expectOne('/api/pedidos/' + opcoes.id).flush('pedido' in opcoes ? (opcoes.pedido ?? null) : PEDIDO_12);
  await esperar(fixture);
  if (!opcoes.id) {
    http.expectOne('/api/ditado/status').flush({ habilitado: !!opcoes.ditado, usosRestantesHoje: 100 });
    await esperar(fixture);
  }
  if (opcoes.resposta && dialogo.dialogos().length) {
    dialogo.dialogos().at(-1)!.responder(opcoes.resposta);
    await esperar(fixture);
  }
  const html = fixture.nativeElement as HTMLElement;
  return { fixture, html, http, dialogo, navegar, componente: fixture.componentInstance, parametros };
}

export type Formulario = Awaited<ReturnType<typeof montarFormulario>>;

// ---- atalhos de DOM ----

export const botao = (html: HTMLElement, texto: string) =>
  [...html.querySelectorAll('button')].find(b => b.textContent?.trim() === texto) as HTMLButtonElement;

export const painel = (html: HTMLElement, aba: string) => html.querySelector(`[data-aba="${aba}"]`) as HTMLElement;

/** Etapa visível agora (as outras ficam com `hidden`). */
export const abaVisivel = (html: HTMLElement) =>
  [...html.querySelectorAll<HTMLElement>('[data-aba]')].filter(p => !p.hidden).map(p => p.dataset['aba']);

export const textoDe = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Espera o tempo do autosave do rascunho (400 ms) e deixa a tela assentar. */
export async function esperarRascunho(fixture: Formulario['fixture']): Promise<void> {
  await new Promise(r => setTimeout(r, 450));
  await esperar(fixture);
}
