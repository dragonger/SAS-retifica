package org.example.model;

/**
 * Andamento manual de um pedido ainda não finalizado (entregue).
 * "Atrasado" não é um valor aqui — é calculado a partir da data de entrega
 * estimada; "Finalizado" também não — é dado por {@link PedidoModel#isFinalizado()}.
 */
public enum StatusPedido {
    ABERTO("Aberto"),
    EM_ANDAMENTO("Em andamento"),
    PRONTO("Pronto");

    private final String rotulo;

    StatusPedido(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    @Override
    public String toString() {
        return rotulo;
    }
}
