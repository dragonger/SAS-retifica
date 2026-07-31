package org.example.backend.dto;

/** Usado tanto para listar/detalhar (com id) quanto como corpo de criação/edição. */
public class ClienteDTO {
    public Long id;
    public String nome;
    public String telefone;
    public String rua;
    public String numero;
    public String bairro;
    public String cep;
    public String municipio;
    public String uf;
}
