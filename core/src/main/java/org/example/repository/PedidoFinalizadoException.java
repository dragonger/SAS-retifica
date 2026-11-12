package org.example.repository;

/**
 * Tentativa de editar um pedido já finalizado. Pedido finalizado é registro de entrega e
 * faturamento (entra em Encerrados e no Dashboard); por isso o servidor recusa a edição,
 * e não só a tela.
 */
public class PedidoFinalizadoException extends RuntimeException {

    public PedidoFinalizadoException(Long pedidoId) {
        super("Pedido " + pedidoId + " está finalizado e não pode ser editado.");
    }
}
