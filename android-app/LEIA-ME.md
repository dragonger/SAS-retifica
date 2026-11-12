# App Android da Retífica (Capacitor)

Casca Android que abre o site de produção (o mesmo PWA) e troca só **uma coisa por código nativo: o reconhecimento de voz do ditado**. Todo o resto (telas, regras, atualizações) continua vindo do servidor.

## Por que existe

O reconhecimento de voz do Chrome do Android encerra a escuta sozinho (silêncio, tempo) e o que se fala durante o reinício se perde. Ver [docs/LICOES.md](../docs/LICOES.md). Um APK do tipo TWA (o que existia, versão 3) roda o Chrome por dentro e **não resolve**. Aqui o app usa o `SpeechRecognizer` do Android:

- **Android 13 ou mais novo**: sessão segmentada (`EXTRA_SEGMENTED_SESSION`). O microfone fica aberto entre as pausas e cada frase chega como um segmento. É o que evita o corte de palavras.
- **Android 12 ou mais antigo**: religa a escuta na hora, como o navegador, mas sem o bip do Chrome.
- Sem custo recorrente e sem serviço novo: é o reconhecimento do próprio aparelho (Google), de graça.

## Como funciona

```
Retífica.apk (Capacitor)
 ├─ WebView ──────────────▶ https://retifica-backend-production.up.railway.app   (o PWA de sempre)
 └─ plugin DitadoVoz (Java) ◀── frontend: core/ditado-voz.ts  (só dentro do APK)
```

- `capacitor.config.json`: `server.url` aponta para produção. **Mudou o site, o app muda sozinho**; só mudança no código nativo pede APK novo.
- `www/index.html`: página mostrada se o aparelho estiver sem internet.
- `android/app/src/main/java/br/com/dih/retifica/DitadoVozPlugin.java`: o plugin. Eventos `estado`, `resultado`, `erro`; métodos `disponivel`, `iniciar`, `parar`, `encerrar`.
- `frontend/src/app/core/ditado-voz.ts`: detecta o plugin e usa a voz nativa com a mesma interface da voz do navegador. Fora do APK nada muda.
- O texto do `resultado` é a escuta inteira (frases finalizadas + a parcial); o app o junta ao que já estava digitado.

## Identidade e assinatura

- **Identificador do app**: `com.retificadih.retifica`, o **mesmo** do APK TWA antigo, e a **mesma chave de assinatura** (`android-signing/android.keystore`, alias `android`). Por isso o APK novo se instala **por cima** do antigo, sem desinstalar. A numeração de versão continua a do antigo (3): o novo é a 4.
- A chave e a senha ficam em `android-signing/` (repositório Git **separado**, ignorado por este). **Nunca** vão para este repositório (ele é público). Faça backup das duas e guarde a senha no gerenciador de senhas. Perder a chave obriga todos a desinstalar o app para instalar uma nova versão. Ver `android-signing/LEIA-ME.txt` (fora deste repositório).
- O `build.gradle` lê a senha direto de `android-signing/keystore-password.txt` na hora de assinar; ela não é copiada para lugar nenhum.

## Como gerar um APK novo

Requisitos (já instalados na máquina de desenvolvimento): Node, JDK 17, Android SDK.

1. Android SDK em `%USERPROFILE%\Android\Sdk` (`platform-tools`, `platforms;android-35`, `build-tools;35.0.0`).
2. JDK 17 em `%USERPROFILE%\.jdks\ms-17.0.20.1`. O Gradle 8.11 **não roda** com o Java 25 do IntelliJ nem com o Java 26.
3. Na pasta `android-app`:

```
npm install
npx cap sync android
cd android
set JAVA_HOME=%USERPROFILE%\.jdks\ms-17.0.20.1
set ANDROID_HOME=%USERPROFILE%\Android\Sdk
gradlew.bat assembleRelease
```

O arquivo sai em `android/app/build/outputs/apk/release/`. Para trocar a versão, edite `versionCode` e `versionName` em `android/app/build.gradle` (sempre **aumente** o `versionCode`, senão o Android recusa instalar por cima).

Se mudar só o site, **não** precisa de APK novo.

## Como instalar nos celulares

1. Mande o arquivo `.apk` por link ou WhatsApp (o WhatsApp pode renomear; use "Documento").
2. No celular, abra o arquivo e aceite "Instalar apps desconhecidos" para o app que o abriu. Se o antigo já estiver instalado, a instalação **atualiza**, e os dados e o login continuam.
3. Na primeira vez que tocar em **Falar**, o Android pede a permissão do microfone: aceite.

## O que ainda não está provado

- **O corte de palavras sumir de fato**: depende do aparelho e ainda não houve teste em celular real. Testar nos dois celulares Samsung com Android 14 ou mais novo (versão do Android em Configurações, Sobre o telefone). Se ainda cortar, o próximo passo é gravar o áudio e transcrever no servidor (custa uns US$ 0,006 por minuto e manda o áudio a um terceiro; ver [backend/DITADO.md](../backend/DITADO.md)).
- O bip de início e fim do reconhecimento do Android continua; só não há reinício no meio da fala quando a sessão segmentada está disponível.
- Mexer no volume do sistema para silenciar o bip foi deixado de fora de propósito (exige permissão de "Não perturbe" em alguns aparelhos).

## Pendências

- Testar o APK nos dois celulares e anotar o resultado aqui e em [docs/LICOES.md](../docs/LICOES.md).
- Hospedagem do APK: hoje é por envio direto; não há atualização automática do arquivo nativo.
