package org.example.backend.dto;

import java.util.List;

/** Estatísticas da tela Início. */
public class DashboardDTO {
    public int abertos;
    public int hoje;
    public int prontos;
    public int atrasados;
    public List<PedidoResumoDTO> entregasHoje;
}
