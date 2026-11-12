# Custo do hbm2ddl=update na subida

## Situação atual

- `core/.../META-INF/persistence.xml` usa `hibernate.hbm2ddl.auto=update`. A cada criação da `EntityManagerFactory` o Hibernate lê o metadata do banco (tabelas, colunas, índices, FKs) e compara com as 13 entidades. Em produção isso são idas e voltas de rede até o Neon.
- A fábrica é criada no caminho crítico: `BootstrapUsuario` (CommandLineRunner) e `GET /health` (sinal de "pronto" do Railway e do wake-proxy) chamam `JPAUtil.getEntityManagerFactory()`. Criação preguiçosa não ajuda.
- Como o backend é ligado/desligado todo dia, o update roda a cada despertar, quase sempre sem nada para mudar.
- A tabela legada `pedido_categoria` (sem entidade, com FK para `pedido`) é ignorada por update/validate/none; quem trata dela é `PedidoRepository.apagarCategoriasLegadas`.
- Não há Flyway/Liquibase. O Spring Boot não tem DataSource aqui, então Flyway teria de ser chamado à mão.

## Medições

**Na medição original, não foi possível medir.** Naquele momento, na máquina de desenvolvimento, o Docker Desktop estava instalado, mas o daemon estava parado (pipe `dockerDesktopLinuxEngine` inexistente) e não havia `psql`/`postgres` no PATH. Iniciar o Docker Desktop e baixar a imagem `postgres:16-alpine` são ações de sistema/download que não foram autorizadas, e produção (Neon) não pode ser usada. Portanto não há números de tempo nem de round trips, e nenhum ganho em produção é afirmado aqui.

Para medir depois (fora de produção): `docker compose up -d`, criar a EMF via `Persistence.createEntityManagerFactory("retificasPU", mapa)` com `hibernate.hbm2ddl.auto` = update / none / validate (5+ execuções, JVM nova, schema já criado) e repetir atrás de um proxy TCP com latência injetada (0/20/80/150 ms) para simular o Neon. Latência simulada não é a rede real Railway-Neon (a região do Neon não está registrada no repositório). Também não foi verificado o padrão de `hibernate.hbm2ddl.jdbc_metadata_extraction_strategy` nem o efeito de `hibernate.boot.allow_jdbc_metadata_access=false` com update.

## Mudança aplicada (inofensiva e reversível)

`JPAUtil.conexaoOverrides()` agora repassa a variável de ambiente opcional `HIBERNATE_HBM2DDL` como `hibernate.hbm2ddl.auto`. Sem a variável nada muda: continua `update` do `persistence.xml`. Compila (`mvn -pl backend -am -DskipTests compile`). Reverter: remover a variável ou a linha. `persistence.xml` não foi alterado.

Só são aceitos `update`, `validate` e `none`; qualquer outro valor (`create`, `create-drop`, `drop`, que apagariam as tabelas de produção, ou typo) é ignorado com aviso no stderr e vale o `persistence.xml`.

Cuidado: definir `HIBERNATE_HBM2DDL=none` no Railway sem aplicar o DDL à mão quebra o próximo deploy que mude entidade (aconteceu com `PedidoModel.observacao` e `CabecoteModel.categoria`).

## Alternativas

| Opção | Efeito | Riscos |
|---|---|---|
| a) Marcador de versão do schema: 1 consulta JDBC numa tabela de controle com o id do build (ex. `RAILWAY_GIT_COMMIT_SHA`); igual = `none`, diferente/ausente = `update` e grava o marcador | Mantém migração automática por deploy e pula o custo nos despertares do mesmo deploy | A variável pode não existir em deploy por upload (confirmar com o dono); DDL manual fora do deploy não é reaplicado; cria tabela nova; ainda abre 1 conexão; com várias réplicas ou deploy concorrente duas instâncias podem rodar update ao mesmo tempo; o marcador só pode ser gravado depois de o update terminar com sucesso |
| b) `validate` em prod | Detecta drift | Ainda lê metadata (custo parecido); quebra o boot se faltar coluna; exige DDL manual |
| c) `none` em prod | Elimina o custo | DDL manual no Neon a cada mudança de entidade; risco alto de esquecer |
| d) Flyway com baseline | Correta a longo prazo | Dependências novas, chamada programática, baseline do schema real (incluindo `pedido_categoria` e índices); só vale para governança, não só tempo |
| e) update só em dev | Igual a (c) em prod | Mesmas ressalvas de (c) |
| f) EMF preguiçosa | Nenhum | Descartada: Bootstrap e /health já forçam a criação |

## Recomendação

Medir primeiro (seção acima). Se o update for relevante frente ao cold start do Neon (que independe do hbm2ddl), avaliar (a). Não usar (b)/(c)/(e) sem processo definido para DDL.

## Rollback

Remover `HIBERNATE_HBM2DDL` do ambiente (volta a `update`); se necessário, reverter a linha em `JPAUtil`.
