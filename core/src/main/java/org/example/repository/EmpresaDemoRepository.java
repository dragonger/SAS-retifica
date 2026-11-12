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

    /**
     * Cria a empresa de demonstração e o usuário dela numa transação só. Com {@code expiraEm} nulo ela fica
     * na RESERVA: pronta, mas sem visitante, até {@link #reivindicarReserva} entregá-la a alguém.
     */
    public UsuarioModel criar(String nomeEmpresa, LocalDateTime expiraEm, String email, String nomeUsuario, String senhaHash) {
        return emTransacao(em -> {
            EmpresaModel empresa = new EmpresaModel();
            empresa.setNome(nomeEmpresa);
            empresa.setDemo(true);
            empresa.setDemoExpiraEm(expiraEm);
            empresa.setCriadaEm(LocalDateTime.now(java.time.ZoneId.of("America/Sao_Paulo")));
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

    /** Quantas demonstrações estão na reserva (prontas, sem visitante). */
    public long contarReservas() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery("SELECT COUNT(e) FROM EmpresaModel e WHERE e.demo = true AND e.demoExpiraEm IS NULL", Long.class)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }

    /**
     * Entrega ao visitante uma demonstração da reserva: marca o prazo e traz as datas dos pedidos para hoje
     * (a reserva pode ter sido montada dias antes, e "atrasado", "entrega hoje" e Encerrados dependem da
     * data). Poucos acessos ao banco, então responde rápido mesmo com o banco longe. Devolve o usuário da
     * demonstração, ou null se a reserva estiver vazia.
     */
    public UsuarioModel reivindicarReserva(LocalDateTime agora, LocalDateTime expiraEm) {
        return emTransacao(em -> {
            List<EmpresaModel> reserva = em.createQuery(
                            "SELECT e FROM EmpresaModel e WHERE e.demo = true AND e.demoExpiraEm IS NULL ORDER BY e.id", EmpresaModel.class)
                    .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .setMaxResults(1)
                    .getResultList();
            if (reserva.isEmpty()) {
                return null;
            }
            EmpresaModel empresa = reserva.get(0);
            long dias = empresa.getCriadaEm() == null ? 0
                    : java.time.temporal.ChronoUnit.DAYS.between(empresa.getCriadaEm().toLocalDate(), agora.toLocalDate());
            if (dias != 0) {
                List<PedidoModel> pedidos = em.createQuery("SELECT p FROM PedidoModel p WHERE p.empresa.id = :e", PedidoModel.class)
                        .setParameter("e", empresa.getId())
                        .getResultList();
                for (PedidoModel p : pedidos) {
                    if (p.getDatCriacao() != null) p.setDatCriacao(p.getDatCriacao().plusDays(dias));
                    if (p.getDatOrcamento() != null) p.setDatOrcamento(p.getDatOrcamento().plusDays(dias));
                    if (p.getDatEntregaEstimada() != null) p.setDatEntregaEstimada(p.getDatEntregaEstimada().plusDays(dias));
                    if (p.getDatEntrega() != null) p.setDatEntrega(p.getDatEntrega().plusDays(dias));
                }
            }
            empresa.setDemoExpiraEm(expiraEm);
            empresa.setCriadaEm(agora);
            return em.createQuery("SELECT u FROM UsuarioModel u JOIN FETCH u.empresa WHERE u.empresa.id = :e", UsuarioModel.class)
                    .setParameter("e", empresa.getId())
                    .setMaxResults(1)
                    .getSingleResult();
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
