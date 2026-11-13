package org.example.backend.security;

import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/** Regra do cache de versões: a versão só sobe, e usuário inexistente continua recusado. */
class SessaoServiceTest {

    private static final Long ID = 42L;

    @Test
    void leituraAtrasadaNaoDerrubaAVersaoNovaGravadaPelaRevogacao() throws Exception {
        SessaoService s = new SessaoService();
        s.gravar(ID, 3);
        CountDownLatch leituraComecou = new CountDownLatch(1);
        CountDownLatch soltaLeitura = new CountDownLatch(1);
        s.leitor = id -> {
            leituraComecou.countDown();
            esperar(soltaLeitura);
            return 3; // valor lido antes da revogação
        };
        s.forcarVencimento(ID);

        Thread leitura = new Thread(() -> s.valida(ID, 3));
        leitura.start();
        assertThat(leituraComecou.await(5, TimeUnit.SECONDS)).isTrue();
        Thread revogacao = new Thread(() -> s.gravar(ID, 4)); // a revogação grava a versão nova no meio da leitura
        revogacao.start();
        Thread.sleep(200);
        soltaLeitura.countDown();
        leitura.join(5000);
        revogacao.join(5000);

        s.leitor = id -> { throw new AssertionError("não devia voltar ao banco: o cache está fresco"); };
        assertThat(s.valida(ID, 4)).as("a versão nova vale").isTrue();
        assertThat(s.valida(ID, 3)).as("o token revogado não ressuscita").isFalse();
    }

    @Test
    void gravarNuncaTrocaVersaoMaiorPorMenor() {
        SessaoService s = new SessaoService();
        s.gravar(ID, 5);
        s.gravar(ID, 2);
        s.leitor = id -> { throw new AssertionError("cache fresco"); };
        assertThat(s.valida(ID, 5)).isTrue();
        assertThat(s.valida(ID, 2)).isFalse();
    }

    @Test
    void leituraVencidaComVersaoMenorMantemAMaior() {
        SessaoService s = new SessaoService();
        s.gravar(ID, 7);
        s.leitor = id -> 6; // banco "atrasado" em relação ao cache
        s.forcarVencimento(ID);
        assertThat(s.valida(ID, 7)).isTrue();
        assertThat(s.valida(ID, 6)).isFalse();
    }

    @Test
    void usuarioInexistenteContinuaRecusadoEExclusaoEDefinitiva() {
        SessaoService s = new SessaoService();
        s.leitor = id -> null;
        assertThat(s.valida(ID, 0)).isFalse();
        s.gravar(ID, 1); // uma gravação atrasada não traz o usuário apagado de volta
        s.leitor = id -> 1;
        s.forcarVencimento(ID);
        assertThat(s.valida(ID, 1)).isFalse();
        assertThat(s.valida(null, 0)).isFalse();
    }

    @Test
    void faltaDeCacheLeUmaVezSoPorUsuarioMesmoComRequisicoesSimultaneas() throws Exception {
        SessaoService s = new SessaoService();
        AtomicInteger leituras = new AtomicInteger();
        s.leitor = id -> {
            leituras.incrementAndGet();
            try {
                Thread.sleep(150);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return 0;
        };
        Thread[] ts = new Thread[8];
        for (int i = 0; i < ts.length; i++) {
            ts[i] = new Thread(() -> s.valida(ID, 0));
            ts[i].start();
        }
        for (Thread t : ts) {
            t.join(5000);
        }
        assertThat(leituras.get()).isEqualTo(1);
    }

    private static void esperar(CountDownLatch l) {
        try {
            l.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
