// Gera o build de produção do Angular e o copia para o Spring Boot servir na raiz
// (backend/src/main/resources/static/). Tudo ali é gerado (ignorado pelo git),
// exceto .well-known/ (assetlinks.json do APK), que é preservado.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const saida = join(raiz, 'dist', 'frontend', 'browser');
const destino = resolve(raiz, '..', 'backend', 'src', 'main', 'resources', 'static');
const PRESERVAR = new Set(['.well-known']);

const build = spawnSync('npm run build', { cwd: raiz, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

// index, service worker do Angular, worker de transição (sw.js) e o de limpeza de /novo/
for (const arquivo of ['index.html', 'ngsw-worker.js', 'ngsw.json', 'sw.js', 'manifest.json', join('novo', 'ngsw-worker.js')]) {
  if (!existsSync(join(saida, arquivo))) {
    console.error('Build sem ' + arquivo + ' em ' + saida);
    process.exit(1);
  }
}

for (const nome of readdirSync(destino)) {
  if (!PRESERVAR.has(nome)) rmSync(join(destino, nome), { recursive: true, force: true });
}
cpSync(saida, destino, { recursive: true });
console.log('Angular copiado para ' + destino);
