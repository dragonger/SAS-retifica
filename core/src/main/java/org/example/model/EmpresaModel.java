package org.example.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "EMPRESA")
public class EmpresaModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String nome;
    private LocalDateTime criadaEm;

    public EmpresaModel() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public LocalDateTime getCriadaEm() {
        return criadaEm;
    }

    public void setCriadaEm(LocalDateTime criadaEm) {
        this.criadaEm = criadaEm;
    }

    @Override
    public String toString() {
        return nome != null ? nome : "";
    }
}
