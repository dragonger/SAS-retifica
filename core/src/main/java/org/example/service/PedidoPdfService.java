package org.example.service;

import com.lowagie.text.*;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPCellEvent;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import org.example.model.CabecoteModel;
import org.example.model.CategoriaProduto;
import org.example.model.PecaModel;
import org.example.model.PedidoModel;
import org.example.model.ServicoModel;
import org.example.model.TipoDesconto;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * Gera o PDF de orçamento de um pedido, no layout "blueprint" do design
 * system Industry usado no PWA (handoff recebido em 2026-08-01, substitui o
 * layout anterior baseado em tabela simples).
 */
public class PedidoPdfService {

    private static final int VALIDADE_DIAS = 15;
    private static final DateTimeFormatter DATA_BR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    // Paleta do design system Industry. Cores com opacidade no design original
    // (divisores, textos cinza) foram pré-misturadas com o fundo (#f2f2f3),
    // já que o PDF não usa transparência real — o resultado visual é o mesmo.
    private static final Color COR_FUNDO = new Color(0xf2, 0xf2, 0xf3);
    private static final Color COR_TEXTO = new Color(0x1d, 0x1f, 0x20);
    private static final Color COR_ACCENT = new Color(0x59, 0x80, 0xa6);
    private static final Color COR_ACCENT_700 = new Color(0x41, 0x61, 0x80);
    private static final Color COR_DIVIDER = new Color(0xd0, 0xd0, 0xd1);      // texto a 16% sobre o fundo
    private static final Color COR_ROW_DIVIDER = new Color(0xe1, 0xe1, 0xe2); // texto a 8% sobre o fundo
    private static final Color COR_TEXTO_55 = new Color(0x7d, 0x7e, 0x7f);    // texto a 55% sobre o fundo
    private static final Color COR_TEXTO_60 = new Color(0x72, 0x73, 0x74);    // texto a 60% sobre o fundo

    private static final float INSET_MOLDURA = 12f;

    private static final Font FONTE_EMPRESA;
    private static final Font FONTE_SUBTITULO_EMPRESA;
    private static final Font FONTE_TITULO_ORCAMENTO;
    private static final Font FONTE_NUMERO;
    private static final Font FONTE_EMITIDO;
    private static final Font FONTE_VALIDO;
    private static final Font FONTE_KICKER;
    private static final Font FONTE_ROW_LABEL;
    private static final Font FONTE_ROW_VALUE;
    private static final Font FONTE_SECAO;
    private static final Font FONTE_TH;
    private static final Font FONTE_TD;
    private static final Font FONTE_TD_CINZA;
    private static final Font FONTE_SUBTOTAL_LABEL;
    private static final Font FONTE_SUBTOTAL_VALOR;
    private static final Font FONTE_TOTAIS_LABEL;
    private static final Font FONTE_TOTAIS_VALOR;
    private static final Font FONTE_TOTAL_LABEL;
    private static final Font FONTE_TOTAL_VALOR;
    private static final Font FONTE_RODAPE;
    private static final byte[] LOGO_EMPRESA_BYTES;

    static {
        BaseFont barlow = carregarFonte("Barlow-Regular.ttf");
        BaseFont barlowMedium = carregarFonte("Barlow-Medium.ttf");
        BaseFont barlowCondensedSemiBold = carregarFonte("BarlowCondensed-SemiBold.ttf");

        FONTE_EMPRESA = new Font(barlowCondensedSemiBold, 26, Font.NORMAL, COR_TEXTO);
        FONTE_SUBTITULO_EMPRESA = new Font(barlow, 9.5f, Font.NORMAL, COR_ACCENT_700);
        FONTE_TITULO_ORCAMENTO = new Font(barlowCondensedSemiBold, 20, Font.NORMAL, COR_TEXTO);
        FONTE_NUMERO = new Font(barlow, 11, Font.NORMAL, COR_TEXTO);
        FONTE_EMITIDO = new Font(barlow, 9.5f, Font.NORMAL, COR_TEXTO_60);
        FONTE_VALIDO = new Font(barlowMedium, 9.5f, Font.NORMAL, COR_ACCENT_700);
        FONTE_KICKER = new Font(barlow, 8.5f, Font.NORMAL, COR_ACCENT);
        FONTE_ROW_LABEL = new Font(barlow, 10.5f, Font.NORMAL, COR_TEXTO_55);
        FONTE_ROW_VALUE = new Font(barlowMedium, 10.5f, Font.NORMAL, COR_TEXTO);
        FONTE_SECAO = new Font(barlowCondensedSemiBold, 12.5f, Font.NORMAL, COR_ACCENT_700);
        FONTE_TH = new Font(barlow, 8.5f, Font.NORMAL, COR_TEXTO_60);
        FONTE_TD = new Font(barlow, 10, Font.NORMAL, COR_TEXTO);
        FONTE_TD_CINZA = new Font(barlow, 10, Font.NORMAL, COR_TEXTO_60);
        FONTE_SUBTOTAL_LABEL = new Font(barlow, 9.5f, Font.NORMAL, COR_TEXTO_60);
        FONTE_SUBTOTAL_VALOR = new Font(barlowMedium, 9.5f, Font.NORMAL, COR_TEXTO);
        FONTE_TOTAIS_LABEL = new Font(barlow, 10.5f, Font.NORMAL, COR_TEXTO_60);
        FONTE_TOTAIS_VALOR = new Font(barlow, 10.5f, Font.NORMAL, COR_TEXTO);
        FONTE_TOTAL_LABEL = new Font(barlowCondensedSemiBold, 11, Font.NORMAL, COR_TEXTO);
        FONTE_TOTAL_VALOR = new Font(barlowCondensedSemiBold, 21, Font.NORMAL, COR_ACCENT_700);
        FONTE_RODAPE = new Font(barlow, 8.5f, Font.NORMAL, COR_TEXTO_55);
        LOGO_EMPRESA_BYTES = carregarImagem("logo-empresa.png");
    }

    private static BaseFont carregarFonte(String arquivo) {
        try (InputStream in = PedidoPdfService.class.getResourceAsStream("/fonts/" + arquivo)) {
            if (in == null) {
                throw new IllegalStateException("Fonte não encontrada no classpath: /fonts/" + arquivo);
            }
            byte[] bytes = in.readAllBytes();
            return BaseFont.createFont(arquivo, BaseFont.WINANSI, BaseFont.EMBEDDED, BaseFont.CACHED, bytes, null);
        } catch (IOException | DocumentException e) {
            throw new IllegalStateException("Falha ao carregar a fonte " + arquivo, e);
        }
    }

    /** Diferente das fontes, a logo é opcional — sem ela, cai no placeholder em branco. */
    private static byte[] carregarImagem(String arquivo) {
        try (InputStream in = PedidoPdfService.class.getResourceAsStream("/images/" + arquivo)) {
            return in != null ? in.readAllBytes() : null;
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * Gera o PDF do pedido no arquivo informado.
     *
     * @throws RuntimeException se ocorrer erro de escrita
     */
    public void gerar(PedidoModel pedido, File destino) {
        try (OutputStream saida = new FileOutputStream(destino)) {
            gerar(pedido, saida);
        } catch (IOException e) {
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
        // Margens = moldura (12pt da borda física) + padding interno (~26px/56px do design, em pt).
        Document documento = new Document(PageSize.A4, 52, 52, 30, 30);
        try {
            PdfWriter writer = PdfWriter.getInstance(documento, saida);
            writer.setPageEvent(new MolduraEPapelEvent());
            documento.open();

            documento.add(caixaCabecalho(pedido));
            documento.add(espaco(10));
            documento.add(caixaInfo(pedido));
            documento.add(espaco(12));

            if (!pedido.getServicoList().isEmpty()) {
                adicionarSecaoItens(documento, "Serviços", linhasServicos(pedido.getServicoList()),
                        "Subtotal serviços", somaServicos(pedido.getServicoList()));
                documento.add(espaco(10));
            }
            if (!pedido.getPecaList().isEmpty()) {
                adicionarSecaoItens(documento, "Peças", linhasPecas(pedido.getPecaList()),
                        "Subtotal peças", somaPecas(pedido.getPecaList()));
                documento.add(espaco(10));
            }

            documento.add(caixaTotais(pedido));
            documento.add(espaco(14));
            documento.add(rodape(pedido));

            documento.close();
        } catch (DocumentException e) {
            throw new RuntimeException("Falha ao gerar o PDF: " + e.getMessage(), e);
        }
    }

    // ---------- cabeçalho ----------

    /** Logo da empresa (se o arquivo existir no classpath) ou um quadrado vazio como placeholder. */
    private PdfPCell celulaLogo() {
        if (LOGO_EMPRESA_BYTES != null) {
            try {
                Image logo = Image.getInstance(LOGO_EMPRESA_BYTES);
                PdfPCell cell = new PdfPCell(logo, true);
                cell.setFixedHeight(58f);
                cell.setBorder(Rectangle.NO_BORDER);
                cell.setPadding(0);
                return cell;
            } catch (IOException | BadElementException e) {
                // cai no placeholder abaixo
            }
        }
        PdfPCell cell = new PdfPCell(new Phrase(" "));
        cell.setFixedHeight(58f);
        cell.setBorderColor(COR_DIVIDER);
        cell.setBorderWidth(0.75f);
        return cell;
    }

    private PdfPTable caixaCabecalho(PedidoModel pedido) {
        PdfPTable conteudo = new PdfPTable(new float[]{1f, 1f});
        conteudo.setWidthPercentage(100);

        PdfPCell logoMaisNome = new PdfPCell();
        logoMaisNome.setBorder(Rectangle.NO_BORDER);
        logoMaisNome.setPadding(0);
        PdfPTable logoNome = new PdfPTable(new float[]{62f, 210f});
        logoNome.setWidthPercentage(100);

        PdfPTable logoQuadro = new PdfPTable(1);
        logoQuadro.setWidthPercentage(100);
        logoQuadro.addCell(celulaLogo());
        PdfPCell logoWrapper = new PdfPCell(logoQuadro);
        logoWrapper.setBorder(Rectangle.NO_BORDER);
        logoWrapper.setPadding(0);
        logoNome.addCell(logoWrapper);

        String nomeEmpresa = pedido.getEmpresa() != null && pedido.getEmpresa().getNome() != null
                ? pedido.getEmpresa().getNome().toUpperCase(Locale.forLanguageTag("pt-BR"))
                : "RETÍFICA";
        PdfPCell nomeCell = new PdfPCell();
        nomeCell.setBorder(Rectangle.NO_BORDER);
        nomeCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        nomeCell.setPaddingLeft(10f);
        nomeCell.addElement(new Paragraph(nomeEmpresa, FONTE_EMPRESA));
        Paragraph subtitulo = new Paragraph(letterSpaced("Retífica de motores — serviços e peças", FONTE_SUBTITULO_EMPRESA, 1.2f));
        subtitulo.setSpacingBefore(3f);
        nomeCell.addElement(subtitulo);
        logoNome.addCell(nomeCell);
        logoMaisNome.addElement(logoNome);
        conteudo.addCell(logoMaisNome);

        PdfPCell direita = new PdfPCell();
        direita.setBorder(Rectangle.NO_BORDER);
        direita.setHorizontalAlignment(Element.ALIGN_RIGHT);
        Paragraph titulo = new Paragraph("ORÇAMENTO", FONTE_TITULO_ORCAMENTO);
        titulo.setAlignment(Element.ALIGN_RIGHT);
        direita.addElement(titulo);
        Paragraph numero = new Paragraph("Nº " + String.format("%04d", pedido.getId() != null ? pedido.getId() : 0), FONTE_NUMERO);
        numero.setAlignment(Element.ALIGN_RIGHT);
        numero.setSpacingBefore(2f);
        direita.addElement(numero);
        LocalDate emitido = LocalDate.now();
        Paragraph emitidoP = new Paragraph("Emitido em " + emitido.format(DATA_BR), FONTE_EMITIDO);
        emitidoP.setAlignment(Element.ALIGN_RIGHT);
        emitidoP.setSpacingBefore(6f);
        direita.addElement(emitidoP);
        Paragraph validoP = new Paragraph(
                "Válido até " + emitido.plusDays(VALIDADE_DIAS).format(DATA_BR) + " (" + VALIDADE_DIAS + " dias)", FONTE_VALIDO);
        validoP.setAlignment(Element.ALIGN_RIGHT);
        direita.addElement(validoP);
        conteudo.addCell(direita);

        return envolverComMoldura(conteudo, COR_DIVIDER, 9f, 16f);
    }

    // ---------- cartões Cliente / Pedido ----------

    private PdfPTable caixaInfo(PedidoModel pedido) {
        PdfPTable grid = new PdfPTable(new float[]{1f, 1f});
        grid.setWidthPercentage(100);
        grid.getDefaultCell().setBorder(Rectangle.NO_BORDER);

        String endereco = enderecoCliente(pedido);
        PdfPTable cliente = cartaoInfo("Cliente", new String[][]{
                {"Nome", pedido.getCliente() != null ? valor(pedido.getCliente().getNome()) : "-"},
                {"Telefone", pedido.getCliente() != null ? valor(pedido.getCliente().getTelefone()) : "-"},
                {"Endereço", endereco},
        });

        PdfPTable pedidoCard = cartaoInfo("Pedido", new String[][]{
                {"Componentes", componentesTexto(pedido)},
                {"Categorias", categoriasTexto(pedido)},
                {"Descrição", valor(pedido.getPedido())},
        });

        PdfPCell c1 = new PdfPCell(cliente);
        c1.setBorder(Rectangle.NO_BORDER);
        c1.setPadding(0);
        c1.setPaddingRight(9f);
        PdfPCell c2 = new PdfPCell(pedidoCard);
        c2.setBorder(Rectangle.NO_BORDER);
        c2.setPadding(0);
        c2.setPaddingLeft(9f);
        grid.addCell(c1);
        grid.addCell(c2);
        return grid;
    }

    private PdfPTable cartaoInfo(String kicker, String[][] linhas) {
        PdfPTable conteudo = new PdfPTable(1);
        conteudo.setWidthPercentage(100);

        PdfPCell kickerCell = new PdfPCell(new Phrase(letterSpaced(kicker.toUpperCase(Locale.forLanguageTag("pt-BR")), FONTE_KICKER, 1.5f)));
        kickerCell.setBorder(Rectangle.NO_BORDER);
        kickerCell.setPaddingBottom(5f);
        conteudo.addCell(kickerCell);

        for (int i = 0; i < linhas.length; i++) {
            boolean ultima = i == linhas.length - 1;
            conteudo.addCell(linhaRotuloValor(linhas[i][0], linhas[i][1], ultima));
        }

        return envolverComMoldura(conteudo, COR_DIVIDER, 8f, 14f);
    }

    private PdfPCell linhaRotuloValor(String rotulo, String textoValor, boolean ultima) {
        PdfPTable linha = new PdfPTable(new float[]{1f, 2f});
        linha.setWidthPercentage(100);
        PdfPCell rotuloCell = new PdfPCell(new Phrase(rotulo, FONTE_ROW_LABEL));
        rotuloCell.setBorder(Rectangle.NO_BORDER);
        rotuloCell.setPaddingBottom(4f);
        rotuloCell.setPaddingTop(4f);
        PdfPCell valorCell = new PdfPCell(new Phrase(textoValor, FONTE_ROW_VALUE));
        valorCell.setBorder(Rectangle.NO_BORDER);
        valorCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        valorCell.setPaddingBottom(4f);
        valorCell.setPaddingTop(4f);
        if (!ultima) {
            rotuloCell.setBorder(Rectangle.BOTTOM);
            rotuloCell.setBorderColor(COR_ROW_DIVIDER);
            valorCell.setBorder(Rectangle.BOTTOM);
            valorCell.setBorderColor(COR_ROW_DIVIDER);
        }
        linha.addCell(rotuloCell);
        linha.addCell(valorCell);

        PdfPCell wrapper = new PdfPCell(linha);
        wrapper.setBorder(Rectangle.NO_BORDER);
        wrapper.setPadding(0);
        return wrapper;
    }

    // ---------- tabelas de serviços/peças ----------

    private void adicionarSecaoItens(Document documento, String titulo, List<String[]> linhas,
                                      String rotuloSubtotal, BigDecimal subtotalCategoria) throws DocumentException {
        Paragraph tituloP = new Paragraph(letterSpaced(titulo.toUpperCase(Locale.forLanguageTag("pt-BR")), FONTE_SECAO, 0.8f));
        tituloP.setSpacingAfter(3f);
        documento.add(tituloP);

        PdfPTable tabela = new PdfPTable(new float[]{5f, 1.2f, 1.8f, 1.8f});
        tabela.setWidthPercentage(100);

        String[] cabecalhos = {"Descrição", "Qtd", "Valor unit.", "Total"};
        int[] alinhamentos = {Element.ALIGN_LEFT, Element.ALIGN_CENTER, Element.ALIGN_RIGHT, Element.ALIGN_RIGHT};
        for (int i = 0; i < cabecalhos.length; i++) {
            PdfPCell th = new PdfPCell(new Phrase(letterSpaced(cabecalhos[i].toUpperCase(Locale.forLanguageTag("pt-BR")), FONTE_TH, 0.7f)));
            th.setHorizontalAlignment(alinhamentos[i]);
            th.setBorder(Rectangle.BOTTOM);
            th.setBorderColor(COR_DIVIDER);
            th.setBorderWidth(0.75f);
            th.setPaddingBottom(4f);
            tabela.addCell(th);
        }

        for (int i = 0; i < linhas.size(); i++) {
            String[] linha = linhas.get(i);
            boolean ultima = i == linhas.size() - 1;
            for (int col = 0; col < 4; col++) {
                PdfPCell td = new PdfPCell(new Phrase(linha[col], FONTE_TD));
                td.setHorizontalAlignment(alinhamentos[col]);
                td.setPadding(4f);
                if (!ultima) {
                    td.setBorder(Rectangle.BOTTOM);
                    td.setBorderColor(COR_ROW_DIVIDER);
                } else {
                    td.setBorder(Rectangle.NO_BORDER);
                }
                tabela.addCell(td);
            }
        }
        documento.add(tabela);

        Paragraph subtotalP = new Paragraph();
        subtotalP.add(new Chunk(rotuloSubtotal + ": ", FONTE_SUBTOTAL_LABEL));
        subtotalP.add(new Chunk(moeda(subtotalCategoria), FONTE_SUBTOTAL_VALOR));
        subtotalP.setAlignment(Element.ALIGN_RIGHT);
        subtotalP.setSpacingBefore(3f);
        documento.add(subtotalP);
    }

    // ---------- totais ----------

    private PdfPTable caixaTotais(PedidoModel pedido) {
        BigDecimal subtotal = pedido.getSubtotal();
        BigDecimal desconto = pedido.getValorDesconto();

        PdfPTable conteudo = new PdfPTable(1);
        conteudo.setWidthPercentage(45);
        conteudo.setHorizontalAlignment(Element.ALIGN_RIGHT);

        conteudo.addCell(linhaTotal("Subtotal", moeda(subtotal), FONTE_TOTAIS_LABEL, FONTE_TOTAIS_VALOR, false));
        if (desconto.signum() > 0) {
            conteudo.addCell(linhaTotal("Desconto" + rotuloTipoDesconto(pedido), "- " + moeda(desconto),
                    FONTE_TOTAIS_LABEL, FONTE_TOTAIS_VALOR, false));
        }

        PdfPTable linhaFinal = new PdfPTable(new float[]{1f, 1f});
        linhaFinal.setWidthPercentage(100);
        PdfPCell labelFinal = new PdfPCell(new Phrase(letterSpaced("Total geral", FONTE_TOTAL_LABEL, 0.6f)));
        labelFinal.setBorder(Rectangle.TOP);
        labelFinal.setBorderColor(COR_DIVIDER);
        labelFinal.setPaddingTop(6f);
        labelFinal.setVerticalAlignment(Element.ALIGN_MIDDLE);
        PdfPCell valorFinal = new PdfPCell(new Phrase(moeda(subtotal.subtract(desconto)), FONTE_TOTAL_VALOR));
        valorFinal.setBorder(Rectangle.TOP);
        valorFinal.setBorderColor(COR_DIVIDER);
        valorFinal.setPaddingTop(6f);
        valorFinal.setHorizontalAlignment(Element.ALIGN_RIGHT);
        linhaFinal.addCell(labelFinal);
        linhaFinal.addCell(valorFinal);
        PdfPCell wrapperFinal = new PdfPCell(linhaFinal);
        wrapperFinal.setBorder(Rectangle.NO_BORDER);
        wrapperFinal.setPadding(0);
        wrapperFinal.setPaddingTop(2f);
        conteudo.addCell(wrapperFinal);

        return envolverComMoldura(conteudo, COR_ACCENT, 8f, 20f);
    }

    private PdfPCell linhaTotal(String rotulo, String texto, Font fonteRotulo, Font fonteValor, boolean ultima) {
        PdfPTable linha = new PdfPTable(new float[]{1f, 1f});
        linha.setWidthPercentage(100);
        PdfPCell rotuloCell = new PdfPCell(new Phrase(rotulo, fonteRotulo));
        rotuloCell.setBorder(Rectangle.NO_BORDER);
        rotuloCell.setPaddingBottom(2f);
        PdfPCell valorCell = new PdfPCell(new Phrase(texto, fonteValor));
        valorCell.setBorder(Rectangle.NO_BORDER);
        valorCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        valorCell.setPaddingBottom(2f);
        linha.addCell(rotuloCell);
        linha.addCell(valorCell);
        PdfPCell wrapper = new PdfPCell(linha);
        wrapper.setBorder(Rectangle.NO_BORDER);
        wrapper.setPadding(0);
        return wrapper;
    }

    private String rotuloTipoDesconto(PedidoModel pedido) {
        if (pedido.getDescontoTipo() == TipoDesconto.PERCENTUAL && pedido.getDescontoValor() != null) {
            return " (" + pedido.getDescontoValor().stripTrailingZeros().toPlainString() + "%)";
        }
        return "";
    }

    // ---------- rodapé ----------

    private PdfPTable rodape(PedidoModel pedido) {
        PdfPTable tabela = new PdfPTable(new float[]{1f, 1f});
        tabela.setWidthPercentage(100);
        String nomeEmpresa = pedido.getEmpresa() != null ? valor(pedido.getEmpresa().getNome()) : "";
        PdfPCell esquerda = new PdfPCell(new Phrase(nomeEmpresa + " — este documento não constitui nota fiscal", FONTE_RODAPE));
        esquerda.setBorder(Rectangle.TOP);
        esquerda.setBorderColor(COR_DIVIDER);
        esquerda.setPaddingTop(6f);
        PdfPCell direita = new PdfPCell(new Phrase("Orçamento válido por " + VALIDADE_DIAS + " dias a partir da emissão", FONTE_RODAPE));
        direita.setBorder(Rectangle.TOP);
        direita.setBorderColor(COR_DIVIDER);
        direita.setPaddingTop(6f);
        direita.setHorizontalAlignment(Element.ALIGN_RIGHT);
        tabela.addCell(esquerda);
        tabela.addCell(direita);
        return tabela;
    }

    // ---------- utilidades de layout ----------

    /** Envolve o conteúdo numa caixa com borda + marcas de canto "blueprint", padding interno. */
    private PdfPTable envolverComMoldura(PdfPTable conteudo, Color corBorda, float paddingVertical, float paddingHorizontal) {
        PdfPTable moldura = new PdfPTable(1);
        moldura.setWidthPercentage(100);
        PdfPCell cell = new PdfPCell(conteudo);
        cell.setBorder(Rectangle.BOX);
        cell.setBorderColor(corBorda);
        cell.setBorderWidth(0.75f);
        cell.setPaddingTop(paddingVertical);
        cell.setPaddingBottom(paddingVertical);
        cell.setPaddingLeft(paddingHorizontal);
        cell.setPaddingRight(paddingHorizontal);
        cell.setCellEvent(new MarcasDeCanto());
        moldura.addCell(cell);
        return moldura;
    }

    private Element espaco(float altura) {
        Paragraph p = new Paragraph(" ");
        p.setSpacingBefore(0);
        p.setSpacingAfter(0);
        Font f = new Font(Font.HELVETICA, Math.max(1f, altura));
        p.setFont(f);
        return p;
    }

    /** Aplica espaçamento entre letras manualmente (uppercase + letter-spacing do design). */
    private Chunk letterSpaced(String texto, Font fonte, float espacamento) {
        Chunk chunk = new Chunk(texto, fonte);
        chunk.setCharacterSpacing(espacamento);
        return chunk;
    }

    private String enderecoCliente(PedidoModel pedido) {
        if (pedido.getCliente() == null) {
            return "-";
        }
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

    private String componentesTexto(PedidoModel pedido) {
        if (pedido.getComponentes().isEmpty()) {
            return valor(pedido.getPedido());
        }
        return pedido.getComponentes().stream().map(CabecoteModel::getNome).collect(Collectors.joining(", "));
    }

    private String categoriasTexto(PedidoModel pedido) {
        if (pedido.getCategorias().isEmpty()) {
            return "-";
        }
        return pedido.getCategorias().stream().map(CategoriaProduto::getRotulo).collect(Collectors.joining(", "));
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

    private BigDecimal somaServicos(List<ServicoModel> servicos) {
        BigDecimal total = BigDecimal.ZERO;
        for (ServicoModel s : servicos) {
            total = total.add(s.getValorTotal());
        }
        return total;
    }

    private BigDecimal somaPecas(List<PecaModel> pecas) {
        BigDecimal total = BigDecimal.ZERO;
        for (PecaModel p : pecas) {
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

    /** Fundo cinza claro da página + moldura fina a alguns pontos da borda física — assinatura "blueprint". */
    private static class MolduraEPapelEvent extends PdfPageEventHelper {
        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfContentByte cb = writer.getDirectContentUnder();
            Rectangle pagina = document.getPageSize();
            cb.saveState();
            cb.setColorFill(COR_FUNDO);
            cb.rectangle(0, 0, pagina.getWidth(), pagina.getHeight());
            cb.fill();
            cb.setColorStroke(COR_DIVIDER);
            cb.setLineWidth(0.75f);
            cb.rectangle(INSET_MOLDURA, INSET_MOLDURA,
                    pagina.getWidth() - 2 * INSET_MOLDURA, pagina.getHeight() - 2 * INSET_MOLDURA);
            cb.stroke();
            cb.restoreState();
        }
    }

    /** Desenha 4 marcas em "+" nos cantos de uma célula — assinatura "blueprint" do design system Industry. */
    private static class MarcasDeCanto implements PdfPCellEvent {
        private static final float TAMANHO = 4f;

        @Override
        public void cellLayout(PdfPCell cell, Rectangle rect, PdfContentByte[] canvases) {
            PdfContentByte cb = canvases[PdfPTable.LINECANVAS];
            cb.saveState();
            cb.setColorStroke(COR_TEXTO_55);
            cb.setLineWidth(0.6f);
            cruz(cb, rect.getLeft(), rect.getTop());
            cruz(cb, rect.getRight(), rect.getTop());
            cruz(cb, rect.getLeft(), rect.getBottom());
            cruz(cb, rect.getRight(), rect.getBottom());
            cb.restoreState();
        }

        private void cruz(PdfContentByte cb, float x, float y) {
            cb.moveTo(x - TAMANHO, y);
            cb.lineTo(x + TAMANHO, y);
            cb.moveTo(x, y - TAMANHO);
            cb.lineTo(x, y + TAMANHO);
            cb.stroke();
        }
    }
}
