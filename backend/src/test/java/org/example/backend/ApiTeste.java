package org.example.backend;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

/** Cliente HTTP mínimo para falar com o servidor de teste (porta aleatória). */
final class ApiTeste {

    static final JsonMapper JSON = JsonMapper.builder().build();

    record Resposta(int status, String corpo, byte[] bytes, java.net.http.HttpHeaders headers) {
        String cabecalho(String nome) {
            return headers.firstValue(nome).orElse(null);
        }

        JsonNode json() {
            return JSON.readTree(corpo);
        }
    }

    private final HttpClient http = HttpClient.newHttpClient();
    private final String base;

    ApiTeste(int porta) {
        this.base = "http://localhost:" + porta;
    }

    Resposta get(String caminho, String token) {
        return enviar(montar(caminho, token).GET().build());
    }

    Resposta delete(String caminho, String token) {
        return enviar(montar(caminho, token).DELETE().build());
    }

    Resposta post(String caminho, String token, Object corpo) {
        return enviar(montar(caminho, token).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(corpo))).build());
    }

    Resposta put(String caminho, String token, Object corpo) {
        return enviar(montar(caminho, token).header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(corpo))).build());
    }

    Resposta postSemCorpo(String caminho, String token) {
        return enviar(montar(caminho, token).POST(HttpRequest.BodyPublishers.noBody()).build());
    }

    Resposta postComChave(String caminho, String chave, Object corpo) {
        return enviar(HttpRequest.newBuilder(URI.create(base + caminho))
                .header("Content-Type", "application/json").header("X-Api-Key", chave)
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(corpo))).build());
    }

    /** PUT multipart com um único arquivo (usado no logo da empresa). */
    Resposta putArquivo(String caminho, String token, String campo, byte[] conteudo) {
        String limite = "----teste" + System.nanoTime();
        ByteArrayOutputStream corpo = new ByteArrayOutputStream();
        String cabecalho = "--" + limite + "\r\nContent-Disposition: form-data; name=\"" + campo
                + "\"; filename=\"logo.png\"\r\nContent-Type: image/png\r\n\r\n";
        corpo.writeBytes(cabecalho.getBytes(StandardCharsets.UTF_8));
        corpo.writeBytes(conteudo);
        corpo.writeBytes(("\r\n--" + limite + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return enviar(montar(caminho, token).header("Content-Type", "multipart/form-data; boundary=" + limite)
                .PUT(HttpRequest.BodyPublishers.ofByteArray(corpo.toByteArray())).build());
    }

    Resposta requisicao(String metodo, String caminho, String token) {
        HttpRequest.Builder b = montar(caminho, token).header("Content-Type", "application/json");
        return enviar(b.method(metodo, HttpRequest.BodyPublishers.ofString("{}")).build());
    }

    private HttpRequest.Builder montar(String caminho, String token) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + caminho));
        if (token != null) {
            b.header("Authorization", "Bearer " + token);
        }
        return b;
    }

    private Resposta enviar(HttpRequest req) {
        try {
            HttpResponse<byte[]> r = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
            return new Resposta(r.statusCode(), new String(r.body(), StandardCharsets.UTF_8), r.body(), r.headers());
        } catch (Exception e) {
            throw new IllegalStateException("Falha na chamada " + req.method() + " " + req.uri(), e);
        }
    }
}
