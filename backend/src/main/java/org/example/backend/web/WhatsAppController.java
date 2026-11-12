package org.example.backend.web;

import org.example.backend.security.SecurityUtils;
import org.example.backend.whatsapp.WhatsAppService;
import org.example.model.CabecoteModel;
import org.example.model.PedidoModel;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Envio do orçamento pelo WhatsApp Business (Cloud API). Enquanto a API não
 * estiver configurada, /status responde habilitado=false e o app usa só o
 * link wa.me.
 */
@RestController
public class WhatsAppController {

    /** PDF que o aparelho manda (com a foto já embutida) — bem acima de um orçamento com foto reduzida. */
    private static final long PDF_MAX_BYTES = 15L * 1024 * 1024;
    private static final Locale PT_BR = Locale.forLanguageTag("pt-BR");

    // Freio contra envio repetido/abusivo — cada mensagem custa dinheiro e
    // chega no celular do cliente. Importante enquanto o login do app está
    // desligado (qualquer um com a URL chega nesta rota).
    private static final long INTERVALO_MESMO_PEDIDO_MS = 60_000;
    private static final int MAX_ENVIOS_POR_HORA = 30;
    private final Map<Long, Long> ultimoEnvioPorPedido = new java.util.concurrent.ConcurrentHashMap<>();
    private final Deque<Long> enviosUltimaHora = new ArrayDeque<>();

    private final WhatsAppService whatsApp;
    private final OrcamentoPdfGerador orcamentoPdfGerador;

    public WhatsAppController(WhatsAppService whatsApp, OrcamentoPdfGerador orcamentoPdfGerador) {
        this.whatsApp = whatsApp;
        this.orcamentoPdfGerador = orcamentoPdfGerador;
    }

    @GetMapping("/api/whatsapp/status")
    public Map<String, Boolean> status() {
        return Map.of("habilitado", whatsApp.isHabilitado() && !SecurityUtils.ehDemo());
    }

    /**
     * Manda o orçamento do pedido pro WhatsApp do cliente.
     *
     * @param pdf opcional: o PDF que o aparelho já montou (com a foto do
     *            componente). Sem ele, o servidor gera o orçamento padrão.
     */
    @PostMapping("/api/pedidos/{id}/whatsapp")
    public ResponseEntity<Map<String, String>> enviar(@PathVariable Long id,
                                                      @RequestParam(name = "pdf", required = false) MultipartFile pdf) {
        if (SecurityUtils.ehDemo()) {
            return erro(403, "O envio pelo WhatsApp não está disponível na demonstração.");
        }
        if (!whatsApp.isHabilitado()) {
            return erro(503, "Envio pelo WhatsApp ainda não configurado.");
        }
        Long empresaId = SecurityUtils.empresaAtual();

        byte[] bytes;
        PedidoModel pedido;
        if (pdf != null && !pdf.isEmpty()) {
            if (pdf.getSize() > PDF_MAX_BYTES) {
                return erro(413, "PDF grande demais pra enviar.");
            }
            try {
                bytes = pdf.getBytes();
            } catch (IOException e) {
                return erro(400, "Não foi possível ler o PDF enviado.");
            }
            if (!ehPdf(bytes)) {
                return erro(400, "O arquivo enviado não é um PDF.");
            }
            pedido = orcamentoPdfGerador.carregar(id, empresaId);
        } else {
            OrcamentoPdfGerador.Orcamento orcamento = orcamentoPdfGerador.gerar(id, empresaId);
            pedido = orcamento != null ? orcamento.pedido() : null;
            bytes = orcamento != null ? orcamento.pdf() : null;
        }
        if (pedido == null) {
            return ResponseEntity.notFound().build();
        }

        String numero = pedido.getCliente() != null
                ? WhatsAppService.numeroInternacional(pedido.getCliente().getTelefone()) : null;
        if (numero == null) {
            return erro(422, "O cliente não tem um telefone válido com DDD.");
        }

        String bloqueio = reservarEnvio(pedido.getId());
        if (bloqueio != null) {
            return erro(429, bloqueio);
        }

        String numeroOrcamento = String.format("%04d", pedido.getId());
        // Corpo do modelo "orcamento": {{1}} nome, {{2}} nº do orçamento, {{3}} modelo (ver WHATSAPP-API.md)
        List<String> parametros = List.of(primeiroNome(pedido), numeroOrcamento, modeloTexto(pedido));
        try {
            String mensagemId = whatsApp.enviarOrcamento(numero, bytes, "orcamento-" + numeroOrcamento + ".pdf", parametros);
            return ResponseEntity.ok(Map.of("mensagemId", mensagemId));
        } catch (WhatsAppService.WhatsAppException e) {
            liberarEnvio(pedido.getId()); // não saiu: pode tentar de novo na hora
            return erro(502, e.getMessage());
        }
    }

    /** Reserva um envio; devolve o motivo se ainda não pode, ou null se liberado. */
    private synchronized String reservarEnvio(Long pedidoId) {
        long agora = System.currentTimeMillis();
        Long ultimo = ultimoEnvioPorPedido.get(pedidoId);
        if (ultimo != null && agora - ultimo < INTERVALO_MESMO_PEDIDO_MS) {
            return "Esse orçamento acabou de ser enviado. Espere um minuto pra mandar de novo.";
        }
        while (!enviosUltimaHora.isEmpty() && agora - enviosUltimaHora.peekFirst() > 3_600_000) {
            enviosUltimaHora.pollFirst();
        }
        if (enviosUltimaHora.size() >= MAX_ENVIOS_POR_HORA) {
            return "Limite de " + MAX_ENVIOS_POR_HORA + " envios por hora atingido. Tente mais tarde.";
        }
        ultimoEnvioPorPedido.put(pedidoId, agora);
        enviosUltimaHora.addLast(agora);
        return null;
    }

    private synchronized void liberarEnvio(Long pedidoId) {
        ultimoEnvioPorPedido.remove(pedidoId);
        enviosUltimaHora.pollLast();
    }

    private static boolean ehPdf(byte[] bytes) {
        return bytes.length > 5 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F' && bytes[4] == '-';
    }

    /** "MIGUEL BELIZARIO SANTOS" → "Miguel". */
    private static String primeiroNome(PedidoModel pedido) {
        String nome = pedido.getCliente() != null && pedido.getCliente().getNome() != null
                ? pedido.getCliente().getNome().trim() : "";
        if (nome.isEmpty()) {
            return "tudo bem";
        }
        String primeiro = nome.split("\\s+")[0].toLowerCase(PT_BR);
        return primeiro.substring(0, 1).toUpperCase(PT_BR) + primeiro.substring(1);
    }

    /** Mesmo "Modelo" do PDF: os modelos do pedido, ou a descrição dele. */
    private static String modeloTexto(PedidoModel pedido) {
        if (!pedido.getComponentes().isEmpty()) {
            return pedido.getComponentes().stream().map(CabecoteModel::getNome).collect(Collectors.joining(", "));
        }
        return pedido.getPedido() != null && !pedido.getPedido().isBlank() ? pedido.getPedido().trim() : "-";
    }

    private static ResponseEntity<Map<String, String>> erro(int status, String mensagem) {
        return ResponseEntity.status(status).body(Map.of("erro", mensagem));
    }
}
