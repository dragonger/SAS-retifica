package org.example.backend.web;

import org.junit.jupiter.api.Test;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Mes (AAAA-MM) de finalizacao no horario de Brasilia, base do filtro de meses
 * "Virabrequins do Daniel". As datas do Alto Medidas chegam em UTC.
 */
class MesDeReferenciaTest {

    @Test
    void viradaDoMesAcontecePeloRelogioDeBrasiliaNaoPeloUtc() {
        // Brasilia = UTC-3 (sem horario de verao)
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-10-31T23:30:00.000Z", null)).isEqualTo("2026-10");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-11-01T01:00:00.000Z", null))
                .as("31/10 22:00 em Brasilia").isEqualTo("2026-10");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-11-01T02:59:59.000Z", null))
                .as("31/10 23:59:59 em Brasilia").isEqualTo("2026-10");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-11-01T03:00:00.000Z", null))
                .as("01/11 00:00 em Brasilia").isEqualTo("2026-11");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-09-30T23:59:59.000Z", null)).isEqualTo("2026-09");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2027-01-01T02:00:00Z", null))
                .as("virada do ano").isEqualTo("2026-12");
    }

    @Test
    void aceitaOffsetExplicitoEDataHoraLocalESoData() {
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-10-31T23:30:00-03:00", null)).isEqualTo("2026-10");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-11-01T00:30:00+00:00", null))
                .as("00:30 UTC = 21:30 do dia 31 em Brasilia").isEqualTo("2026-10");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-07-15T10:00:00", null)).isEqualTo("2026-07");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-07-15", null)).isEqualTo("2026-07");
    }

    @Test
    void semDataDeFinalizacaoUsaADeRecebimento() {
        assertThat(AltoMedidasEntradaController.mesDeReferencia(null, "2026-08-20")).isEqualTo("2026-08");
        assertThat(AltoMedidasEntradaController.mesDeReferencia("lixo", "2026-08-20")).isEqualTo("2026-08");
        assertThat(AltoMedidasEntradaController.mesDeReferencia(null, "2026-08-20T10:00:00Z")).isEqualTo("2026-08");
    }

    @Test
    void semNenhumaDataValidaCaiNoMesDeHoje() {
        String hoje = YearMonth.now().toString();
        assertThat(AltoMedidasEntradaController.mesDeReferencia(null, null)).isEqualTo(hoje);
        assertThat(AltoMedidasEntradaController.mesDeReferencia("lixo", "tambem lixo")).isEqualTo(hoje);
        assertThat(AltoMedidasEntradaController.mesDeReferencia("", "")).isEqualTo(hoje);
        assertThat(AltoMedidasEntradaController.mesDeReferencia("2026-13-40", "2026-13-40"))
                .as("mes inexistente nao vira AAAA-13").isEqualTo(hoje);
    }
}
