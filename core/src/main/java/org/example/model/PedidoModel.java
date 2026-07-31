package org.example.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "PEDIDO")
public class PedidoModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String pedido;
    private String observacao;

    @Column(precision = 19, scale = 2)
    private BigDecimal valor;

    @Column(precision = 19, scale = 2)
    private BigDecimal totalGeral;

    /** Data/hora em que o pedido foi criado (preenchida automaticamente). */
    private LocalDateTime datCriacao;
    private LocalDateTime datOrcamento;
    /** Data de entrega estimada (definida pelo usuário). */
    private LocalDate datEntregaEstimada;
    /** Data/hora da entrega real — só é preenchida quando o pedido é finalizado. */
    private LocalDateTime datEntrega;

    /** Andamento manual enquanto o pedido não é finalizado (Aberto/Em andamento/Pronto). */
    @Enumerated(EnumType.STRING)
    private StatusPedido status = StatusPedido.ABERTO;

    @ManyToOne
    @JoinColumn(name = "vendedor_id")
    private VendedorModel vendedor;

    /** Componentes técnicos envolvidos (cabeçote, bloco, biela, virabrequim) — um pedido pode ter mais de um. */
    @ManyToMany
    @JoinTable(name = "PEDIDO_COMPONENTE",
            joinColumns = @JoinColumn(name = "pedido_id"),
            inverseJoinColumns = @JoinColumn(name = "cabecote_id"))
    private List<CabecoteModel> componentes = new ArrayList<>();

    @OneToMany(mappedBy = "pedido", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ServicoModel> servicoList = new ArrayList<>();

    @OneToMany(mappedBy = "pedido", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PecaModel> pecaList = new ArrayList<>();

    /**
     * Cliente do pedido — cadastro reutilizável (um cliente pode ter vários
     * pedidos). Cascade só de PERSIST/MERGE (sem REMOVE): salvar o pedido não
     * apaga o cliente ao excluir o pedido, e permite tanto referenciar um
     * cliente já existente quanto salvar um novo inline.
     */
    @ManyToOne(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
    @JoinColumn(name = "cliente_id")
    private ClienteModel cliente;

    /** Categorias/componentes do motor envolvidos neste pedido (Cabeçote, Bloco, etc.). */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "PEDIDO_CATEGORIA", joinColumns = @JoinColumn(name = "pedido_id"))
    @Column(name = "categoria")
    @Enumerated(EnumType.STRING)
    private Set<CategoriaProduto> categorias = new HashSet<>();

    public PedidoModel() {
    }

    /**
     * Adiciona um serviço mantendo os dois lados do relacionamento sincronizados.
     */
    public void addServico(ServicoModel servico) {
        servicoList.add(servico);
        servico.setPedido(this);
    }

    /**
     * Adiciona uma peça mantendo os dois lados do relacionamento sincronizados.
     */
    public void addPeca(PecaModel peca) {
        pecaList.add(peca);
        peca.setPedido(this);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPedido() {
        return pedido;
    }

    public void setPedido(String pedido) {
        this.pedido = pedido;
    }

    public String getObservacao() {
        return observacao;
    }

    public void setObservacao(String observacao) {
        this.observacao = observacao;
    }

    public BigDecimal getValor() {
        return valor;
    }

    public void setValor(BigDecimal valor) {
        this.valor = valor;
    }

    public BigDecimal getTotalGeral() {
        return totalGeral;
    }

    public void setTotalGeral(BigDecimal totalGeral) {
        this.totalGeral = totalGeral;
    }

    public LocalDateTime getDatCriacao() {
        return datCriacao;
    }

    public void setDatCriacao(LocalDateTime datCriacao) {
        this.datCriacao = datCriacao;
    }

    public LocalDateTime getDatOrcamento() {
        return datOrcamento;
    }

    public void setDatOrcamento(LocalDateTime datOrcamento) {
        this.datOrcamento = datOrcamento;
    }

    public LocalDate getDatEntregaEstimada() {
        return datEntregaEstimada;
    }

    public void setDatEntregaEstimada(LocalDate datEntregaEstimada) {
        this.datEntregaEstimada = datEntregaEstimada;
    }

    public LocalDateTime getDatEntrega() {
        return datEntrega;
    }

    public void setDatEntrega(LocalDateTime datEntrega) {
        this.datEntrega = datEntrega;
    }

    /** Indica se o pedido já foi finalizado (entregue). */
    @Transient
    public boolean isFinalizado() {
        return datEntrega != null;
    }

    public StatusPedido getStatus() {
        return status;
    }

    public void setStatus(StatusPedido status) {
        this.status = status != null ? status : StatusPedido.ABERTO;
    }

    public VendedorModel getVendedor() {
        return vendedor;
    }

    public void setVendedor(VendedorModel vendedor) {
        this.vendedor = vendedor;
    }

    public List<CabecoteModel> getComponentes() {
        return componentes;
    }

    public void setComponentes(List<CabecoteModel> componentes) {
        this.componentes = componentes != null ? componentes : new ArrayList<>();
    }

    public List<ServicoModel> getServicoList() {
        return servicoList;
    }

    public void setServicoList(List<ServicoModel> servicoList) {
        this.servicoList = servicoList;
    }

    public List<PecaModel> getPecaList() {
        return pecaList;
    }

    public void setPecaList(List<PecaModel> pecaList) {
        this.pecaList = pecaList;
    }

    public ClienteModel getCliente() {
        return cliente;
    }

    public void setCliente(ClienteModel cliente) {
        this.cliente = cliente;
    }

    public Set<CategoriaProduto> getCategorias() {
        return categorias;
    }

    public void setCategorias(Set<CategoriaProduto> categorias) {
        this.categorias = categorias != null ? categorias : new HashSet<>();
    }
}
