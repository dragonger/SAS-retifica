package org.example.backend.dto;

import java.math.BigDecimal;

/** Um item de um agrupamento por valor (ex.: total por cliente ou por serviço). */
public class AgregadoValorDTO {
    public String descricao;   // nome do cliente OU descrição do serviço
    public BigDecimal total;
}
