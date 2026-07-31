package org.example.backend.dto;

import java.math.BigDecimal;

/** Linha da lista de pedidos (tela principal / encerrados). */
public class PedidoResumoDTO {
    public Long id;
    public String clienteNome;
    public String componentesResumo; // nomes dos componentes vinculados, separados por vírgula
    public String dataEntrega;      // dd/MM/yyyy — real se finalizado, senão estimada
    public boolean finalizado;
    public boolean atrasado;
    public String status;           // "ABERTO" | "EM_ANDAMENTO" | "PRONTO"
    public String situacao;         // "Aberto" | "Em andamento" | "Pronto" | "Atrasado" | "Finalizado"
    public BigDecimal totalGeral;
}
