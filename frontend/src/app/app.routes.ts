import { Routes, UrlMatcher, UrlSegment } from '@angular/router';
import { guardaDeSaida } from './core/guarda-saida.service';
import { exigirSessao } from './core/sessao.guard';
import { Cabecotes } from './telas/cabecotes/cabecotes';
import { Catalogo } from './telas/catalogo/catalogo';
import { CatalogoItens } from './telas/catalogo-itens/catalogo-itens';
import { Clientes } from './telas/clientes/clientes';
import { Dashboard } from './telas/dashboard/dashboard';
import { Empresa } from './telas/empresa/empresa';
import { Encerrados } from './telas/encerrados/encerrados';
import { EmMigracao } from './telas/em-migracao/em-migracao';
import { Inicio } from './telas/inicio/inicio';

/**
 * Rotas = `rotas` do app.js (mesmos hashes). As telas ainda não migradas usam
 * a tela provisória EmMigracao, que aponta para o app atual.
 */
const emMigracao = (path: string) => ({ path, component: EmMigracao });

/**
 * pedidos/<id> e pedidos/<id>/editar: o id só aceita dígitos (como os regex do
 * app.js); "pedidos/abc" cai no curinga e vai para o Início.
 */
export function pedidoPorId(sufixo?: string): UrlMatcher {
  return (segmentos: UrlSegment[]) => {
    if (segmentos.length !== (sufixo ? 3 : 2) || segmentos[0].path !== 'pedidos' || !/^\d+$/.test(segmentos[1].path)) return null;
    if (sufixo && segmentos[2].path !== sufixo) return null;
    return { consumed: segmentos, posParams: { id: segmentos[1] } };
  };
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  // tela de login desativada: o app atual também redireciona para o Início
  { path: 'login', redirectTo: 'inicio' },
  {
    path: '',
    canActivateChild: [exigirSessao],
    children: [
      { path: 'inicio', component: Inicio },
      // novo e editar antes de :id (que aceitaria "novo")
      emMigracao('pedidos'), // ?filtro=... | ?cliente=...
      emMigracao('pedidos/novo'),
      { matcher: pedidoPorId('editar'), component: EmMigracao },
      { matcher: pedidoPorId(), component: EmMigracao },
      { path: 'cabecotes', component: Cabecotes, canDeactivate: [guardaDeSaida] },
      { path: 'catalogo', component: Catalogo },
      { path: 'servicos', component: CatalogoItens, data: { tipo: 'servicos' }, canDeactivate: [guardaDeSaida] },
      { path: 'pecas', component: CatalogoItens, data: { tipo: 'pecas' }, canDeactivate: [guardaDeSaida] },
      { path: 'clientes', component: Clientes, canDeactivate: [guardaDeSaida] },
      { path: 'encerrados', component: Encerrados },
      { path: 'dashboard', component: Dashboard },
      emMigracao('trocar-senha'),
      { path: 'empresa', component: Empresa, canDeactivate: [guardaDeSaida] },
      emMigracao('alto-medidas'),
    ],
  },
  // hash desconhecido: o app atual cai na tela inicial
  { path: '**', redirectTo: 'inicio' },
];
