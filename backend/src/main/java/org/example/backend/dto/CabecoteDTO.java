package org.example.backend.dto;

public class CabecoteDTO {
    public Long id;
    public String categoria;       // nome do enum, ex.: "CABECOTE"
    public String categoriaRotulo; // rótulo amigável, ex.: "Cabeçote"
    public String nome;
    public String movelFaixa; // ex.: "25,045-27,070"
    public String fixoFaixa;
}
