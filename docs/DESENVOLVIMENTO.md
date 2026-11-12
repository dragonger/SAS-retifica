# Desenvolvimento local

## Requisitos

- **JDK 21 ou mais novo.** O projeto compila com `maven.compiler.release=21`, então uma JDK mais nova (a da máquina do Miguel é a 26) faz cross-compilation sem precisar da 21.
- **Maven.** Não precisa estar no PATH. Na máquina do Miguel ele não está; usa-se o Maven embutido do IntelliJ, cujo caminho muda com as atualizações da IDE:
  ```
  C:\Program Files\JetBrains\IntelliJ IDEA <versão>\plugins\maven-plugin\lib\maven3\bin\mvn.cmd
  ```
  Se der "não encontrado", procure de novo com `Get-ChildItem -Recurse -Filter mvn.cmd` a partir de `C:\Program Files\JetBrains`. Nos exemplos abaixo, `mvn` significa esse executável.
- **Docker** (Docker Desktop no Windows, exige WSL2) para o Postgres local.
- **GitHub CLI** (`gh`) para PRs; **Node.js** só para o Railway CLI e o proxy.

## Banco local

```bash
docker compose up -d
```

Sobe um Postgres 16 em `localhost:5432` (usuário, senha e banco `retificas`; ver `docker-compose.yml`). Esses valores são os defaults do `persistence.xml`, então não é preciso configurar nada. Para apontar para outro Postgres, defina `DATABASE_URL`, `DATABASE_USER` e `DATABASE_PASSWORD`.

O volume `retificas_postgres_data` guarda os dados entre reinícios. `docker compose down` mantém o volume; `docker compose down -v` o apaga.

## Compilar e rodar o backend

```bash
mvn -pl core,backend -am -DskipTests package
java -jar backend/target/retificas-backend.jar
```

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

Com o login automático ativo, o próprio PWA desativa a tela de login e entra sozinho como o usuário 1 (ver [SAAS.md](SAAS.md#login-automático)). Se o usuário 1 não existir, o endpoint responde 401 e o app fica tentando de novo; para religar a tela de login é preciso mudar `LOGIN_AUTOMATICO_ATIVO` em `frontend/src/app/core/login-automatico.ts` e mexer no `AuthController`, não basta desligar o endpoint.

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
