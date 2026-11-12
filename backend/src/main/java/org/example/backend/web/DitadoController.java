package org.example.backend.web;

import org.example.backend.ditado.DitadoException;
import org.example.backend.ditado.DitadoService;
import org.example.backend.ditado.PromptDitado.RespostaRecebida;
import org.example.backend.security.RetificaPrincipal;
import org.example.backend.security.SecurityUtils;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Ditar o pedido por voz (ver backend/DITADO.md). O app manda o TEXTO ja transcrito; o servidor entende com a IA,
 * valida tudo contra o catalogo da empresa do token e devolve o que foi entendido e, se for o caso, perguntas.
 * Desligado (503) sem ANTHROPIC_API_KEY.
 */
@RestController
@RequestMapping("/api/ditado")
public class DitadoController {

    public record TextoRequest(String texto) {
    }

    public record RespostaRequest(String perguntaId, Integer opcaoIndice, String texto) {
    }

    public record RespostasRequest(List<RespostaRequest> respostas) {
    }

    private final DitadoService servico;

    public DitadoController(DitadoService servico) {
        this.servico = servico;
    }

    /** Na demonstração o ditado fica desligado (cada chamada custa IA). */
    static final String MSG_DEMO = "O ditado não está disponível na demonstração.";

    @GetMapping("/status")
    public DitadoService.Status status() {
        if (SecurityUtils.ehDemo()) {
            return new DitadoService.Status(false, 0);
        }
        return servico.status(SecurityUtils.empresaAtual());
    }

    @PostMapping
    public ResponseEntity<Object> iniciar(@RequestBody TextoRequest corpo) {
        if (SecurityUtils.ehDemo()) {
            return ResponseEntity.status(403).body(Map.of("erro", MSG_DEMO));
        }
        RetificaPrincipal quem = SecurityUtils.principalAtual();
        return executar(() -> servico.iniciar(quem.getEmpresaId(), quem.getUsuarioId(), corpo != null ? corpo.texto() : null));
    }

    @PostMapping("/{id}/respostas")
    public ResponseEntity<Object> responder(@PathVariable String id, @RequestBody RespostasRequest corpo) {
        if (SecurityUtils.ehDemo()) {
            return ResponseEntity.status(403).body(Map.of("erro", MSG_DEMO));
        }
        RetificaPrincipal quem = SecurityUtils.principalAtual();
        List<RespostaRecebida> respostas = corpo == null || corpo.respostas() == null ? List.of()
                : corpo.respostas().stream()
                .map(r -> r == null ? null : new RespostaRecebida(r.perguntaId(), r.opcaoIndice(), r.texto())).toList();
        return executar(() -> servico.responder(quem.getEmpresaId(), quem.getUsuarioId(), id, respostas));
    }

    private static ResponseEntity<Object> executar(Supplier<Object> acao) {
        try {
            return ResponseEntity.ok(acao.get());
        } catch (DitadoException e) {
            return ResponseEntity.status(e.status()).body(Map.of("erro", e.getMessage()));
        }
    }
}
