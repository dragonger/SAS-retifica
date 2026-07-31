package org.example.backend.dto;

import java.util.List;

/** Corpo de criação/edição de pedido, enviado pela página web. */
public class PedidoRequestDTO {
    public List<Long> componenteIds;  // cabeçote(s)/bloco(s)/biela(s)/virabrequim(ns) — pode ter mais de um
    public Long clienteId;            // cliente já cadastrado (obrigatório)
    public List<String> categorias;   // nomes do enum CategoriaProduto, ex.: ["CABECOTE","BLOCO"]
    public String status;             // "ABERTO" | "EM_ANDAMENTO" | "PRONTO" — default ABERTO se ausente
    public String pedidoDescricao;
    public String observacao;
    public String datEntregaEstimada; // yyyy-MM-dd
    public List<ItemRequestDTO> servicos;
    public List<ItemRequestDTO> pecas;
}
