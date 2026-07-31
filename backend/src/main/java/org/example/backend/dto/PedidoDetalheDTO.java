package org.example.backend.dto;

import java.math.BigDecimal;
import java.util.List;

public class PedidoDetalheDTO {
    public Long id;
    public String pedidoDescricao;
    public String observacao;
    public String datCriacao;         // dd/MM/yyyy HH:mm
    public String datEntregaEstimada; // yyyy-MM-dd (formato de <input type=date>)
    public String datEntrega;         // dd/MM/yyyy HH:mm, ou null se em aberto
    public boolean finalizado;
    public boolean atrasado;
    public String status;             // "ABERTO" | "EM_ANDAMENTO" | "PRONTO"
    public String situacao;           // "Aberto" | "Em andamento" | "Pronto" | "Atrasado" | "Finalizado"
    public BigDecimal totalGeral;

    public List<CabecoteDTO> componentes; // cabeçote(s)/bloco(s)/biela(s)/virabrequim(ns) vinculados
    public List<String> categorias;   // nomes do enum CategoriaProduto

    public ClienteDTO cliente;

    public List<ItemDTO> servicos;
    public List<ItemDTO> pecas;
}
