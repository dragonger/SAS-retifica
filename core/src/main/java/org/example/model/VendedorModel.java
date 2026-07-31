package org.example.model;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "VENDEDOR")
public class VendedorModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String nome;

    @OneToMany(mappedBy = "vendedor")
    private List<PedidoModel> pedidoList = new ArrayList<>();

    public VendedorModel() {
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

    public List<PedidoModel> getPedidoList() {
        return pedidoList;
    }

    public void setPedidoList(List<PedidoModel> pedidoList) {
        this.pedidoList = pedidoList;
    }
}
