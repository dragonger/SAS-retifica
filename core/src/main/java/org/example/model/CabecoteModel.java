package org.example.model;

import jakarta.persistence.*;
import java.math.BigDecimal;

/**
 * Catálogo de referências técnicas (cabeçote, bloco, biela ou virabrequim)
 * reutilizadas na criação de pedidos. As medidas de eixo (móvel e fixo) são
 * guardadas como faixa (mínimo e máximo), já que normalmente são
 * especificadas como tolerância (ex.: 29,990–30,015 mm).
 */
@Entity
@Table(name = "CABECOTE")
public class CabecoteModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String nome;

    @Enumerated(EnumType.STRING)
    private CategoriaProduto categoria = CategoriaProduto.CABECOTE;

    @Column(precision = 10, scale = 3)
    private BigDecimal movelMin;
    @Column(precision = 10, scale = 3)
    private BigDecimal movelMax;

    @Column(precision = 10, scale = 3)
    private BigDecimal fixoMin;
    @Column(precision = 10, scale = 3)
    private BigDecimal fixoMax;

    /** Empresa (tenant) dona deste item de catálogo. */
    @ManyToOne
    private EmpresaModel empresa;

    public CabecoteModel() {
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
        // Defensivo: linhas gravadas antes deste campo existir podem ter
        // categoria nula no banco (a coluna nova não é retroativamente
        // preenchida por hbm2ddl.auto=update).
        return categoria != null ? categoria : CategoriaProduto.CABECOTE;
    }

    public void setCategoria(CategoriaProduto categoria) {
        this.categoria = categoria != null ? categoria : CategoriaProduto.CABECOTE;
    }

    public BigDecimal getMovelMin() {
        return movelMin;
    }

    public void setMovelMin(BigDecimal movelMin) {
        this.movelMin = movelMin;
    }

    public BigDecimal getMovelMax() {
        return movelMax;
    }

    public void setMovelMax(BigDecimal movelMax) {
        this.movelMax = movelMax;
    }

    public BigDecimal getFixoMin() {
        return fixoMin;
    }

    public void setFixoMin(BigDecimal fixoMin) {
        this.fixoMin = fixoMin;
    }

    public BigDecimal getFixoMax() {
        return fixoMax;
    }

    public void setFixoMax(BigDecimal fixoMax) {
        this.fixoMax = fixoMax;
    }

    public EmpresaModel getEmpresa() {
        return empresa;
    }

    public void setEmpresa(EmpresaModel empresa) {
        this.empresa = empresa;
    }

    /**
     * Define a faixa do eixo móvel a partir de um texto: aceita um valor único
     * ("25,10") ou uma faixa ("25,045-27,070"). Lança {@link NumberFormatException}
     * se o texto não for numérico.
     */
    public void setMovelFaixa(String texto) {
        BigDecimal[] faixa = parseFaixa(texto);
        this.movelMin = faixa != null ? faixa[0] : null;
        this.movelMax = faixa != null ? faixa[1] : null;
    }

    public void setFixoFaixa(String texto) {
        BigDecimal[] faixa = parseFaixa(texto);
        this.fixoMin = faixa != null ? faixa[0] : null;
        this.fixoMax = faixa != null ? faixa[1] : null;
    }

    @Transient
    public String getMovelFaixa() {
        return faixaTexto(movelMin, movelMax);
    }

    @Transient
    public String getFixoFaixa() {
        return faixaTexto(fixoMin, fixoMax);
    }

    @Override
    public String toString() {
        String base = "[" + categoria.getRotulo() + "] " + (nome != null ? nome : "");
        String mov = getMovelFaixa();
        String fix = getFixoFaixa();
        if (!mov.isEmpty() || !fix.isEmpty()) {
            return base + " (móvel " + (mov.isEmpty() ? "-" : mov)
                    + " / fixo " + (fix.isEmpty() ? "-" : fix) + ")";
        }
        return base;
    }

    /** Converte "25,10" ou "25,045-27,070" em [min, max]; retorna null se vazio. */
    private static BigDecimal[] parseFaixa(String texto) {
        if (texto == null) {
            return null;
        }
        String t = texto.trim();
        if (t.isEmpty()) {
            return null;
        }
        String[] partes = t.split("\\s*[-–—]\\s*");
        BigDecimal min = new BigDecimal(partes[0].trim().replace(",", "."));
        BigDecimal max = partes.length > 1 ? new BigDecimal(partes[1].trim().replace(",", ".")) : min;
        return new BigDecimal[]{min, max};
    }

    private static String faixaTexto(BigDecimal min, BigDecimal max) {
        if (min == null && max == null) {
            return "";
        }
        if (min != null && min.compareTo(max) == 0) {
            return num(min);
        }
        return num(min) + "–" + num(max);
    }

    private static String num(BigDecimal valor) {
        return valor != null ? valor.toPlainString().replace('.', ',') : "-";
    }
}
