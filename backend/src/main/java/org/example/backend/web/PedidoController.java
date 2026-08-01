package org.example.backend.web;

import org.example.backend.dto.*;
import org.example.backend.security.SecurityUtils;
import org.example.model.*;
import org.example.repository.CabecoteRepository;
import org.example.repository.ClienteRepository;
import org.example.repository.EmpresaRepository;
import org.example.repository.PedidoRepository;
import org.example.service.PedidoPdfService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
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
    private final CabecoteRepository cabecoteRepository = new CabecoteRepository();
    private final ClienteRepository clienteRepository = new ClienteRepository();
    private final EmpresaRepository empresaRepository = new EmpresaRepository();
    private final PedidoPdfService pdfService = new PedidoPdfService();

    @GetMapping
    public List<PedidoResumoDTO> listar() {
        List<PedidoResumoDTO> resultado = new ArrayList<>();
        for (PedidoModel pedido : pedidoRepository.listarTodos(SecurityUtils.empresaAtual())) {
            resultado.add(toResumo(pedido));
        }
        return resultado;
    }

    @GetMapping("/dashboard")
    public DashboardDTO dashboard() {
        LocalDate hoje = LocalDate.now();
        DashboardDTO dto = new DashboardDTO();
        dto.entregasHoje = new ArrayList<>();

        for (PedidoModel pedido : pedidoRepository.listarTodos(SecurityUtils.empresaAtual())) {
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
        Map<Long, List<ServicoModel>> servicosPorPedido = pedidoRepository.listarItensServicoEncerrados(empresaId).stream()
                .collect(Collectors.groupingBy(s -> s.getPedido().getId()));

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
            Map<String, BigDecimal> porServico = new LinkedHashMap<>();
            for (PedidoModel p : entrada.getValue()) {
                grupo.pedidos.add(toResumo(p));
                BigDecimal valorPedido = p.getTotalGeral() != null ? p.getTotalGeral() : BigDecimal.ZERO;
                total = total.add(valorPedido);

                String nomeCliente = p.getCliente() != null ? p.getCliente().getNome() : "-";
                porCliente.merge(nomeCliente, valorPedido, BigDecimal::add);

                for (ServicoModel s : servicosPorPedido.getOrDefault(p.getId(), List.of())) {
                    porServico.merge(s.getDescricao(), s.getValorTotal(), BigDecimal::add);
                }
            }
            grupo.quantidade = grupo.pedidos.size();
            grupo.total = total;
            grupo.porCliente = paraLista(porCliente);
            grupo.porServico = paraLista(porServico);
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
        if (request.clienteId == null) {
            return ResponseEntity.badRequest().build();
        }
        Long empresaId = SecurityUtils.empresaAtual();
        PedidoModel pedido = new PedidoModel();
        pedido.setEmpresa(empresaRepository.buscarPorId(empresaId));
        pedido.setDatCriacao(LocalDateTime.now());
        aplicarRequest(pedido, request, empresaId);
        PedidoModel salvo = pedidoRepository.salvar(pedido);
        return ResponseEntity.ok(toDetalhe(pedidoRepository.buscarComItens(salvo.getId(), empresaId)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<PedidoDetalheDTO> atualizar(@PathVariable Long id, @RequestBody PedidoRequestDTO request) {
        if (request.clienteId == null) {
            return ResponseEntity.badRequest().build();
        }
        Long empresaId = SecurityUtils.empresaAtual();
        PedidoModel pedido = pedidoRepository.buscarComItens(id, empresaId);
        if (pedido == null) {
            return ResponseEntity.notFound().build();
        }
        aplicarRequest(pedido, request, empresaId);
        PedidoModel salvo = pedidoRepository.salvar(pedido);
        return ResponseEntity.ok(toDetalhe(pedidoRepository.buscarComItens(salvo.getId(), empresaId)));
    }

    @PostMapping("/{id}/finalizar")
    public ResponseEntity<PedidoDetalheDTO> finalizar(@PathVariable Long id) {
        Long empresaId = SecurityUtils.empresaAtual();
        PedidoModel pedido = pedidoRepository.buscarComItens(id, empresaId);
        if (pedido == null) {
            return ResponseEntity.notFound().build();
        }
        if (!pedido.isFinalizado()) {
            pedido.setDatEntrega(LocalDateTime.now());
            pedidoRepository.salvar(pedido);
        }
        return ResponseEntity.ok(toDetalhe(pedidoRepository.buscarComItens(id, empresaId)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletar(@PathVariable Long id) {
        pedidoRepository.deletar(id, SecurityUtils.empresaAtual());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable Long id) {
        PedidoModel pedido = pedidoRepository.buscarComItens(id, SecurityUtils.empresaAtual());
        if (pedido == null) {
            return ResponseEntity.notFound().build();
        }
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        pdfService.gerar(pedido, saida);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("inline", "orcamento-" + id + ".pdf");
        return ResponseEntity.ok().headers(headers).body(saida.toByteArray());
    }

    private void aplicarRequest(PedidoModel pedido, PedidoRequestDTO request, Long empresaId) {
        pedido.setPedido(request.pedidoDescricao);
        pedido.setObservacao(request.observacao);
        pedido.setStatus(parseStatus(request.status));
        pedido.setDatEntregaEstimada(
                request.datEntregaEstimada != null && !request.datEntregaEstimada.isBlank()
                        ? LocalDate.parse(request.datEntregaEstimada) : null);

        List<CabecoteModel> componentes = new ArrayList<>();
        if (request.componenteIds != null) {
            for (Long componenteId : request.componenteIds) {
                CabecoteModel componente = cabecoteRepository.buscarPorId(componenteId, empresaId);
                if (componente != null) {
                    componentes.add(componente);
                }
            }
        }
        pedido.setComponentes(componentes);
        pedido.setCliente(clienteRepository.buscarPorId(request.clienteId, empresaId));
        pedido.setCategorias(parseCategorias(request.categorias));

        pedido.getServicoList().clear();
        if (request.servicos != null) {
            for (ItemRequestDTO item : request.servicos) {
                if (item.descricao == null || item.descricao.isBlank()) {
                    continue;
                }
                ServicoModel linha = new ServicoModel();
                linha.setDescricao(item.descricao);
                linha.setValorUnitario(item.valorUnitario);
                linha.setQuantidade(item.quantidade != null ? item.quantidade : 1);
                pedido.addServico(linha);
            }
        }

        pedido.getPecaList().clear();
        if (request.pecas != null) {
            for (ItemRequestDTO item : request.pecas) {
                if (item.descricao == null || item.descricao.isBlank()) {
                    continue;
                }
                PecaModel linha = new PecaModel();
                linha.setDescricao(item.descricao);
                linha.setValorUnitario(item.valorUnitario);
                linha.setQuantidade(item.quantidade != null ? item.quantidade : 1);
                pedido.addPeca(linha);
            }
        }

        pedido.setDescontoTipo(parseTipoDesconto(request.descontoTipo));
        pedido.setDescontoValor(pedido.getDescontoTipo() != null ? request.descontoValor : null);
        pedido.recalcularTotal();
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

    private Set<CategoriaProduto> parseCategorias(List<String> nomes) {
        Set<CategoriaProduto> resultado = new HashSet<>();
        if (nomes == null) {
            return resultado;
        }
        for (String nome : nomes) {
            try {
                resultado.add(CategoriaProduto.valueOf(nome));
            } catch (IllegalArgumentException | NullPointerException ignored) {
                // ignora valor inválido
            }
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

        dto.categorias = new ArrayList<>();
        for (CategoriaProduto categoria : pedido.getCategorias()) {
            dto.categorias.add(categoria.name());
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
            item.quantidade = s.getQuantidade();
            item.valorUnitario = s.getValorUnitario();
            item.valorTotal = s.getValorTotal();
            dto.servicos.add(item);
        }

        dto.pecas = new ArrayList<>();
        for (PecaModel p : pedido.getPecaList()) {
            ItemDTO item = new ItemDTO();
            item.id = p.getId();
            item.descricao = p.getDescricao();
            item.quantidade = p.getQuantidade();
            item.valorUnitario = p.getValorUnitario();
            item.valorTotal = p.getValorTotal();
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
