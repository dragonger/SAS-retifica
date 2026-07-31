package org.example.repository;

import org.example.model.PedidoModel;
import org.example.model.ServicoModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import java.util.List;

/**
 * Acesso a dados de {@link PedidoModel}.
 * Cada método abre e fecha seu próprio {@link EntityManager}, mantendo as
 * transações curtas e independentes.
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

    public PedidoModel buscarPorId(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.find(PedidoModel.class, id);
        } finally {
            em.close();
        }
    }

    /**
     * Busca um pedido já com cliente, serviços, peças e componentes carregados,
     * para uso fora da transação (telas de visualização/edição). Faz fetch dos
     * serviços via JOIN e inicializa peças/componentes na mesma sessão (evita
     * MultipleBagFetchException — o Hibernate não permite fazer JOIN FETCH de
     * duas coleções ao mesmo tempo na mesma query).
     */
    public PedidoModel buscarComItens(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            List<PedidoModel> resultado = em.createQuery(
                    "SELECT p FROM PedidoModel p " +
                            "LEFT JOIN FETCH p.cliente " +
                            "LEFT JOIN FETCH p.servicoList " +
                            "WHERE p.id = :id", PedidoModel.class)
                    .setParameter("id", id)
                    .getResultList();
            if (resultado.isEmpty()) {
                return null;
            }
            PedidoModel pedido = resultado.get(0);
            // Inicializa peças e componentes ainda dentro da sessão.
            pedido.getPecaList().size();
            pedido.getComponentes().size();
            return pedido;
        } finally {
            em.close();
        }
    }

    /**
     * Lista todos os pedidos já com cliente e componentes carregados (evita
     * LazyInitializationException ao acessar fora da transação, como na
     * tabela da tela inicial).
     */
    public List<PedidoModel> listarTodos() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT DISTINCT p FROM PedidoModel p " +
                            "LEFT JOIN FETCH p.cliente " +
                            "LEFT JOIN FETCH p.componentes",
                    PedidoModel.class).getResultList();
        } finally {
            em.close();
        }
    }

    /**
     * Lista os pedidos encerrados (com data de entrega registrada), mais recentes
     * primeiro, com cliente e componentes carregados para exibição.
     */
    public List<PedidoModel> listarEncerrados() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT DISTINCT p FROM PedidoModel p " +
                            "LEFT JOIN FETCH p.cliente " +
                            "LEFT JOIN FETCH p.componentes " +
                            "WHERE p.datEntrega IS NOT NULL " +
                            "ORDER BY p.datEntrega DESC", PedidoModel.class)
                    .getResultList();
        } finally {
            em.close();
        }
    }

    /**
     * Itens de serviço de todos os pedidos encerrados, com o pedido já
     * carregado (relação ManyToOne, sem risco de MultipleBagFetchException),
     * para agregar valores por serviço sem tocar na coleção lazy
     * {@code PedidoModel.servicoList} fora da sessão.
     */
    public List<ServicoModel> listarItensServicoEncerrados() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT s FROM ServicoModel s " +
                            "LEFT JOIN FETCH s.pedido p " +
                            "WHERE p.datEntrega IS NOT NULL", ServicoModel.class)
                    .getResultList();
        } finally {
            em.close();
        }
    }

    public void deletar(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            PedidoModel pedido = em.find(PedidoModel.class, id);
            if (pedido != null) {
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
