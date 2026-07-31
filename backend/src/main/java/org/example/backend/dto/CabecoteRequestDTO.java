package org.example.backend.dto;

public class CabecoteRequestDTO {
    public String categoria; // nome do enum, ex.: "CABECOTE" — se ausente/inválido, vira CABECOTE
    public String nome;
    public String movelFaixa; // valor único ("25,10") ou faixa ("25,045-27,070")
    public String fixoFaixa;
}
