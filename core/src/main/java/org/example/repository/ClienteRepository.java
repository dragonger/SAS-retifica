package org.example.repository;

import org.example.model.ClienteModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import java.util.List;

/**
 * Acesso a dados de {@link ClienteModel} (cadastro reutilizável entre pedidos).
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

    public ClienteModel buscarPorId(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.find(ClienteModel.class, id);
        } finally {
            em.close();
        }
    }

    public List<ClienteModel> listarTodos() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT c FROM ClienteModel c ORDER BY c.nome", ClienteModel.class)
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
            ClienteModel cliente = em.find(ClienteModel.class, id);
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
