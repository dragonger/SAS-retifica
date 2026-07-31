package org.example.repository;

import org.example.model.CabecoteModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.NoResultException;
import java.util.List;

/**
 * Acesso a dados de {@link CabecoteModel} (catálogo de cabeçotes).
 * Toda leitura/exclusão é escopada pela empresa (tenant) do usuário logado.
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

    public CabecoteModel buscarPorId(Long id, Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT c FROM CabecoteModel c WHERE c.id = :id AND c.empresa.id = :empresaId",
                    CabecoteModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getSingleResult();
        } catch (NoResultException e) {
            return null;
        } finally {
            em.close();
        }
    }

    public List<CabecoteModel> listarTodos(Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT c FROM CabecoteModel c WHERE c.empresa.id = :empresaId ORDER BY c.categoria, c.nome",
                    CabecoteModel.class)
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
            CabecoteModel cabecote = em.createQuery(
                    "SELECT c FROM CabecoteModel c WHERE c.id = :id AND c.empresa.id = :empresaId", CabecoteModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getResultStream().findFirst().orElse(null);
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
