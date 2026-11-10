import { Routes } from '@angular/router';
import { exigirSessao } from './core/sessao.guard';
import { EmMigracao } from './telas/em-migracao/em-migracao';
import { Inicio } from './telas/inicio/inicio';

/**
 * Rotas = `rotas` do app.js (mesmos hashes). As telas ainda não migradas usam
 * a tela provisória EmMigracao, que aponta para o app atual.
 */
const emMigracao = (path: string) => ({ path, component: EmMigracao });

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
      emMigracao('pedidos/:id/editar'),
      emMigracao('pedidos/:id'),
      emMigracao('cabecotes'),
      emMigracao('catalogo'),
      emMigracao('servicos'),
      emMigracao('pecas'),
      emMigracao('clientes'),
      emMigracao('encerrados'),
      emMigracao('dashboard'),
      emMigracao('trocar-senha'),
      emMigracao('empresa'),
      emMigracao('alto-medidas'),
    ],
  },
  // hash desconhecido: o app atual cai na tela inicial
  { path: '**', redirectTo: 'inicio' },
];
