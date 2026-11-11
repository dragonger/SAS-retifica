import { catalogoDasCategorias, clonarItem, itensDisponiveis, mesmoItem, rotuloDoItem } from './itens-pedido';
import { CategoriaMarcada, ItemCatalogo } from './modelos';

const ZERO = { valorServicos: 0, valorPecas: 0 };
const CATALOGO: ItemCatalogo[] = [
  { id: 1, categoria: 'CABECOTE', nome: 'Plainar' },
  { id: 2, categoria: 'BLOCO', nome: 'Plainar' },
  { id: 3, categoria: 'BLOCO', nome: 'Brunir' },
];

describe('itens do pedido', () => {
  it('mesmoItem: mesmo nome (sem maiúscula/espaço nas pontas) e mesma categoria', () => {
    expect(mesmoItem({ descricao: ' Plainar ', categoria: 'BLOCO' }, 'plainar', 'BLOCO')).toBe(true);
    expect(mesmoItem({ descricao: 'Plainar', categoria: 'BLOCO' }, 'Plainar', 'CABECOTE')).toBe(false);
    expect(mesmoItem({ descricao: 'Plainar', categoria: 'BLOCO' }, 'Brunir', 'BLOCO')).toBe(false);
  });

  it('mesmoItem: item antigo (sem categoria) casa com qualquer categoria', () => {
    expect(mesmoItem({ descricao: 'Plainar', categoria: null }, 'Plainar', 'CABECOTE')).toBe(true);
    expect(mesmoItem({ descricao: 'Plainar' }, 'Plainar', 'BLOCO')).toBe(true);
    expect(mesmoItem({ descricao: 'Plainar', categoria: 'BLOCO' }, 'Plainar', null)).toBe(true);
  });

  it('clonarItem guarda categoria nula quando não há', () => {
    expect(clonarItem({ descricao: 'Junta', quantidade: 2 })).toEqual({ descricao: 'Junta', quantidade: 2, categoria: null });
    expect(Object.keys(clonarItem({ descricao: 'Junta', quantidade: 2, categoria: 'BLOCO' }))).toEqual(['descricao', 'quantidade', 'categoria']);
  });

  it('catalogoDasCategorias: sem categoria marcada mostra tudo; com marcadas, só elas', () => {
    expect(catalogoDasCategorias(CATALOGO, []).length).toBe(3);
    const marcadas: CategoriaMarcada[] = [['BLOCO', ZERO]];
    expect(catalogoDasCategorias(CATALOGO, marcadas).map(i => i.id)).toEqual([2, 3]);
  });

  it('itensDisponiveis esconde o que já está no pedido', () => {
    const marcadas: CategoriaMarcada[] = [['BLOCO', ZERO], ['CABECOTE', ZERO]];
    const lista = [{ descricao: 'plainar', categoria: 'BLOCO' }];
    expect(itensDisponiveis(CATALOGO, marcadas, lista).map(i => i.id)).toEqual([1, 3]);
  });

  it('rotuloDoItem mostra a categoria só quando o nome se repete, e a quantidade das peças', () => {
    const lista = [
      { descricao: 'Plainar', categoria: 'BLOCO', quantidade: 1 },
      { descricao: 'Plainar', categoria: 'CABECOTE', quantidade: 1 },
      { descricao: 'Junta', categoria: 'BLOCO', quantidade: 3 },
    ];
    const rotulo = (n: string) => ({ BLOCO: 'Bloco', CABECOTE: 'Cabeçote' } as Record<string, string>)[n] ?? n;
    expect(rotuloDoItem(lista, 0, rotulo, false)).toBe('Plainar · Bloco');
    expect(rotuloDoItem(lista, 1, rotulo, false)).toBe('Plainar · Cabeçote');
    expect(rotuloDoItem(lista, 2, rotulo, true)).toBe('Junta ×3');
  });
});
