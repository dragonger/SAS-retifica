# Desenvolvimento local

## Requisitos

- **JDK 21 ou mais novo.** O projeto compila com `maven.compiler.release=21`, então uma JDK mais nova (a da máquina de desenvolvimento é a 26) faz cross-compilation sem precisar da 21.
- **Maven.** Não precisa estar no PATH. Na máquina de desenvolvimento ele não está; usa-se o Maven embutido do IntelliJ, cujo caminho muda com as atualizações da IDE:
  ```
  C:\Program Files\JetBrains\IntelliJ IDEA <versão>\plugins\maven-plugin\lib\maven3\bin\mvn.cmd
  ```
  Se der "não encontrado", procure de novo com `Get-ChildItem -Recurse -Filter mvn.cmd` a partir de `C:\Program Files\JetBrains`. Nos exemplos abaixo, `mvn` significa esse executável.
- **Docker** (Docker Desktop no Windows, exige WSL2) para o Postgres local.
- **Node.js 22** para compilar o front (`frontend/`, Angular), além do Railway CLI e do proxy.
- **GitHub CLI** (`gh`) para PRs.

## Banco local

```bash
docker compose up -d
```

Sobe um Postgres 16 em `localhost:5432` (usuário, senha e banco `retificas`; ver `docker-compose.yml`). Esses valores são os defaults do `persistence.xml`, então não é preciso configurar nada. Para apontar para outro Postgres, defina `DATABASE_URL`, `DATABASE_USER` e `DATABASE_PASSWORD`.

O volume `retificas_postgres_data` guarda os dados entre reinícios. `docker compose down` mantém o volume; `docker compose down -v` o apaga.

## Compilar e rodar o backend

```bash
(cd frontend && npm ci && npm run build:backend)   # front em Angular -> backend/src/main/resources/static/
mvn -pl core,backend -am -DskipTests package
java -jar backend/target/retificas-backend.jar
```

O build do front não fica no git: sem o primeiro passo o jar sobe só com a API e a página fica vazia. Depois de trocar o front, use `mvn clean package`, senão arquivos antigos de `target/classes/static/` vão junto para o jar. Para mexer só no front, `npm start` em `frontend/` (detalhes em [frontend/README.md](../frontend/README.md)).

Use sempre `-pl core,backend -am`: o módulo `desktop` não compila (ver [ARQUITETURA.md](ARQUITETURA.md#desktop-javafx)), então `mvn clean compile` sem `-pl` falha.

Depois de mudar uma **flag de compilação** no pom (`maven.compiler.release`, `maven.compiler.parameters`), use `mvn clean package`: o compilador não recompila arquivos "atualizados" mesmo com a flag nova.

### HTTPS local ou HTTP

Por padrão o Spring sobe com HTTPS (`SSL_ENABLED=true`) na porta `8443`, usando `backend/src/main/resources/keystore.p12`. Esse arquivo **não está no git** (está no `.gitignore`), então um clone novo precisa de uma das duas saídas:

- **HTTP simples** (mais fácil, serve para testar a API e o PWA no computador):
  ```bash
  SSL_ENABLED=false java -jar backend/target/retificas-backend.jar
  ```
  No PowerShell: `$env:SSL_ENABLED = "false"; java -jar backend/target/retificas-backend.jar`. Acesse `http://localhost:8443`.
- **HTTPS com certificado autoassinado**, necessário para o `navigator.share()` (compartilhar o PDF) funcionar no celular. Gere o certificado uma vez, com o alias `retifica` e a senha que está em `server.ssl.key-store-password` no `application.properties`:
  ```bash
  keytool -genkeypair -alias retifica -keyalg RSA -keysize 2048 -storetype PKCS12 \
    -keystore backend/src/main/resources/keystore.p12 -validity 3650 -dname "CN=localhost"
  ```
  O navegador avisará que o certificado não é confiável: é esperado (use "Avançado" e "Continuar").

A porta vem de `PORT` (o Railway injeta `8080` em produção); sem ela vale `8443`. Se a 8443 já estiver em uso por um backend anterior, pare-o antes (PowerShell: `Get-NetTCPConnection -LocalPort 8443`, depois `Stop-Process`).

### Primeiro acesso

Em banco vazio, o `BootstrapUsuario` cria a empresa 1 e um usuário com senha aleatória, gravada em `~/.retificasDesktop/bootstrap-credentials.txt` (e escrita no log de inicialização). A chave JWT local é gerada em `~/.retificasDesktop/jwt-secret.key`. Em produção a chave vem de `JWT_SECRET`.

Para entrar, use o e-mail e a senha desse arquivo, ou toque em "Abrir demonstração" na tela de login: cria uma empresa isolada com dados fictícios, apagada em 2 horas (ver [SAAS.md](SAAS.md#login-e-demonstração)). É o jeito mais rápido de ter dados para testar uma tela.

## Acesso pelo celular (túnel)

Para testar no celular fora da rede local, abra um túnel do Cloudflare (a URL é temporária e muda a cada execução; procure "Your quick Tunnel" no log):

```bash
cloudflared tunnel --url https://localhost:8443 --no-tls-verify
```

Com `SSL_ENABLED=false` (HTTP), use `--url http://localhost:8443` e tire o `--no-tls-verify`. Com a produção no Railway, o túnel só serve para testar mudanças antes de publicar. Acessando pelo IP da rede local, o Windows pode pedir uma regra de firewall para a porta 8443:

```powershell
New-NetFirewallRule -DisplayName "Retifica Backend 8443" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow
```

## Testes

```bash
docker compose -f docker-compose.test.yml up -d --wait
mvn -pl core,backend -am test
docker compose -f docker-compose.test.yml down
```

Os testes usam um Postgres descartável em `localhost:5544` (banco `retificas_test`) e uma trava que aborta se o ambiente apontar para outro banco. Nunca rode scripts nem testes contra a produção. Detalhes e a lista do que cada teste garante: [backend/TESTES.md](../backend/TESTES.md).

## Desktop (JavaFX)

```bash
mvn -pl desktop -am javafx:run
```

**Não funciona hoje** (não compila). Quando for retomado, ele precisa de um Postgres (o do `docker compose up -d` ou outro via `DATABASE_*`) e do `empresaId` nas chamadas ao `core`.

## Git

- `origin` → `dragonger/retificasDesktop`; `saas` → `dragonger/SAS-retifica` (público). `git push` sem argumento vai para o `origin`; para o outro é preciso `git push saas <branch>`. **O Railway constrói a partir do `saas`**, então publicar exige enviar para os dois (ver [PRODUCAO.md](PRODUCAO.md#como-publicar)).
- Mensagens de commit e descrições de PR não levam linha de co-autoria nem "gerado por" de ferramentas.
- No Windows, escrever arquivos `.java` com BOM quebra o `javac` (`illegal character: '\ufeff'`); em PowerShell 5.1 use `[System.IO.File]::WriteAllText` com `UTF8Encoding $false`, não `Set-Content -Encoding utf8`.
- Em strings Java geradas por script, expressões regulares com `\d` precisam de `\\d`.
