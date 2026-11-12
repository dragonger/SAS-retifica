package org.example.backend.web;

import org.example.backend.dto.*;
import org.example.backend.security.SecurityUtils;
import org.example.model.*;
import org.example.repository.PedidoFinalizadoException;
import org.example.repository.PedidoRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * API REST de pedidos, usada pela página web/mobile. Reaproveita os mesmos
 * repositórios (portanto o mesmo banco) que o app desktop.
 */
@RestController
@RequestMapping("/api/pedidos")
public class PedidoController {

    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final DateTimeFormatter DIA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final Locale PT_BR = new Locale("pt", "BR");
    private static final DateTimeFormatter MES_FORMAT = DateTimeFormatter.ofPattern("MMMM 'de' yyyy", PT_BR);

    private final PedidoRepository pedidoRepository = new PedidoRepository();
    private final OrcamentoPdfGerador orcamentoPdfGerador;

    public PedidoController(OrcamentoPdfGerador orcamentoPdfGerador) {
        this.orcamentoPdfGerador = orcamentoPdfGerador;
    }

    @GetMapping
    public List<PedidoResumoDTO> listar(@RequestParam(name = "abertos", defaultValue = "false") boolean abertos) {
        Long empresaId = SecurityUtils.empresaAtual();
        List<PedidoResumoDTO> resultado = new ArrayList<>();
        for (PedidoModel pedido : abertos ? pedidoRepository.listarAbertos(empresaId) : pedidoRepository.listarTodos(empresaId)) {
            resultado.add(toResumo(pedido));
        }
        return resultado;
    }

    @GetMapping("/dashboard")
    public DashboardDTO dashboard() {
        LocalDate hoje = LocalDate.now();
        DashboardDTO dto = new DashboardDTO();
        dto.entregasHoje = new ArrayList<>();

        for (PedidoModel pedido : pedidoRepository.listarAbertos(SecurityUtils.empresaAtual())) {
            if (pedido.isFinalizado()) {
                continue;
            }
            dto.abertos++;
            if (pedido.getStatus() == StatusPedido.PRONTO) {
                dto.prontos++;
            }
            boolean atrasado = pedido.getDatEntregaEstimada() != null && pedido.getDatEntregaEstimada().isBefore(hoje);
            if (atrasado) {
                dto.atrasados++;
            }
            if (hoje.equals(pedido.getDatEntregaEstimada())) {
                dto.hoje++;
                dto.entregasHoje.add(toResumo(pedido));
            }
        }
        return dto;
    }

    @GetMapping("/encerrados")
    public List<MesEncerradosDTO> encerrados() {
        Long empresaId = SecurityUtils.empresaAtual();

        Map<YearMonth, List<PedidoModel>> porMes = new LinkedHashMap<>();
        for (PedidoModel pedido : pedidoRepository.listarEncerrados(empresaId)) {
            YearMonth mes = YearMonth.from(pedido.getDatEntrega());
            porMes.computeIfAbsent(mes, k -> new ArrayList<>()).add(pedido);
        }

        List<MesEncerradosDTO> grupos = new ArrayList<>();
        for (Map.Entry<YearMonth, List<PedidoModel>> entrada : porMes.entrySet()) {
            MesEncerradosDTO grupo = new MesEncerradosDTO();
            grupo.mes = capitalizar(entrada.getKey().format(MES_FORMAT));
            grupo.pedidos = new ArrayList<>();
            BigDecimal total = BigDecimal.ZERO;
            Map<String, BigDecimal> porCliente = new LinkedHashMap<>();
            Map<String, BigDecimal> porCategoria = new LinkedHashMap<>();
            for (PedidoModel p : entrada.getValue()) {
                grupo.pedidos.add(toResumo(p));
                BigDecimal valorPedido = p.getTotalGeral() != null ? p.getTotalGeral() : BigDecimal.ZERO;
                total = total.add(valorPedido);

                String nomeCliente = p.getCliente() != null ? p.getCliente().getNome() : "-";
                porCliente.merge(nomeCliente, valorPedido, BigDecimal::add);

                for (PedidoCategoriaModel cv : p.getCategoriaValores()) {
                    String rotulo = cv.getCategoria() != null ? cv.getCategoria().getRotulo() : "-";
                    porCategoria.merge(rotulo, cv.getValorTotal(), BigDecimal::add);
                }
            }
            grupo.quantidade = grupo.pedidos.size();
            grupo.total = total;
            grupo.porCliente = paraLista(porCliente);
            grupo.porCategoria = paraLista(porCategoria);
            grupos.add(grupo);
        }
        return grupos;
    }

    private List<AgregadoValorDTO> paraLista(Map<String, BigDecimal> mapa) {
        return mapa.entrySet().stream()
                .map(e -> {
                    AgregadoValorDTO dto = new AgregadoValorDTO();
                    dto.descricao = e.getKey();
                    dto.total = e.getValue();
                    return dto;
                })
                .sorted((a, b) -> b.total.compareTo(a.total))
                .collect(Collectors.toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PedidoDetalheDTO> buscar(@PathVariable Long id) {
        PedidoModel pedido = pedidoRepository.buscarComItens(id, SecurityUtils.empresaAtual());
        if (pedido == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(toDetalhe(pedido));
    }

    @PostMapping
    public ResponseEntity<PedidoDetalheDTO> criar(@RequestBody PedidoRequestDTO request) {
        if (request.clienteId == null || temValorInvalido(request)) {
            return ResponseEntity.badRequest().build();
        }
        // Tudo numa transação só (ver PedidoRepository.criar): antes eram
        // vários EntityManagers separados (empresa, cada componente, cliente,
        // salvar, reler) e cada um custava idas ao banco.
        PedidoDetalheDTO dto = pedidoRepository.criar(
                SecurityUtils.empresaAtual(), request.clienteId, request.componenteIds,
                pedido -> {
                    pedido.setDatCriacao(LocalDateTime.now());
                    aplicarRequest(pedido, request);
                },
                this::toDetalhe);
        return ResponseEntity.ok(dto);
    }

    /** Pedido finalizado não é editável: responde 409 com a mensagem para a tela (a tela já esconde "Editar"). */
    @PutMapping("/{id}")
    public ResponseEntity<?> atualizar(@PathVariable Long id, @RequestBody PedidoRequestDTO request) {
        if (request.clienteId == null || temValorInvalido(request)) {
            return ResponseEntity.badRequest().build();
        }
        PedidoDetalheDTO dto;
        try {
            dto = pedidoRepository.atualizar(
                    id, SecurityUtils.empresaAtual(), request.clienteId, request.componenteIds,
                    pedido -> aplicarRequest(pedido, request),
                    this::toDetalhe);
        } catch (PedidoFinalizadoException e) {
            return ResponseEntity.status(409).body(Map.of("erro", MSG_PEDIDO_FINALIZADO));
        }
        return dto == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(dto);
    }

    static final String MSG_PEDIDO_FINALIZADO = "Este pedido já foi finalizado e não pode mais ser editado.";

    @PostMapping("/{id}/finalizar")
    public ResponseEntity<PedidoDetalheDTO> finalizar(@PathVariable Long id) {
        PedidoDetalheDTO dto = pedidoRepository.alterar(
                id, SecurityUtils.empresaAtual(),
                pedido -> {
                    if (!pedido.isFinalizado()) {
                        pedido.setDatEntrega(LocalDateTime.now());
                    }
                },
                this::toDetalhe);
        return dto == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletar(@PathVariable Long id) {
        pedidoRepository.deletar(id, SecurityUtils.empresaAtual());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable Long id) {
        OrcamentoPdfGerador.Orcamento orcamento = orcamentoPdfGerador.gerar(id, SecurityUtils.empresaAtual());
        if (orcamento == null) {
            return ResponseEntity.notFound().build();
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("inline", "orcamento-" + id + ".pdf");
        return ResponseEntity.ok().headers(headers).body(orcamento.pdf());
    }

    /**
     * Copia o request pro pedido gerenciado (cliente e componentes já foram
     * resolvidos pelo repositório). Serviços, peças e valores por categoria
     * são sincronizados por prefixo em vez de apagar e reinserir tudo: os
     * itens iniciais que continuam iguais (na mesma posição) são mantidos, e
     * só a partir da primeira diferença os antigos saem e os novos entram.
     * O resultado final e a ordem são os mesmos de antes (ordem = id, ver
     * @OrderBy em PedidoModel), com bem menos DELETE/INSERT.
     */
    /**
     * Valores negativos (ou quantidade menor que 1) nunca fazem sentido num
     * orçamento; texto maior que a coluna faria o banco recusar com erro 500.
     */
    private static boolean temValorInvalido(PedidoRequestDTO request) {
        if (negativo(request.descontoValor)) {
            return true;
        }
        if (longo(request.pedidoDescricao, 255) || longo(request.observacao, 2000)) {
            return true;
        }
        for (List<ItemRequestDTO> itens : Arrays.asList(request.servicos, request.pecas)) {
            if (itens != null && itens.stream().anyMatch(i -> i != null && longo(i.descricao, 255))) {
                return true;
            }
        }
        if (request.categoriaValores != null) {
            for (CategoriaValorRequestDTO cv : request.categoriaValores) {
                if (cv != null && (negativo(cv.valorServicos) || negativo(cv.valorPecas))) {
                    return true;
                }
            }
        }
        if (request.pecas != null) {
            for (ItemRequestDTO peca : request.pecas) {
                if (peca != null && peca.quantidade != null && peca.quantidade < 1) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean longo(String texto, int maximo) {
        return texto != null && texto.length() > maximo;
    }

    private static boolean negativo(BigDecimal valor) {
        return valor != null && valor.signum() < 0;
    }

    private void aplicarRequest(PedidoModel pedido, PedidoRequestDTO request) {
        pedido.setPedido(request.pedidoDescricao);
        pedido.setObservacao(request.observacao);
        pedido.setStatus(parseStatus(request.status));
        pedido.setDatEntregaEstimada(
                request.datEntregaEstimada != null && !request.datEntregaEstimada.isBlank()
                        ? LocalDate.parse(request.datEntregaEstimada) : null);

        sincronizarCategorias(pedido, parseCategoriaValores(request.categoriaValores));
        sincronizarServicos(pedido, request.servicos);
        sincronizarPecas(pedido, request.pecas);

        pedido.setDescontoTipo(parseTipoDesconto(request.descontoTipo));
        BigDecimal descontoValor = pedido.getDescontoTipo() != null ? escala2(request.descontoValor) : null;
        if (!mesmoValor(pedido.getDescontoValor(), descontoValor)) {
            pedido.setDescontoValor(descontoValor);
        }
        pedido.recalcularTotal();
    }

    private void sincronizarCategorias(PedidoModel pedido, List<PedidoCategoriaModel> desejadas) {
        List<PedidoCategoriaModel> atuais = pedido.getCategoriaValores();
        int i = 0;
        while (i < atuais.size() && i < desejadas.size()
                && atuais.get(i).getCategoria() == desejadas.get(i).getCategoria()) {
            PedidoCategoriaModel atual = atuais.get(i);
            PedidoCategoriaModel nova = desejadas.get(i);
            if (!mesmoValor(atual.getValorServicos(), nova.getValorServicos())) {
                atual.setValorServicos(nova.getValorServicos());
            }
            if (!mesmoValor(atual.getValorPecas(), nova.getValorPecas())) {
                atual.setValorPecas(nova.getValorPecas());
            }
            i++;
        }
        removerAPartirDe(atuais, i);
        for (int j = i; j < desejadas.size(); j++) {
            pedido.addCategoriaValor(desejadas.get(j));
        }
    }

    private void sincronizarServicos(PedidoModel pedido, List<ItemRequestDTO> itens) {
        List<ItemRequestDTO> desejados = new ArrayList<>();
        if (itens != null) {
            for (ItemRequestDTO item : itens) {
                if (item.descricao != null && !item.descricao.isBlank()) {
                    desejados.add(item);
                }
            }
        }
        List<ServicoModel> atuais = pedido.getServicoList();
        int i = 0;
        while (i < atuais.size() && i < desejados.size()
                && Objects.equals(atuais.get(i).getDescricao(), desejados.get(i).descricao)
                && atuais.get(i).getCategoria() == parseCategoriaItem(desejados.get(i).categoria)) {
            i++;
        }
        removerAPartirDe(atuais, i);
        for (int j = i; j < desejados.size(); j++) {
            ServicoModel linha = new ServicoModel();
            linha.setDescricao(desejados.get(j).descricao);
            linha.setCategoria(parseCategoriaItem(desejados.get(j).categoria));
            pedido.addServico(linha);
        }
    }

    /** Categoria de um serviço/peça do request; nula quando ausente ou desconhecida. */
    private static CategoriaProduto parseCategoriaItem(String nome) {
        if (nome == null || nome.isBlank()) {
            return null;
        }
        try {
            return CategoriaProduto.valueOf(nome);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private void sincronizarPecas(PedidoModel pedido, List<ItemRequestDTO> itens) {
        List<ItemRequestDTO> desejadas = new ArrayList<>();
        if (itens != null) {
            for (ItemRequestDTO item : itens) {
                if (item.descricao != null && !item.descricao.isBlank()) {
                    desejadas.add(item);
                }
            }
        }
        List<PecaModel> atuais = pedido.getPecaList();
        int i = 0;
        while (i < atuais.size() && i < desejadas.size()
                && Objects.equals(atuais.get(i).getDescricao(), desejadas.get(i).descricao)
                && atuais.get(i).getCategoria() == parseCategoriaItem(desejadas.get(i).categoria)) {
            Integer quantidade = desejadas.get(i).quantidade != null ? desejadas.get(i).quantidade : 1;
            if (!quantidade.equals(atuais.get(i).getQuantidade())) {
                atuais.get(i).setQuantidade(quantidade);
            }
            i++;
        }
        removerAPartirDe(atuais, i);
        for (int j = i; j < desejadas.size(); j++) {
            ItemRequestDTO item = desejadas.get(j);
            PecaModel linha = new PecaModel();
            linha.setDescricao(item.descricao);
            linha.setQuantidade(item.quantidade != null ? item.quantidade : 1);
            linha.setCategoria(parseCategoriaItem(item.categoria));
            pedido.addPeca(linha);
        }
    }

    /** Remove do fim da lista até sobrar {@code tamanho} itens (orphanRemoval apaga no banco). */
    private static void removerAPartirDe(List<?> lista, int tamanho) {
        while (lista.size() > tamanho) {
            lista.remove(lista.size() - 1);
        }
    }

    /**
     * Normaliza pra 2 casas (mesma escala das colunas numeric(19,2)): o valor
     * em memória fica igual ao que o banco gravaria, a resposta sai igual à
     * releitura de antes, e a comparação abaixo não vê 10 ≠ 10.00.
     */
    private static BigDecimal escala2(BigDecimal valor) {
        return valor != null ? valor.setScale(2, RoundingMode.HALF_UP) : null;
    }

    private static boolean mesmoValor(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }

    private TipoDesconto parseTipoDesconto(String nome) {
        if (nome == null || nome.isBlank()) {
            return null;
        }
        try {
            return TipoDesconto.valueOf(nome);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private List<PedidoCategoriaModel> parseCategoriaValores(List<CategoriaValorRequestDTO> dtos) {
        List<PedidoCategoriaModel> resultado = new ArrayList<>();
        if (dtos == null) {
            return resultado;
        }
        for (CategoriaValorRequestDTO dto : dtos) {
            if (dto == null || dto.categoria == null) {
                continue;
            }
            CategoriaProduto categoria;
            try {
                categoria = CategoriaProduto.valueOf(dto.categoria);
            } catch (IllegalArgumentException ignored) {
                continue;
            }
            PedidoCategoriaModel categoriaValor = new PedidoCategoriaModel();
            categoriaValor.setCategoria(categoria);
            categoriaValor.setValorServicos(escala2(dto.valorServicos));
            categoriaValor.setValorPecas(escala2(dto.valorPecas));
            resultado.add(categoriaValor);
        }
        return resultado;
    }

    private StatusPedido parseStatus(String nome) {
        if (nome == null) {
            return StatusPedido.ABERTO;
        }
        try {
            return StatusPedido.valueOf(nome);
        } catch (IllegalArgumentException e) {
            return StatusPedido.ABERTO;
        }
    }

    private PedidoResumoDTO toResumo(PedidoModel pedido) {
        PedidoResumoDTO dto = new PedidoResumoDTO();
        dto.id = pedido.getId();
        dto.clienteId = pedido.getCliente() != null ? pedido.getCliente().getId() : null;
        dto.clienteNome = pedido.getCliente() != null ? pedido.getCliente().getNome() : null;
        dto.componentesResumo = resumoComponentes(pedido);
        dto.finalizado = pedido.isFinalizado();
        dto.atrasado = situacaoAtrasado(pedido);
        dto.status = pedido.getStatus().name();
        dto.situacao = situacaoLabel(pedido, dto.atrasado);
        if (pedido.getDatEntrega() != null) {
            dto.dataEntrega = pedido.getDatEntrega().toLocalDate().format(DIA);
        } else if (pedido.getDatEntregaEstimada() != null) {
            dto.dataEntrega = pedido.getDatEntregaEstimada().format(DIA);
        }
        dto.totalGeral = pedido.getTotalGeral();
        return dto;
    }

    private String resumoComponentes(PedidoModel pedido) {
        if (pedido.getComponentes().isEmpty()) {
            return pedido.getPedido();
        }
        List<String> nomes = new ArrayList<>();
        for (CabecoteModel componente : pedido.getComponentes()) {
            nomes.add(componente.getNome());
        }
        return String.join(", ", nomes);
    }

    private boolean situacaoAtrasado(PedidoModel pedido) {
        return !pedido.isFinalizado() && pedido.getDatEntregaEstimada() != null
                && pedido.getDatEntregaEstimada().isBefore(LocalDate.now());
    }

    private String situacaoLabel(PedidoModel pedido, boolean atrasado) {
        if (pedido.isFinalizado()) {
            return "Finalizado";
        }
        if (atrasado) {
            return "Atrasado";
        }
        return pedido.getStatus().getRotulo();
    }

    private PedidoDetalheDTO toDetalhe(PedidoModel pedido) {
        PedidoDetalheDTO dto = new PedidoDetalheDTO();
        dto.id = pedido.getId();
        dto.pedidoDescricao = pedido.getPedido();
        dto.observacao = pedido.getObservacao();
        dto.datCriacao = pedido.getDatCriacao() != null ? pedido.getDatCriacao().format(DATA_HORA) : null;
        dto.datEntregaEstimada = pedido.getDatEntregaEstimada() != null
                ? pedido.getDatEntregaEstimada().toString() : null;
        dto.datEntrega = pedido.getDatEntrega() != null ? pedido.getDatEntrega().format(DATA_HORA) : null;
        dto.finalizado = pedido.isFinalizado();
        dto.atrasado = situacaoAtrasado(pedido);
        dto.status = pedido.getStatus().name();
        dto.situacao = situacaoLabel(pedido, dto.atrasado);
        dto.subtotal = pedido.getSubtotal();
        dto.descontoTipo = pedido.getDescontoTipo() != null ? pedido.getDescontoTipo().name() : null;
        dto.descontoValor = pedido.getDescontoValor();
        dto.totalGeral = pedido.getTotalGeral();

        dto.componentes = new ArrayList<>();
        for (CabecoteModel componente : pedido.getComponentes()) {
            CabecoteDTO c = new CabecoteDTO();
            c.id = componente.getId();
            c.categoria = componente.getCategoria().name();
            c.categoriaRotulo = componente.getCategoria().getRotulo();
            c.nome = componente.getNome();
            c.movelFaixa = componente.getMovelFaixa();
            c.fixoFaixa = componente.getFixoFaixa();
            dto.componentes.add(c);
        }

        dto.categoriaValores = new ArrayList<>();
        for (PedidoCategoriaModel cv : pedido.getCategoriaValores()) {
            CategoriaValorDTO categoriaValor = new CategoriaValorDTO();
            categoriaValor.categoria = cv.getCategoria() != null ? cv.getCategoria().name() : null;
            categoriaValor.categoriaRotulo = cv.getCategoria() != null ? cv.getCategoria().getRotulo() : null;
            categoriaValor.valorServicos = cv.getValorServicos();
            categoriaValor.valorPecas = cv.getValorPecas();
            categoriaValor.valorTotal = cv.getValorTotal();
            dto.categoriaValores.add(categoriaValor);
        }

        if (pedido.getCliente() != null) {
            ClienteDTO c = new ClienteDTO();
            c.id = pedido.getCliente().getId();
            c.nome = pedido.getCliente().getNome();
            c.telefone = pedido.getCliente().getTelefone();
            c.rua = pedido.getCliente().getRua();
            c.numero = pedido.getCliente().getNumero();
            c.bairro = pedido.getCliente().getBairro();
            c.cep = pedido.getCliente().getCep();
            c.municipio = pedido.getCliente().getMunicipio();
            c.uf = pedido.getCliente().getUf();
            dto.cliente = c;
        }

        dto.servicos = new ArrayList<>();
        for (ServicoModel s : pedido.getServicoList()) {
            ItemDTO item = new ItemDTO();
            item.id = s.getId();
            item.descricao = s.getDescricao();
            item.categoria = s.getCategoria() != null ? s.getCategoria().name() : null;
            dto.servicos.add(item);
        }

        dto.pecas = new ArrayList<>();
        for (PecaModel p : pedido.getPecaList()) {
            ItemDTO item = new ItemDTO();
            item.id = p.getId();
            item.descricao = p.getDescricao();
            item.quantidade = p.getQuantidade();
            item.categoria = p.getCategoria() != null ? p.getCategoria().name() : null;
            dto.pecas.add(item);
        }

        return dto;
    }

    private String capitalizar(String texto) {
        if (texto == null || texto.isEmpty()) {
            return texto;
        }
        return Character.toUpperCase(texto.charAt(0)) + texto.substring(1);
    }
}
