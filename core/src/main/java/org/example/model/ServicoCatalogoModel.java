package org.example.model;

import jakarta.persistence.*;
import java.math.BigDecimal;

/**
 * Catálogo de serviços (nome + valor) reutilizados na criação de pedidos,
 * organizados por componente do motor ({@link CategoriaProduto}).
 */
@Entity
@Table(name = "SERVICO_CATALOGO")
public class ServicoCatalogoModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String nome;

    @Enumerated(EnumType.STRING)
    private CategoriaProduto categoria = CategoriaProduto.OUTRO;

    @Column(precision = 19, scale = 2)
    private BigDecimal valor;

    public ServicoCatalogoModel() {
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

    public CategoriaProduto getCategoria() {
        return categoria;
    }

    public void setCategoria(CategoriaProduto categoria) {
        this.categoria = categoria != null ? categoria : CategoriaProduto.OUTRO;
    }

    public BigDecimal getValor() {
        return valor;
    }

    public void setValor(BigDecimal valor) {
        this.valor = valor;
    }

    @Override
    public String toString() {
        String base = "[" + categoria.getRotulo() + "] " + (nome != null ? nome : "");
        if (valor != null) {
            return base + " (R$ " + valor.toPlainString().replace('.', ',') + ")";
        }
        return base;
    }
}
