package org.example.model;

/**
 * Componente do motor ao qual um serviço ou peça do catálogo pertence,
 * usado para organizar o orçamento (Cabeçote, Bloco, Biela, Virabrequim, Montagem).
 */
public enum CategoriaProduto {
    CABECOTE("Cabeçote"),
    BLOCO("Bloco"),
    BIELA("Biela"),
    VIRABREQUIM("Virabrequim"),
    MONTAGEM("Montagem"),
    OUTRO("Outro");

    private final String rotulo;

    CategoriaProduto(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    @Override
    public String toString() {
        return rotulo;
    }
}
