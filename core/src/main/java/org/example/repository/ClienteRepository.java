package org.example.repository;

import org.example.model.ClienteModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.NoResultException;
import java.util.List;

/**
 * Acesso a dados de {@link ClienteModel} (cadastro reutilizável entre pedidos).
 * Toda leitura/exclusão é escopada pela empresa (tenant) do usuário logado.
 */
public class ClienteRepository {

    public ClienteModel salvar(ClienteModel cliente) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            ClienteModel gerenciado = em.merge(cliente);
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

    public ClienteModel buscarPorId(Long id, Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT c FROM ClienteModel c WHERE c.id = :id AND c.empresa.id = :empresaId",
                    ClienteModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getSingleResult();
        } catch (NoResultException e) {
            return null;
        } finally {
            em.close();
        }
    }

    public List<ClienteModel> listarTodos(Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT c FROM ClienteModel c WHERE c.empresa.id = :empresaId ORDER BY c.nome", ClienteModel.class)
                    .setParameter("empresaId", empresaId)
                    .getResultList();
        } finally {
            em.close();
        }
    }

    public void deletar(Long id, Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            ClienteModel cliente = em.createQuery(
                    "SELECT c FROM ClienteModel c WHERE c.id = :id AND c.empresa.id = :empresaId", ClienteModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getResultStream().findFirst().orElse(null);
            if (cliente != null) {
                em.remove(cliente);
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
            return em.createQuery("SELECT COUNT(c) FROM ClienteModel c", Long.class)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }
}
