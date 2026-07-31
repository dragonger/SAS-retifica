package org.example.backend.dto;

import java.math.BigDecimal;
import java.util.List;

/** Um grupo de pedidos encerrados de um mesmo mês. */
public class MesEncerradosDTO {
    public String mes;      // ex.: "Julho de 2026"
    public int quantidade;
    public BigDecimal total;
    public List<PedidoResumoDTO> pedidos;
    public List<AgregadoValorDTO> porCliente;
    public List<AgregadoValorDTO> porServico;
}
