// Copia do app atual (backend/src/main/resources/static) os arquivos estáticos que o
// Angular reaproveita: fontes, ícones e manifest. O Angular só aceita "assets" dentro
// da pasta do projeto, então a cópia vai para src/legado/ (ignorada pelo git, refeita
// a cada start/build/test). A fonte da verdade continua sendo a pasta static/;
// o style.css é lido direto de lá pelo angular.json.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origem = resolve(raiz, '..', 'backend', 'src', 'main', 'resources', 'static');
const destino = join(raiz, 'src', 'legado');

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });

cpSync(join(origem, 'fonts'), join(destino, 'fonts'), { recursive: true });
cpSync(join(origem, 'manifest.json'), join(destino, 'manifest.json'));
for (const nome of readdirSync(origem)) {
  if (/^icon.*\.(png|svg)$/.test(nome)) cpSync(join(origem, nome), join(destino, nome));
}
console.log('Estáticos do app atual copiados para src/legado/');
