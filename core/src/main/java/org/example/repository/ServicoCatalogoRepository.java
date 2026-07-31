package org.example.repository;

import org.example.model.ServicoCatalogoModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.NoResultException;
import java.util.List;

/**
 * Acesso a dados de {@link ServicoCatalogoModel} (catálogo de serviços).
 * Toda leitura/exclusão é escopada pela empresa (tenant) do usuário logado.
 */
public class ServicoCatalogoRepository {

    public ServicoCatalogoModel salvar(ServicoCatalogoModel servico) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            ServicoCatalogoModel gerenciado = em.merge(servico);
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

    public ServicoCatalogoModel buscarPorId(Long id, Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT s FROM ServicoCatalogoModel s WHERE s.id = :id AND s.empresa.id = :empresaId",
                    ServicoCatalogoModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getSingleResult();
        } catch (NoResultException e) {
            return null;
        } finally {
            em.close();
        }
    }

    public List<ServicoCatalogoModel> listarTodos(Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT s FROM ServicoCatalogoModel s WHERE s.empresa.id = :empresaId ORDER BY s.categoria, s.nome",
                    ServicoCatalogoModel.class)
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
            ServicoCatalogoModel servico = em.createQuery(
                    "SELECT s FROM ServicoCatalogoModel s WHERE s.id = :id AND s.empresa.id = :empresaId",
                    ServicoCatalogoModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getResultStream().findFirst().orElse(null);
            if (servico != null) {
                em.remove(servico);
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
            return em.createQuery("SELECT COUNT(s) FROM ServicoCatalogoModel s", Long.class)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }
}
