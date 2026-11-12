package org.example.repository;

import org.example.model.CabecoteModel;
import org.example.model.ClienteModel;
import org.example.model.EmpresaModel;
import org.example.model.PedidoModel;
import org.example.persistence.JPAUtil;
import org.hibernate.Hibernate;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.LockModeType;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;
import java.util.function.Function;

/**
 * Acesso a dados de {@link PedidoModel}.
 * Cada método abre e fecha seu próprio {@link EntityManager}, mantendo as
 * transações curtas e independentes. Toda leitura/exclusão é escopada pela
 * empresa (tenant) do usuário logado.
 */
public class PedidoRepository {

    /**
     * Insere ou atualiza um pedido (e suas entidades em cascata) e o retorna gerenciado.
     */
    public PedidoModel salvar(PedidoModel pedido) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            PedidoModel gerenciado = em.merge(pedido);
            tx.commit();
            return gerenciado;
        } catch (RuntimeException e) {
            if (tx.isActive()) {
                tx.rollback();
            }
            throw e;
        } finally {
            em.close();
        }
    }

    public PedidoModel buscarPorId(Long id, Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT p FROM PedidoModel p WHERE p.id = :id AND p.empresa.id = :empresaId", PedidoModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getResultStream().findFirst().orElse(null);
        } finally {
            em.close();
        }
    }

    /**
     * Busca um pedido já com cliente, serviços, peças, componentes e valores
     * por categoria carregados, para uso fora da transação (tela de
     * visualização). Não carrega a empresa do pedido — só o PDF usa, ver
     * {@link #buscarParaPdf}.
     */
    public PedidoModel buscarComItens(Long id, Long empresaId) {
        return buscarComItens(id, empresaId, false);
    }

    /** Igual a {@link #buscarComItens(Long, Long)}, mas já com a empresa (nome no cabeçalho do PDF). */
    public PedidoModel buscarParaPdf(Long id, Long empresaId) {
        return buscarComItens(id, empresaId, true);
    }

    private PedidoModel buscarComItens(Long id, Long empresaId, boolean comEmpresa) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return carregarComItens(em, id, empresaId, comEmpresa);
        } finally {
            em.close();
        }
    }

    /**
     * Carrega o pedido e todas as coleções no EntityManager informado. Cada
     * ida ao banco custa caro em produção (app e banco em regiões diferentes),
     * então: serviços vêm no mesmo JOIN FETCH do pedido, e o cliente vem
     * junto com a empresa dele (@ManyToOne EAGER em ClienteModel — sem o
     * fetch aqui virava um SELECT a mais só pra EMPRESA). Peças, componentes
     * e valores por categoria continuam em consultas próprias: o Hibernate
     * não permite JOIN FETCH de mais de uma List (bag) na mesma query
     * (MultipleBagFetchException).
     */
    private PedidoModel carregarComItens(EntityManager em, Long id, Long empresaId, boolean comEmpresa) {
        List<PedidoModel> resultado = em.createQuery(
                "SELECT p FROM PedidoModel p " +
                        "LEFT JOIN FETCH p.cliente c " +
                        "LEFT JOIN FETCH c.empresa " +
                        (comEmpresa ? "LEFT JOIN FETCH p.empresa " : "") +
                        "LEFT JOIN FETCH p.servicoList " +
                        "WHERE p.id = :id AND p.empresa.id = :empresaId", PedidoModel.class)
                .setParameter("id", id)
                .setParameter("empresaId", empresaId)
                .getResultList();
        if (resultado.isEmpty()) {
            return null;
        }
        PedidoModel pedido = resultado.get(0);
        Hibernate.initialize(pedido.getPecaList());
        Hibernate.initialize(pedido.getComponentes());
        Hibernate.initialize(pedido.getCategoriaValores());
        if (comEmpresa) {
            Hibernate.initialize(pedido.getEmpresa());
        }
        return pedido;
    }

    /**
     * Cria um pedido numa única transação/EntityManager: carrega empresa,
     * cliente e componentes (validados pelo tenant), aplica os campos,
     * persiste e devolve {@code mapear(pedido)} ainda com a sessão aberta —
     * sem reler do banco depois de salvar.
     */
    public <R> R criar(Long empresaId, Long clienteId, List<Long> componenteIds,
                       Consumer<PedidoModel> aplicar, Function<PedidoModel, R> mapear) {
        return emTransacao(em -> {
            PedidoModel pedido = new PedidoModel();
            ClienteModel cliente = resolverCliente(em, pedido, clienteId, empresaId);
            // O cliente já vem com a empresa (mesmo tenant, validado no WHERE) —
            // evita um SELECT só pra EMPRESA no caso comum.
            pedido.setEmpresa(cliente != null && cliente.getEmpresa() != null
                    ? cliente.getEmpresa()
                    : em.find(EmpresaModel.class, empresaId));
            pedido.setCliente(cliente);
            sincronizarComponentes(em, pedido, componenteIds, empresaId);
            aplicar.accept(pedido);
            em.persist(pedido);
            em.flush();
            return mapear.apply(pedido);
        });
    }

    /**
     * Atualiza um pedido existente numa única transação, sobre a entidade
     * gerenciada (sem merge de objeto destacado — o merge recarregava o grafo
     * inteiro). Cliente e componentes só são consultados se mudaram.
     * Retorna {@code null} se o pedido não existe nessa empresa.
     */
    public <R> R atualizar(Long id, Long empresaId, Long clienteId, List<Long> componenteIds,
                           Consumer<PedidoModel> aplicar, Function<PedidoModel, R> mapear) {
        return emTransacao(em -> {
            // Trava a linha (SELECT ... FOR UPDATE) e lê o estado atual antes de mexer em qualquer coisa:
            // um "finalizar" que chegue ao mesmo tempo espera esta transação, e um que já tenha terminado
            // aparece aqui. Pedido de outra empresa continua virando null (404), nunca 409.
            PedidoModel travado = travar(em, id, empresaId);
            if (travado == null) {
                return null;
            }
            if (travado.isFinalizado()) {
                throw new PedidoFinalizadoException(id);
            }
            PedidoModel pedido = carregarComItens(em, id, empresaId, false);
            if (pedido == null) {
                return null;
            }
            pedido.setCliente(resolverCliente(em, pedido, clienteId, empresaId));
            sincronizarComponentes(em, pedido, componenteIds, empresaId);
            aplicar.accept(pedido);
            em.flush();
            return mapear.apply(pedido);
        });
    }

    /**
     * Aplica uma alteração simples (sem mexer em cliente/componentes) num
     * pedido existente, numa única transação. Retorna {@code null} se o
     * pedido não existe nessa empresa.
     */
    public <R> R alterar(Long id, Long empresaId, Consumer<PedidoModel> aplicar, Function<PedidoModel, R> mapear) {
        return emTransacao(em -> {
            PedidoModel pedido = carregarComItens(em, id, empresaId, false);
            if (pedido == null) {
                return null;
            }
            aplicar.accept(pedido);
            em.flush();
            return mapear.apply(pedido);
        });
    }

    /** O pedido da empresa com a linha travada para escrita até o fim da transação; null se não existe nela. */
    private PedidoModel travar(EntityManager em, Long id, Long empresaId) {
        List<PedidoModel> resultado = em.createQuery(
                        "SELECT p FROM PedidoModel p WHERE p.id = :id AND p.empresa.id = :empresaId", PedidoModel.class)
                .setParameter("id", id)
                .setParameter("empresaId", empresaId)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList();
        return resultado.isEmpty() ? null : resultado.get(0);
    }

    private <R> R emTransacao(Function<EntityManager, R> trabalho) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            R resultado = trabalho.apply(em);
            tx.commit();
            return resultado;
        } catch (RuntimeException e) {
            if (tx.isActive()) {
                tx.rollback();
            }
            throw e;
        } finally {
            em.close();
        }
    }

    /**
     * Mesmo cliente de antes (e do mesmo tenant) → reaproveita sem consultar.
     * Outro cliente → busca validando a empresa; inexistente/de outra empresa
     * vira {@code null}, igual ao comportamento anterior.
     */
    private ClienteModel resolverCliente(EntityManager em, PedidoModel pedido, Long clienteId, Long empresaId) {
        if (clienteId == null) {
            return null;
        }
        ClienteModel atual = pedido.getCliente();
        if (atual != null && clienteId.equals(atual.getId())
                && atual.getEmpresa() != null && empresaId.equals(atual.getEmpresa().getId())) {
            return atual;
        }
        return em.createQuery(
                "SELECT c FROM ClienteModel c JOIN FETCH c.empresa e WHERE c.id = :id AND e.id = :empresaId",
                ClienteModel.class)
                .setParameter("id", clienteId)
                .setParameter("empresaId", empresaId)
                .getResultStream().findFirst().orElse(null);
    }

    /**
     * Deixa {@code pedido.componentes} igual aos ids pedidos (na ordem, e
     * ignorando ids inexistentes ou de outra empresa, como antes). Busca todos
     * numa consulta só (IN), e só mexe na coleção se o resultado mudou — a
     * tabela de junção é uma bag, qualquer mudança nela apaga e regrava tudo.
     */
    private void sincronizarComponentes(EntityManager em, PedidoModel pedido, List<Long> componenteIds, Long empresaId) {
        List<Long> desejados = componenteIds == null ? List.of()
                : componenteIds.stream().filter(Objects::nonNull).toList();
        List<Long> atuais = pedido.getComponentes().stream().map(CabecoteModel::getId).toList();
        if (atuais.equals(desejados)) {
            return;
        }
        Map<Long, CabecoteModel> porId = new HashMap<>();
        if (!desejados.isEmpty()) {
            em.createQuery(
                    "SELECT c FROM CabecoteModel c JOIN FETCH c.empresa e WHERE c.id IN :ids AND e.id = :empresaId",
                    CabecoteModel.class)
                    .setParameter("ids", new HashSet<>(desejados))
                    .setParameter("empresaId", empresaId)
                    .getResultList()
                    .forEach(c -> porId.put(c.getId(), c));
        }
        List<CabecoteModel> novos = new ArrayList<>();
        for (Long componenteId : desejados) {
            CabecoteModel componente = porId.get(componenteId);
            if (componente != null) {
                novos.add(componente);
            }
        }
        if (novos.stream().map(CabecoteModel::getId).toList().equals(atuais)) {
            return;
        }
        pedido.getComponentes().clear();
        pedido.getComponentes().addAll(novos);
    }

    /**
     * Lista todos os pedidos já com cliente e componentes carregados (evita
     * LazyInitializationException ao acessar fora da transação, como na
     * tabela da tela inicial).
     */
    public List<PedidoModel> listarTodos(Long empresaId) {
        return listar(empresaId, false);
    }

    /** Só os não finalizados (datEntrega nula) — listagem do dia a dia e dashboard. */
    public List<PedidoModel> listarAbertos(Long empresaId) {
        return listar(empresaId, true);
    }

    private List<PedidoModel> listar(Long empresaId, boolean apenasAbertos) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT DISTINCT p FROM PedidoModel p " +
                            "LEFT JOIN FETCH p.cliente c " +
                            "LEFT JOIN FETCH c.empresa " +
                            "LEFT JOIN FETCH p.componentes " +
                            "WHERE p.empresa.id = :empresaId" +
                            (apenasAbertos ? " AND p.datEntrega IS NULL" : ""),
                    PedidoModel.class)
                    .setParameter("empresaId", empresaId)
                    .getResultList();
        } finally {
            em.close();
        }
    }

    /**
     * Lista os pedidos encerrados (com data de entrega registrada), mais recentes
     * primeiro, com cliente e componentes carregados para exibição.
     */
    public List<PedidoModel> listarEncerrados(Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            List<PedidoModel> resultado = em.createQuery(
                    "SELECT DISTINCT p FROM PedidoModel p " +
                            "LEFT JOIN FETCH p.cliente c " +
                            "LEFT JOIN FETCH c.empresa " +
                            "LEFT JOIN FETCH p.componentes " +
                            "WHERE p.datEntrega IS NOT NULL AND p.empresa.id = :empresaId " +
                            "ORDER BY p.datEntrega DESC", PedidoModel.class)
                    .setParameter("empresaId", empresaId)
                    .getResultList();
            // O chamador (relatório de encerrados) soma categoriaValores por
            // pedido — inicializa ainda dentro da sessão (categoriaValores é
            // LAZY + BatchSize, então isso vira poucas queries em lote, não
            // uma por pedido).
            for (PedidoModel p : resultado) {
                p.getCategoriaValores().size();
            }
            return resultado;
        } finally {
            em.close();
        }
    }

    /**
     * PEDIDO_CATEGORIA é a tabela antiga de "categorias do pedido" (só a lista,
     * de antes do valor por categoria — hoje em PEDIDO_CATEGORIA_VALOR). O
     * sistema não usa mais, mas pedidos criados naquela época ainda têm linhas
     * lá presas pela chave estrangeira, e aí excluir o pedido falhava (erro
     * 500). Em banco criado depois, a tabela nem existe — por isso a checagem.
     * Também usada pela limpeza das empresas de demonstração (EmpresaDemoRepository).
     */
    static void apagarCategoriasLegadas(EntityManager em, Long pedidoId) {
        Object tabela = em.createNativeQuery("SELECT CAST(to_regclass('pedido_categoria') AS text)").getSingleResult();
        if (tabela != null) {
            em.createNativeQuery("DELETE FROM pedido_categoria WHERE pedido_id = ?1")
                    .setParameter(1, pedidoId)
                    .executeUpdate();
        }
    }

    public void deletar(Long id, Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            PedidoModel pedido = em.createQuery(
                    "SELECT p FROM PedidoModel p WHERE p.id = :id AND p.empresa.id = :empresaId", PedidoModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getResultStream().findFirst().orElse(null);
            if (pedido != null) {
                apagarCategoriasLegadas(em, pedido.getId());
                em.remove(pedido);
            }
            tx.commit();
        } catch (RuntimeException e) {
            if (tx.isActive()) {
                tx.rollback();
            }
            throw e;
        } finally {
            em.close();
        }
    }

    public long contar() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery("SELECT COUNT(p) FROM PedidoModel p", Long.class)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }
}
