package org.example.model;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "SERVICO")
public class ServicoModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String descricao;
    private Integer quantidade;

    @Column(precision = 19, scale = 2)
    private BigDecimal valorUnitario;

    @ManyToOne
    @JoinColumn(name = "pedido_id")
    private PedidoModel pedido;

    public ServicoModel() {
    }

    /**
     * Valor total do serviço (valor unitário x quantidade). Não é persistido.
     */
    @Transient
    public BigDecimal getValorTotal() {
        if (valorUnitario == null || quantidade == null) {
            return BigDecimal.ZERO;
        }
        return valorUnitario.multiply(BigDecimal.valueOf(quantidade));
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getDescricao() {
        return descricao;
    }

    public void setDescricao(String descricao) {
        this.descricao = descricao;
    }

    public Integer getQuantidade() {
        return quantidade;
    }

    public void setQuantidade(Integer quantidade) {
        this.quantidade = quantidade;
    }

    public BigDecimal getValorUnitario() {
        return valorUnitario;
    }

    public void setValorUnitario(BigDecimal valorUnitario) {
        this.valorUnitario = valorUnitario;
    }

    public PedidoModel getPedido() {
        return pedido;
    }

    public void setPedido(PedidoModel pedido) {
        this.pedido = pedido;
    }
}
