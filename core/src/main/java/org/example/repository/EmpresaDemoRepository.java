package org.example.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.LockModeType;
import org.example.model.EmpresaModel;
import org.example.model.PedidoModel;
import org.example.model.UsuarioModel;
import org.example.persistence.JPAUtil;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Empresas de DEMONSTRAÇÃO: criadas pela tela de login para quem quer conhecer o sistema, com dados
 * fictícios, e apagadas inteiras quando o prazo vence.
 *
 * <p>Regra de segurança: {@link #apagar} só apaga empresa com {@code demo = true}, conferido com a linha
 * travada dentro da mesma transação que apaga. Uma empresa real nunca entra, nem por id errado.
 */
public class EmpresaDemoRepository {

    /** Cria a empresa de demonstração e o usuário dela numa transação só. */
    public UsuarioModel criar(String nomeEmpresa, LocalDateTime expiraEm, String email, String nomeUsuario, String senhaHash) {
        return emTransacao(em -> {
            EmpresaModel empresa = new EmpresaModel();
            empresa.setNome(nomeEmpresa);
            empresa.setDemo(true);
            empresa.setDemoExpiraEm(expiraEm);
            empresa.setTelefone("(31) 3333-0000");
            empresa.setInstagram("@retificaexemplo");
            empresa.setSlogan("Demonstração com dados fictícios");
            em.persist(empresa);

            UsuarioModel usuario = new UsuarioModel();
            usuario.setEmail(email);
            usuario.setNome(nomeUsuario);
            usuario.setSenhaHash(senhaHash);
            usuario.setEmpresa(empresa);
            em.persist(usuario);
            return usuario;
        });
    }

    /** Demonstrações ainda dentro do prazo (para o limite de quantas podem existir ao mesmo tempo). */
    public long contarAtivas(LocalDateTime agora) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery("SELECT COUNT(e) FROM EmpresaModel e WHERE e.demo = true AND e.demoExpiraEm > :agora", Long.class)
                    .setParameter("agora", agora)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }

    /** Ids das demonstrações com prazo vencido. */
    public List<Long> vencidas(LocalDateTime agora) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery("SELECT e.id FROM EmpresaModel e WHERE e.demo = true AND e.demoExpiraEm <= :agora ORDER BY e.id", Long.class)
                    .setParameter("agora", agora)
                    .getResultList();
        } finally {
            em.close();
        }
    }

    /**
     * Apaga a empresa de demonstração e TODOS os dados dela, numa transação. Devolve false (sem apagar nada)
     * se a empresa não existe ou não é de demonstração.
     */
    public boolean apagar(Long empresaId) {
        return emTransacao(em -> {
            List<EmpresaModel> achada = em.createQuery("SELECT e FROM EmpresaModel e WHERE e.id = :id", EmpresaModel.class)
                    .setParameter("id", empresaId)
                    .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .getResultList();
            if (achada.isEmpty() || !achada.get(0).isDemo()) {
                return false;
            }
            // Pedidos um a um: o remove leva serviços, peças, valores por categoria e a ligação com os componentes.
            List<PedidoModel> pedidos = em.createQuery("SELECT p FROM PedidoModel p WHERE p.empresa.id = :e", PedidoModel.class)
                    .setParameter("e", empresaId)
                    .getResultList();
            for (PedidoModel pedido : pedidos) {
                PedidoRepository.apagarCategoriasLegadas(em, pedido.getId());
                em.remove(pedido);
            }
            em.flush();
            for (String entidade : new String[]{"ClienteModel", "CabecoteModel", "ServicoCatalogoModel", "PecaCatalogoModel", "UsuarioModel"}) {
                em.createQuery("DELETE FROM " + entidade + " x WHERE x.empresa.id = :e").setParameter("e", empresaId).executeUpdate();
            }
            for (String entidade : new String[]{"EmpresaLogoModel", "OsAltoMedidasModel"}) {
                em.createQuery("DELETE FROM " + entidade + " x WHERE x.empresaId = :e").setParameter("e", empresaId).executeUpdate();
            }
            int apagadas = em.createQuery("DELETE FROM EmpresaModel e WHERE e.id = :e AND e.demo = true")
                    .setParameter("e", empresaId)
                    .executeUpdate();
            return apagadas == 1;
        });
    }

    private <R> R emTransacao(java.util.function.Function<EntityManager, R> trabalho) {
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
}
