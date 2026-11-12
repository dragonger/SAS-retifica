package org.example.backend;

import jakarta.persistence.EntityManager;
import org.example.backend.demo.DemoService;
import org.example.backend.security.JwtUtil;
import org.example.persistence.JPAUtil;
import org.example.repository.EmpresaDemoRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Reserva de demonstrações: o clique entrega uma já montada (rápido mesmo com o banco longe), as datas dos
 * pedidos vêm para hoje mesmo que a reserva tenha sido montada dias antes, e a reposição não duplica.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "DEMO_RESERVA=1")
class DemoReservaTest {

    static {
        GuardaBancoLocal.verificar();
    }

    @LocalServerPort int porta;
    @Autowired JwtUtil jwtUtil;
    @Autowired DemoService demoService;

    private static Object valor(String sql, Object... parametros) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            var q = em.createNativeQuery(sql);
            for (int i = 0; i < parametros.length; i++) q.setParameter(i + 1, parametros[i]);
            return q.getSingleResult();
        } finally {
            em.close();
        }
    }

    private static void executar(String sql, Object... parametros) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            em.getTransaction().begin();
            var q = em.createNativeQuery(sql);
            for (int i = 0; i < parametros.length; i++) q.setParameter(i + 1, parametros[i]);
            q.executeUpdate();
            em.getTransaction().commit();
        } finally {
            em.close();
        }
    }

    @AfterEach
    void apagarDemonstracoes() {
        demoService.reporReserva(); // espera a reposição em segundo plano terminar antes de apagar
        executar("update empresa set demoexpiraem = now() - interval '1 day' where demo = true");
        demoService.limparVencidas();
    }

    @Test
    void entregaAReservaComAsDatasTrazidasParaHojeEDepoisRepoe() {
        demoService.reporReserva();
        var repo = new EmpresaDemoRepository();
        assertThat(repo.contarReservas()).isEqualTo(1);
        long reserva = ((Number) valor("select min(id) from empresa where demo = true and demoexpiraem is null")).longValue();
        // simula uma reserva montada 3 dias atrás
        executar("update empresa set criadaem = criadaem - interval '3 days' where id = ?1", reserva);
        executar("update pedido set datentregaestimada = datentregaestimada - 3, datcriacao = datcriacao - interval '3 days',"
                + " datentrega = datentrega - interval '3 days' where empresa_id = ?1", reserva);

        var r = new ApiTeste(porta).postDeEndereco("/api/auth/demo", "10.0.1.1");
        assertThat(r.status()).as(r.corpo()).isEqualTo(200);
        String token = r.json().get("token").asString();
        var claims = jwtUtil.validar(token);
        assertThat(claims.get("empresaId", Long.class)).as("entregou a reserva").isEqualTo(reserva);
        assertThat(Duration.between(Instant.now(), claims.getExpiration().toInstant()).toMinutes()).isCloseTo(120L, within(2L));

        LocalDate hoje = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
        assertThat(valor("select max(datentregaestimada) from pedido where empresa_id = ?1", reserva).toString())
                .as("a entrega mais distante volta a ser daqui a 8 dias").isEqualTo(hoje.plusDays(8).toString());
        var api = new ApiTeste(porta);
        assertThat(api.get("/api/pedidos?abertos=true", token).json().size()).isEqualTo(5);
        assertThat(api.get("/api/clientes", token).json().size()).isEqualTo(5);

        demoService.reporReserva();
        assertThat(repo.contarReservas()).as("repôs uma, sem duplicar").isEqualTo(1);
        assertThat(((Number) valor("select min(id) from empresa where demo = true and demoexpiraem is null")).longValue())
                .isNotEqualTo(reserva);
    }

    @Test
    void reservaNaoEApagadaPelaLimpezaNemContaComoVencida() {
        demoService.reporReserva();
        demoService.limparVencidas();
        assertThat(new EmpresaDemoRepository().contarReservas()).isEqualTo(1);
    }
}
