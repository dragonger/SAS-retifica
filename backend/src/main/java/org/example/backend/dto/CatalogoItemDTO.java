package org.example.backend.dto;

import java.math.BigDecimal;

/** Item de catálogo (serviço ou peça): categoria + nome + valor. */
public class CatalogoItemDTO {
    public Long id;
    public String categoria;       // nome do enum, ex.: "CABECOTE"
    public String categoriaRotulo; // rótulo amigável, ex.: "Cabeçote"
    public String nome;
    public BigDecimal valor;
}
