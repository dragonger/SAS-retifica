package org.example.service;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.example.model.PecaModel;
import org.example.model.PedidoModel;
import org.example.model.ServicoModel;

import java.awt.Color;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Gera um PDF de um pedido (dados do cliente, serviços, peças e total).
 */
public class PedidoPdfService {

    private static final Font FONTE_TITULO = FontFactory.getFont(FontFactory.HELVETICA, 18, Font.BOLD);
    private static final Font FONTE_SECAO = FontFactory.getFont(FontFactory.HELVETICA, 13, Font.BOLD);
    private static final Font FONTE_NORMAL = FontFactory.getFont(FontFactory.HELVETICA, 11);
    private static final Font FONTE_TOTAL = FontFactory.getFont(FontFactory.HELVETICA, 13, Font.BOLD);
    private static final Font FONTE_TH = FontFactory.getFont(FontFactory.HELVETICA, 11, Font.BOLD, Color.WHITE);

    private static final Color COR_CABECALHO = new Color(60, 60, 60);

    /**
     * Gera o PDF do pedido no arquivo informado.
     *
     * @throws RuntimeException se ocorrer erro de escrita
     */
    public void gerar(PedidoModel pedido, File destino) {
        try (OutputStream saida = new FileOutputStream(destino)) {
            gerar(pedido, saida);
        } catch (java.io.IOException e) {
            throw new RuntimeException("Falha ao gerar o PDF: " + e.getMessage(), e);
        }
    }

    /**
     * Gera o PDF do pedido escrevendo no stream informado (não fecha o stream).
     * Usado pelo backend para enviar o PDF direto na resposta HTTP.
     *
     * @throws RuntimeException se ocorrer erro de escrita
     */
    public void gerar(PedidoModel pedido, OutputStream saida) {
        Document documento = new Document(PageSize.A4, 40, 40, 40, 40);
        try {
            PdfWriter.getInstance(documento, saida);
            documento.open();

            documento.add(new Paragraph("Orçamento #" + (pedido.getId() != null ? pedido.getId() : ""), FONTE_TITULO));
            documento.add(Chunk.NEWLINE);

            adicionarDados(documento, pedido);
            documento.add(Chunk.NEWLINE);

            if (!pedido.getServicoList().isEmpty()) {
                adicionarTabela(documento, "Serviços", linhasServicos(pedido.getServicoList()));
                documento.add(Chunk.NEWLINE);
            }
            if (!pedido.getPecaList().isEmpty()) {
                adicionarTabela(documento, "Peças", linhasPecas(pedido.getPecaList()));
                documento.add(Chunk.NEWLINE);
            }

            Paragraph total = new Paragraph("Total geral: " + moeda(totalGeral(pedido)), FONTE_TOTAL);
            total.setAlignment(Element.ALIGN_RIGHT);
            documento.add(total);

            documento.close();
        } catch (DocumentException e) {
            throw new RuntimeException("Falha ao gerar o PDF: " + e.getMessage(), e);
        }
    }

    private void adicionarDados(Document documento, PedidoModel pedido) throws DocumentException {
        String componentes = !pedido.getComponentes().isEmpty()
                ? pedido.getComponentes().stream().map(Object::toString).collect(Collectors.joining("; "))
                : valor(pedido.getPedido());
        documento.add(paragrafo("Componentes: " + componentes));
        if (pedido.getPedido() != null && !pedido.getPedido().trim().isEmpty()) {
            documento.add(paragrafo("Descrição: " + pedido.getPedido()));
        }
        if (pedido.getObservacao() != null) {
            documento.add(paragrafo("Observação: " + pedido.getObservacao()));
        }

        if (pedido.getCliente() != null) {
            documento.add(new Paragraph("Cliente", FONTE_SECAO));
            documento.add(paragrafo("Nome: " + valor(pedido.getCliente().getNome())));
            documento.add(paragrafo("Telefone: " + valor(pedido.getCliente().getTelefone())));
            documento.add(paragrafo("Endereço: " + endereco(pedido)));
        }
    }

    private String endereco(PedidoModel pedido) {
        var c = pedido.getCliente();
        List<String> partes = new ArrayList<>();
        adicionaSePresente(partes, c.getRua());
        adicionaSePresente(partes, c.getNumero());
        adicionaSePresente(partes, c.getBairro());
        adicionaSePresente(partes, c.getMunicipio());
        adicionaSePresente(partes, c.getUf());
        adicionaSePresente(partes, c.getCep());
        return partes.isEmpty() ? "-" : String.join(", ", partes);
    }

    private void adicionaSePresente(List<String> partes, String texto) {
        if (texto != null && !texto.trim().isEmpty()) {
            partes.add(texto.trim());
        }
    }

    private List<String[]> linhasServicos(List<ServicoModel> servicos) {
        List<String[]> linhas = new ArrayList<>();
        for (ServicoModel s : servicos) {
            linhas.add(new String[]{
                    valor(s.getDescricao()),
                    s.getQuantidade() != null ? s.getQuantidade().toString() : "-",
                    moeda(s.getValorUnitario()),
                    moeda(s.getValorTotal())
            });
        }
        return linhas;
    }

    private List<String[]> linhasPecas(List<PecaModel> pecas) {
        List<String[]> linhas = new ArrayList<>();
        for (PecaModel p : pecas) {
            linhas.add(new String[]{
                    valor(p.getDescricao()),
                    p.getQuantidade() != null ? p.getQuantidade().toString() : "-",
                    moeda(p.getValorUnitario()),
                    moeda(p.getValorTotal())
            });
        }
        return linhas;
    }

    private void adicionarTabela(Document documento, String titulo, List<String[]> linhas) throws DocumentException {
        documento.add(new Paragraph(titulo, FONTE_SECAO));

        PdfPTable tabela = new PdfPTable(new float[]{5f, 1.5f, 2f, 2f});
        tabela.setWidthPercentage(100);
        tabela.setSpacingBefore(5f);

        for (String cabecalho : new String[]{"Descrição", "Qtd", "Valor unit.", "Total"}) {
            PdfPCell cell = new PdfPCell(new Phrase(cabecalho, FONTE_TH));
            cell.setBackgroundColor(COR_CABECALHO);
            cell.setPadding(5f);
            tabela.addCell(cell);
        }

        for (String[] linha : linhas) {
            tabela.addCell(celula(linha[0], Element.ALIGN_LEFT));
            tabela.addCell(celula(linha[1], Element.ALIGN_CENTER));
            tabela.addCell(celula(linha[2], Element.ALIGN_RIGHT));
            tabela.addCell(celula(linha[3], Element.ALIGN_RIGHT));
        }

        documento.add(tabela);
    }

    private PdfPCell celula(String texto, int alinhamento) {
        PdfPCell cell = new PdfPCell(new Phrase(texto, FONTE_NORMAL));
        cell.setHorizontalAlignment(alinhamento);
        cell.setPadding(4f);
        return cell;
    }

    private Paragraph paragrafo(String texto) {
        return new Paragraph(texto, FONTE_NORMAL);
    }

    private BigDecimal totalGeral(PedidoModel pedido) {
        BigDecimal total = BigDecimal.ZERO;
        for (ServicoModel s : pedido.getServicoList()) {
            total = total.add(s.getValorTotal());
        }
        for (PecaModel p : pedido.getPecaList()) {
            total = total.add(p.getValorTotal());
        }
        return total;
    }

    private String valor(String texto) {
        return (texto == null || texto.trim().isEmpty()) ? "-" : texto;
    }

    private String moeda(BigDecimal valor) {
        BigDecimal v = valor != null ? valor : BigDecimal.ZERO;
        return "R$ " + v.setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }
}
