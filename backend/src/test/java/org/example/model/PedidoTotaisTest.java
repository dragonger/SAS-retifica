package org.example.model;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Total e desconto do pedido: e o valor que o cliente paga, gravado em totalGeral.
 * Unitario puro (sem banco, sem Spring).
 */
class PedidoTotaisTest {

    private static PedidoCategoriaModel categoria(String servicos, String pecas) {
        PedidoCategoriaModel c = new PedidoCategoriaModel();
        c.setCategoria(CategoriaProduto.CABECOTE);
        c.setValorServicos(servicos == null ? null : new BigDecimal(servicos));
        c.setValorPecas(pecas == null ? null : new BigDecimal(pecas));
        return c;
    }

    private static PedidoModel pedido(TipoDesconto tipo, String desconto, PedidoCategoriaModel... categorias) {
        PedidoModel p = new PedidoModel();
        for (PedidoCategoriaModel c : categorias) {
            p.getCategoriaValores().add(c);
        }
        p.setDescontoTipo(tipo);
        p.setDescontoValor(desconto == null ? null : new BigDecimal(desconto));
        return p;
    }

    // ---------------------------------------------------- PedidoCategoriaModel

    @Test
    void valorTotalDaCategoriaSomaServicosEPecasIgnorandoNulos() {
        assertThat(categoria("100.50", "20.25").getValorTotal()).isEqualByComparingTo("120.75");
        assertThat(categoria("100", null).getValorTotal()).isEqualByComparingTo("100");
        assertThat(categoria(null, "40").getValorTotal()).isEqualByComparingTo("40");
        assertThat(categoria(null, null).getValorTotal()).isEqualByComparingTo("0");
    }

    // -------------------------------------------------------------- subtotal

    @Test
    void subtotalSomaTodasAsCategoriasEFicaZeroSemNenhuma() {
        assertThat(pedido(null, null).getSubtotal()).isEqualByComparingTo("0");
        assertThat(pedido(null, null, categoria("100", "50"), categoria("30", null), categoria(null, null))
                .getSubtotal()).isEqualByComparingTo("180");
    }

    // ------------------------------------------------------------- desconto

    @Test
    void semDescontoOuComDescontoInvalidoNaoAbate() {
        PedidoCategoriaModel c = categoria("200", null);
        assertThat(pedido(null, null, c).getValorDesconto()).isEqualByComparingTo("0");
        assertThat(pedido(TipoDesconto.VALOR, null, c).getValorDesconto()).as("valor ausente").isEqualByComparingTo("0");
        assertThat(pedido(null, "50", c).getValorDesconto()).as("tipo ausente").isEqualByComparingTo("0");
        assertThat(pedido(TipoDesconto.VALOR, "0", c).getValorDesconto()).isEqualByComparingTo("0");
        assertThat(pedido(TipoDesconto.VALOR, "-30", c).getValorDesconto()).as("negativo").isEqualByComparingTo("0");
        assertThat(pedido(TipoDesconto.PERCENTUAL, "-10", c).getValorDesconto()).isEqualByComparingTo("0");
    }

    @Test
    void descontoEmValorNuncaPassaDoSubtotal() {
        PedidoCategoriaModel c = categoria("200", null);
        assertThat(pedido(TipoDesconto.VALOR, "50", c).getValorDesconto()).isEqualByComparingTo("50");
        assertThat(pedido(TipoDesconto.VALOR, "200", c).getValorDesconto()).as("igual ao subtotal").isEqualByComparingTo("200");
        assertThat(pedido(TipoDesconto.VALOR, "999", c).getValorDesconto()).as("maior: limitado").isEqualByComparingTo("200");
    }

    @Test
    void descontoPercentualArredondaMeioParaCimaEmDuasCasasELimitaEm100() {
        PedidoCategoriaModel c = categoria("200", null);
        assertThat(pedido(TipoDesconto.PERCENTUAL, "10", c).getValorDesconto()).isEqualByComparingTo("20.00");
        assertThat(pedido(TipoDesconto.PERCENTUAL, "100", c).getValorDesconto()).isEqualByComparingTo("200");
        assertThat(pedido(TipoDesconto.PERCENTUAL, "150", c).getValorDesconto()).as("acima de 100% vale 100%").isEqualByComparingTo("200");
        // 33,33% de 100,00 = 33,33 ; 12,5% de 10,01 = 1,25125 -> 1,25 ; 0,5% de 1,00 = 0,005 -> 0,01 (meio para cima)
        assertThat(pedido(TipoDesconto.PERCENTUAL, "33.33", categoria("100", null)).getValorDesconto()).isEqualByComparingTo("33.33");
        assertThat(pedido(TipoDesconto.PERCENTUAL, "12.5", categoria("10.01", null)).getValorDesconto()).isEqualByComparingTo("1.25");
        assertThat(pedido(TipoDesconto.PERCENTUAL, "0.5", categoria("1.00", null)).getValorDesconto()).isEqualByComparingTo("0.01");
    }

    @Test
    void descontoSemSubtotalEZero() {
        assertThat(pedido(TipoDesconto.VALOR, "50").getValorDesconto()).isEqualByComparingTo("0");
        assertThat(pedido(TipoDesconto.PERCENTUAL, "10").getValorDesconto()).isEqualByComparingTo("0");
    }

    // ------------------------------------------------------------ totalGeral

    @Test
    void recalcularTotalGravaSubtotalMenosDesconto() {
        PedidoModel p = pedido(TipoDesconto.PERCENTUAL, "10", categoria("100", "50"), categoria("50", null));
        p.recalcularTotal();
        assertThat(p.getTotalGeral()).isEqualByComparingTo("180");   // 200 - 20

        PedidoModel v = pedido(TipoDesconto.VALOR, "999", categoria("100", null));
        v.recalcularTotal();
        assertThat(v.getTotalGeral()).as("desconto limitado: total nunca fica negativo").isEqualByComparingTo("0");

        PedidoModel vazio = pedido(null, null);
        vazio.recalcularTotal();
        assertThat(vazio.getTotalGeral()).isEqualByComparingTo("0");
    }

    @Test
    void recalcularTotalAcompanhaMudancasNosItensEnoDesconto() {
        PedidoModel p = pedido(TipoDesconto.VALOR, "10", categoria("100", null));
        p.recalcularTotal();
        assertThat(p.getTotalGeral()).isEqualByComparingTo("90");

        p.getCategoriaValores().add(categoria("50", null));
        p.setDescontoTipo(null);
        p.recalcularTotal();
        assertThat(p.getTotalGeral()).isEqualByComparingTo("150");
    }
}
