package org.example.backend.dto;

import java.math.BigDecimal;

/** Linha de serviço ou peça dentro de um pedido (resposta). */
public class ItemDTO {
    public Long id;
    public String descricao;
    public Integer quantidade;
    public BigDecimal valorUnitario;
    public BigDecimal valorTotal;
}
