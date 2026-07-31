package org.example.backend.dto;

import java.math.BigDecimal;

/**
 * Linha de serviço/peça enviada ao criar ou editar um pedido. A página web
 * resolve o valor a partir do catálogo no momento em que o item é adicionado
 * (igual ao app desktop) — assim, editar um pedido não muda retroativamente
 * o preço de itens já lançados, mesmo que o catálogo mude depois.
 */
public class ItemRequestDTO {
    public String descricao;
    public BigDecimal valorUnitario;
    public Integer quantidade;
}
