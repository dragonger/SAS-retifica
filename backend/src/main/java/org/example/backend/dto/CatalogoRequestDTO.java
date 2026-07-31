package org.example.backend.dto;

import java.math.BigDecimal;

public class CatalogoRequestDTO {
    public String categoria; // nome do enum, ex.: "CABECOTE" — se ausente/ inválido, vira OUTRO
    public String nome;
    public BigDecimal valor;
}
