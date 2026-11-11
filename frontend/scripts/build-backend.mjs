// Gera o build de produção do Angular e o copia para o Spring Boot servir em /novo/
// (backend/src/main/resources/static/novo/, ignorada pelo git).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const saida = join(raiz, 'dist', 'frontend', 'browser');
const destino = resolve(raiz, '..', 'backend', 'src', 'main', 'resources', 'static', 'novo');

const build = spawnSync('npm run build', { cwd: raiz, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(join(saida, 'index.html'))) {
  console.error('Build sem index.html em ' + saida);
  process.exit(1);
}

// service worker do Angular: sem estes arquivos o app não instala/atualiza offline
for (const arquivo of ['ngsw-worker.js', 'ngsw.json', 'safety-worker.js']) {
  if (!existsSync(join(saida, arquivo))) {
    console.error('Build sem ' + arquivo + ' em ' + saida + ' (conferir "serviceWorker" em angular.json)');
    process.exit(1);
  }
}

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(saida, destino, { recursive: true });
console.log('Angular copiado para ' + destino);
