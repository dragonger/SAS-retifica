package org.example.backend.demo;

import org.example.backend.dto.CabecoteRequestDTO;
import org.example.backend.dto.CatalogoRequestDTO;
import org.example.backend.dto.CategoriaValorRequestDTO;
import org.example.backend.dto.ClienteDTO;
import org.example.backend.dto.ItemRequestDTO;
import org.example.backend.dto.LoginResponseDTO;
import org.example.backend.dto.PedidoRequestDTO;
import org.example.backend.security.JwtUtil;
import org.example.backend.security.RetificaPrincipal;
import org.example.backend.web.CabecoteController;
import org.example.backend.web.ClienteController;
import org.example.backend.web.PecaCatalogoController;
import org.example.backend.web.PedidoController;
import org.example.backend.web.ServicoCatalogoController;
import org.example.model.UsuarioModel;
import org.example.repository.EmpresaDemoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Demonstração para visitantes (recrutadores, curiosos): cada clique em "Abrir demonstração" cria uma
 * empresa NOVA e isolada, com dados fictícios, e devolve um token que vale {@link #DURACAO}. A limpeza
 * apaga a empresa inteira quando o prazo vence.
 *
 * <p>O isolamento é o mesmo de qualquer empresa (tudo filtrado pela empresa do token). Na demonstração o
 * ditado (custa IA), o WhatsApp e a troca de senha ficam bloqueados nos controllers.
 *
 * <p>Limites contra abuso (em memória; o backend roda numa instância só): no máximo {@link #MAX_ATIVAS}
 * demonstrações ao mesmo tempo, {@link #MAX_POR_IP_HORA} por endereço por hora e {@link #MAX_POR_DIA} por dia.
 * {@code DEMO_HABILITADA=false} no ambiente desliga a demonstração.
 */
@Service
public class DemoService {

    public static final Duration DURACAO = Duration.ofHours(2);
    static final int MAX_ATIVAS = 30;
    static final int MAX_POR_IP_HORA = 5;
    static final int MAX_POR_DIA = 200;
    static final String NOME_EMPRESA = "Retífica Demonstração";

    private static final Logger log = LoggerFactory.getLogger(DemoService.class);
    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    /** Resultado de {@link #criar}: a sessão, ou o motivo da recusa. */
    public record Resultado(LoginResponseDTO sessao, int status, String erro) {
        static Resultado recusa(int status, String erro) {
            return new Resultado(null, status, erro);
        }
    }

    private final EmpresaDemoRepository repositorio = new EmpresaDemoRepository();
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;
    private final ClienteController clientes;
    private final CabecoteController componentes;
    private final ServicoCatalogoController servicosCatalogo;
    private final PecaCatalogoController pecasCatalogo;
    private final PedidoController pedidos;
    private final Clock relogio = Clock.system(FUSO);
    private final boolean habilitada;
    private final SecureRandom aleatorio = new SecureRandom();

    private final Map<String, Deque<Instant>> porIp = new HashMap<>();
    private LocalDate diaDoContador;
    private int criadasHoje;

    public DemoService(JwtUtil jwtUtil, PasswordEncoder passwordEncoder, ClienteController clientes,
                       CabecoteController componentes, ServicoCatalogoController servicosCatalogo,
                       PecaCatalogoController pecasCatalogo, PedidoController pedidos) {
        this.jwtUtil = jwtUtil;
        this.passwordEncoder = passwordEncoder;
        this.clientes = clientes;
        this.componentes = componentes;
        this.servicosCatalogo = servicosCatalogo;
        this.pecasCatalogo = pecasCatalogo;
        this.pedidos = pedidos;
        this.habilitada = !"false".equalsIgnoreCase(System.getenv("DEMO_HABILITADA"));
    }

    /** Cria uma demonstração para quem está em {@code ip} (só usado para o limite; não é gravado). */
    public Resultado criar(String ip) {
        if (!habilitada) {
            return Resultado.recusa(503, "A demonstração está desligada no momento.");
        }
        LocalDateTime agora = LocalDateTime.now(relogio);
        if (!reservarVaga(ip, agora)) {
            return Resultado.recusa(429, "Muitas demonstrações abertas agora. Tente de novo em alguns minutos.");
        }
        if (repositorio.contarAtivas(agora) >= MAX_ATIVAS) {
            return Resultado.recusa(429, "Muitas demonstrações abertas agora. Tente de novo em alguns minutos.");
        }

        LocalDateTime expira = agora.plus(DURACAO);
        byte[] senhaDescartavel = new byte[24];
        aleatorio.nextBytes(senhaDescartavel); // ninguém sabe a senha: só entra pelo token
        UsuarioModel usuario = repositorio.criar(NOME_EMPRESA, expira,
                "demo-" + UUID.randomUUID() + "@demonstracao.invalid", "Visitante",
                passwordEncoder.encode(Base64.getEncoder().encodeToString(senhaDescartavel)));
        Long empresaId = usuario.getEmpresa().getId();
        try {
            comoDemo(usuario, () -> semear(agora.toLocalDate()));
        } catch (RuntimeException e) {
            repositorio.apagar(empresaId);
            throw e;
        }
        log.info("Demonstração criada: empresa {} (vence {})", empresaId, expira);

        LoginResponseDTO dto = new LoginResponseDTO();
        dto.token = jwtUtil.gerarDemo(usuario, expira.atZone(FUSO).toInstant());
        dto.nome = usuario.getNome();
        dto.empresaNome = NOME_EMPRESA;
        return new Resultado(dto, 200, null);
    }

    /** Apaga as demonstrações vencidas. A cada 10 minutos, e um minuto depois de o backend subir. */
    @Scheduled(fixedDelayString = "${DEMO_LIMPEZA_MS:600000}", initialDelayString = "60000")
    public int limparVencidas() {
        int apagadas = 0;
        for (Long id : repositorio.vencidas(LocalDateTime.now(relogio))) {
            try {
                if (repositorio.apagar(id)) apagadas++;
            } catch (RuntimeException e) {
                log.warn("Não consegui apagar a demonstração {}: {}", id, e.getMessage());
            }
        }
        if (apagadas > 0) log.info("Demonstrações vencidas apagadas: {}", apagadas);
        return apagadas;
    }

    // ------------------------------------------------------------------ limites

    private synchronized boolean reservarVaga(String ip, LocalDateTime agora) {
        LocalDate hoje = agora.toLocalDate();
        if (!hoje.equals(diaDoContador)) {
            diaDoContador = hoje;
            criadasHoje = 0;
            porIp.clear();
        }
        if (criadasHoje >= MAX_POR_DIA) return false;
        Instant instante = agora.atZone(FUSO).toInstant();
        Deque<Instant> doIp = porIp.computeIfAbsent(ip == null ? "?" : ip, k -> new ArrayDeque<>());
        while (!doIp.isEmpty() && doIp.peekFirst().isBefore(instante.minus(Duration.ofHours(1)))) doIp.pollFirst();
        if (doIp.size() >= MAX_POR_IP_HORA) return false;
        doIp.addLast(instante);
        criadasHoje++;
        return true;
    }

    // ------------------------------------------------------------------ dados fictícios

    /**
     * Os dados entram pelos mesmos controllers que o app usa (mesmas validações, totais e regras), com a
     * identidade do visitante. O contexto de segurança anterior é restaurado no fim.
     */
    private void comoDemo(UsuarioModel usuario, Runnable acao) {
        SecurityContext anterior = SecurityContextHolder.getContext();
        SecurityContext contexto = SecurityContextHolder.createEmptyContext();
        RetificaPrincipal principal = new RetificaPrincipal(usuario.getId(), usuario.getEmpresa().getId(), usuario.getEmail(), true);
        contexto.setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of()));
        SecurityContextHolder.setContext(contexto);
        try {
            acao.run();
        } finally {
            SecurityContextHolder.setContext(anterior);
        }
    }

    private void semear(LocalDate hoje) {
        Map<String, Long> cli = new LinkedHashMap<>();
        cliente(cli, "Auto Center Ribeiro", "31988887777");
        cliente(cli, "Mecânica Souza & Filhos", "31977776666");
        cliente(cli, "Oficina do Toninho", "31966665555");
        cliente(cli, "Transportes Vale Verde", "31955554444");
        cliente(cli, "Diesel Forte Peças", null);

        Map<String, Long> comp = new LinkedHashMap<>();
        componente(comp, "Cabeçote AP 1.8", "CABECOTE");
        componente(comp, "Cabeçote Fire 1.0", "CABECOTE");
        componente(comp, "Bloco MWM 229", "BLOCO");
        componente(comp, "Virabrequim OM 366", "VIRABREQUIM");
        componente(comp, "Biela Gol 1.6", "BIELA");

        servico("Plainar cabeçote", "CABECOTE", 180);
        servico("Retificar sede de válvula", "CABECOTE", 220);
        servico("Trocar guias de válvula", "CABECOTE", 160);
        servico("Brunir cilindros", "BLOCO", 350);
        servico("Retificar mancais", "BLOCO", 420);
        servico("Retificar colos do virabrequim", "VIRABREQUIM", 380);
        servico("Polir virabrequim", "VIRABREQUIM", 90);
        servico("Embuchar biela", "BIELA", 120);
        peca("Válvula de admissão", "CABECOTE", 45);
        peca("Retentor de válvula", "CABECOTE", 8);
        peca("Junta do cabeçote", "CABECOTE", 95);
        peca("Jogo de bronzinas", "VIRABREQUIM", 180);
        peca("Pistão STD", "BLOCO", 210);
        peca("Bucha de biela", "BIELA", 25);

        // encerrados (alimentam Encerrados e o Dashboard)
        finalizar(pedido(cli.get("Transportes Vale Verde"), comp.get("Bloco MWM 229"), "BLOCO", "PRONTO", hoje.minusDays(6),
                List.of("Brunir cilindros", "Retificar mancais"), Map.of("Pistão STD", 4), 770, 840, "Motor do caminhão 12", null));
        finalizar(pedido(cli.get("Auto Center Ribeiro"), comp.get("Cabeçote Fire 1.0"), "CABECOTE", "PRONTO", hoje.minusDays(3),
                List.of("Plainar cabeçote"), Map.of("Junta do cabeçote", 1), 180, 95, "Superaquecimento", null));
        finalizar(pedido(cli.get("Diesel Forte Peças"), comp.get("Virabrequim OM 366"), "VIRABREQUIM", "PRONTO", hoje.minusDays(2),
                List.of("Retificar colos do virabrequim", "Polir virabrequim"), Map.of("Jogo de bronzinas", 1), 470, 180, "Retífica 0,25", null));

        // em aberto: um de cada situação, com entregas para hoje, atrasada e futuras
        pedido(cli.get("Auto Center Ribeiro"), comp.get("Cabeçote AP 1.8"), "CABECOTE", "EM_ANDAMENTO", hoje,
                List.of("Plainar cabeçote", "Retificar sede de válvula", "Trocar guias de válvula"),
                Map.of("Válvula de admissão", 4, "Retentor de válvula", 8), 560, 244, "Cabeçote empenado, cliente com pressa", 5);
        pedido(cli.get("Mecânica Souza & Filhos"), comp.get("Bloco MWM 229"), "BLOCO", "ABERTO", hoje.plusDays(5),
                List.of("Brunir cilindros"), Map.of("Pistão STD", 4), 350, 840, "Orçamento aprovado por telefone", null);
        pedido(cli.get("Oficina do Toninho"), comp.get("Biela Gol 1.6"), "BIELA", "PRONTO", hoje,
                List.of("Embuchar biela"), Map.of("Bucha de biela", 4), 120, 100, "Pronto para retirada", null);
        pedido(cli.get("Transportes Vale Verde"), comp.get("Virabrequim OM 366"), "VIRABREQUIM", "EM_ANDAMENTO", hoje.minusDays(1),
                List.of("Retificar colos do virabrequim"), Map.of("Jogo de bronzinas", 1), 380, 180, "Frota: prioridade", null);
        pedido(cli.get("Mecânica Souza & Filhos"), comp.get("Cabeçote Fire 1.0"), "CABECOTE", "ABERTO", hoje.plusDays(8),
                List.of("Plainar cabeçote"), Map.of(), 180, 0, "Aguardando peças", null);
    }

    private void cliente(Map<String, Long> ids, String nome, String telefone) {
        ClienteDTO dto = new ClienteDTO();
        dto.nome = nome;
        dto.telefone = telefone;
        ids.put(nome, corpo(clientes.criar(dto)).id);
    }

    private void componente(Map<String, Long> ids, String nome, String categoria) {
        CabecoteRequestDTO dto = new CabecoteRequestDTO();
        dto.nome = nome;
        dto.categoria = categoria;
        ids.put(nome, corpo(componentes.criar(dto)).id);
    }

    private void servico(String nome, String categoria, int valor) {
        corpo(servicosCatalogo.criar(catalogo(nome, categoria, valor)));
    }

    private void peca(String nome, String categoria, int valor) {
        corpo(pecasCatalogo.criar(catalogo(nome, categoria, valor)));
    }

    private static CatalogoRequestDTO catalogo(String nome, String categoria, int valor) {
        CatalogoRequestDTO dto = new CatalogoRequestDTO();
        dto.nome = nome;
        dto.categoria = categoria;
        dto.valor = BigDecimal.valueOf(valor);
        return dto;
    }

    private Long pedido(Long clienteId, Long componenteId, String categoria, String status, LocalDate entrega,
                        List<String> servicos, Map<String, Integer> pecas, int valorServicos, int valorPecas,
                        String descricao, Integer descontoPercentual) {
        PedidoRequestDTO dto = new PedidoRequestDTO();
        dto.clienteId = clienteId;
        dto.componenteIds = List.of(componenteId);
        dto.status = status;
        dto.pedidoDescricao = descricao;
        dto.datEntregaEstimada = entrega.toString();
        dto.servicos = servicos.stream().map(s -> item(s, categoria, null)).toList();
        dto.pecas = pecas.entrySet().stream().map(p -> item(p.getKey(), categoria, p.getValue())).toList();
        CategoriaValorRequestDTO valores = new CategoriaValorRequestDTO();
        valores.categoria = categoria;
        valores.valorServicos = BigDecimal.valueOf(valorServicos);
        valores.valorPecas = BigDecimal.valueOf(valorPecas);
        dto.categoriaValores = List.of(valores);
        if (descontoPercentual != null) {
            dto.descontoTipo = "PERCENTUAL";
            dto.descontoValor = BigDecimal.valueOf(descontoPercentual);
        }
        return corpo(pedidos.criar(dto)).id;
    }

    private static ItemRequestDTO item(String descricao, String categoria, Integer quantidade) {
        ItemRequestDTO dto = new ItemRequestDTO();
        dto.descricao = descricao;
        dto.categoria = categoria;
        dto.quantidade = quantidade;
        return dto;
    }

    private void finalizar(Long pedidoId) {
        corpo(pedidos.finalizar(pedidoId));
    }

    private static <T> T corpo(org.springframework.http.ResponseEntity<T> resposta) {
        if (!resposta.getStatusCode().is2xxSuccessful() || resposta.getBody() == null) {
            throw new IllegalStateException("Falha ao montar os dados da demonstração: " + resposta.getStatusCode());
        }
        return resposta.getBody();
    }
}
