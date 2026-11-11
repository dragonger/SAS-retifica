import { subtotalDasCategorias, totaisDoPedido, valorDoDesconto, valorTotalDaCategoria } from './totais-pedido';

/**
 * Mesmos casos de backend/src/test/java/org/example/model/PedidoTotaisTest.java: a barra do formulário
 * precisa dar o mesmo número que o servidor grava em totalGeral.
 */
const categoria = (servicos: number | null, pecas: number | null) => ({ valorServicos: servicos, valorPecas: pecas });

describe('totais do pedido (espelho de PedidoTotaisTest)', () => {
  it('valorTotalDaCategoria soma serviços e peças ignorando nulos', () => {
    expect(valorTotalDaCategoria(categoria(100.50, 20.25))).toBe(120.75);
    expect(valorTotalDaCategoria(categoria(100, null))).toBe(100);
    expect(valorTotalDaCategoria(categoria(null, 40))).toBe(40);
    expect(valorTotalDaCategoria(categoria(null, null))).toBe(0);
  });

  it('subtotal soma todas as categorias e fica zero sem nenhuma', () => {
    expect(subtotalDasCategorias([])).toBe(0);
    expect(subtotalDasCategorias([categoria(100, 50), categoria(30, null), categoria(null, null)])).toBe(180);
  });

  it('sem desconto ou com desconto inválido não abate', () => {
    const subtotal = 200;
    expect(valorDoDesconto(subtotal, null, null)).toBe(0);
    expect(valorDoDesconto(subtotal, 'VALOR', null)).toBe(0); // valor ausente
    expect(valorDoDesconto(subtotal, null, 50)).toBe(0); // tipo ausente
    expect(valorDoDesconto(subtotal, 'VALOR', 0)).toBe(0);
    expect(valorDoDesconto(subtotal, 'VALOR', -30)).toBe(0); // negativo
    expect(valorDoDesconto(subtotal, 'PERCENTUAL', -10)).toBe(0);
  });

  it('o que o campo vazio ou texto devolve também não abate', () => {
    expect(valorDoDesconto(200, 'VALOR', '')).toBe(0);
    expect(valorDoDesconto(200, '', '50')).toBe(0);
    expect(valorDoDesconto(200, 'VALOR', 'abc')).toBe(0);
  });

  it('desconto em valor nunca passa do subtotal', () => {
    expect(valorDoDesconto(200, 'VALOR', 50)).toBe(50);
    expect(valorDoDesconto(200, 'VALOR', 200)).toBe(200); // igual ao subtotal
    expect(valorDoDesconto(200, 'VALOR', 999)).toBe(200); // maior: limitado
  });

  it('desconto percentual arredonda meio para cima em duas casas e limita em 100%', () => {
    expect(valorDoDesconto(200, 'PERCENTUAL', 10)).toBe(20);
    expect(valorDoDesconto(200, 'PERCENTUAL', 100)).toBe(200);
    expect(valorDoDesconto(200, 'PERCENTUAL', 150)).toBe(200); // acima de 100% vale 100%
    // 33,33% de 100,00 = 33,33 ; 12,5% de 10,01 = 1,25125 -> 1,25 ; 0,5% de 1,00 = 0,005 -> 0,01 (meio para cima)
    expect(valorDoDesconto(100, 'PERCENTUAL', 33.33)).toBe(33.33);
    expect(valorDoDesconto(10.01, 'PERCENTUAL', 12.5)).toBe(1.25);
    expect(valorDoDesconto(1.00, 'PERCENTUAL', 0.5)).toBe(0.01);
  });

  it('desconto sem subtotal é zero', () => {
    expect(totaisDoPedido([], 'VALOR', 50).desconto).toBe(0);
    expect(totaisDoPedido([], 'PERCENTUAL', 10).desconto).toBe(0);
  });

  it('total = subtotal - desconto; desconto limitado: total nunca fica negativo', () => {
    expect(totaisDoPedido([categoria(100, 50), categoria(50, null)], 'PERCENTUAL', 10))
      .toEqual({ subtotal: 200, desconto: 20, total: 180 });
    expect(totaisDoPedido([categoria(100, null)], 'VALOR', 999).total).toBe(0);
    expect(totaisDoPedido([], null, null)).toEqual({ subtotal: 0, desconto: 0, total: 0 });
  });

  it('o total acompanha mudanças nos itens e no desconto', () => {
    expect(totaisDoPedido([categoria(100, null)], 'VALOR', 10).total).toBe(90);
    expect(totaisDoPedido([categoria(100, null), categoria(50, null)], null, null).total).toBe(150);
  });

  it('não herda o erro de ponto flutuante (0,1 + 0,2)', () => {
    expect(totaisDoPedido([categoria(0.1, 0.2)], null, null).subtotal).toBe(0.3);
    expect(totaisDoPedido([categoria(0.1, 0.2)], 'VALOR', 0.1).total).toBe(0.2);
  });
});
