package org.example.repository;

import org.example.model.EmpresaModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;

/**
 * Acesso a dados de {@link EmpresaModel} (tenant do sistema multiempresa).
 */
public class EmpresaRepository {

    public EmpresaModel salvar(EmpresaModel empresa) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            EmpresaModel gerenciado = em.merge(empresa);
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

    public EmpresaModel buscarPorId(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.find(EmpresaModel.class, id);
        } finally {
            em.close();
        }
    }
}
