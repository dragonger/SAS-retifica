package org.example.repository;

import org.example.model.CabecoteModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import java.util.List;

/**
 * Acesso a dados de {@link CabecoteModel} (catálogo de cabeçotes).
 */
public class CabecoteRepository {

    public CabecoteModel salvar(CabecoteModel cabecote) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            CabecoteModel gerenciado = em.merge(cabecote);
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

    public CabecoteModel buscarPorId(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.find(CabecoteModel.class, id);
        } finally {
            em.close();
        }
    }

    public List<CabecoteModel> listarTodos() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT c FROM CabecoteModel c ORDER BY c.categoria, c.nome", CabecoteModel.class)
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
            CabecoteModel cabecote = em.find(CabecoteModel.class, id);
            if (cabecote != null) {
                em.remove(cabecote);
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
            return em.createQuery("SELECT COUNT(c) FROM CabecoteModel c", Long.class)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }
}
