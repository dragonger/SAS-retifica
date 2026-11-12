import { Routes, UrlMatcher, UrlSegment } from '@angular/router';
import { guardaDeSaida } from './core/guarda-saida.service';
import { LOGIN_AUTOMATICO_ATIVO } from './core/login-automatico';
import { exigirSessao } from './core/sessao.guard';
import { AltoMedidas } from './telas/alto-medidas/alto-medidas';
import { Cabecotes } from './telas/cabecotes/cabecotes';
import { Catalogo } from './telas/catalogo/catalogo';
import { CatalogoItens } from './telas/catalogo-itens/catalogo-itens';
import { Clientes } from './telas/clientes/clientes';
import { Dashboard } from './telas/dashboard/dashboard';
import { Empresa } from './telas/empresa/empresa';
import { Encerrados } from './telas/encerrados/encerrados';
import { Inicio } from './telas/inicio/inicio';
import { Login } from './telas/login/login';
import { Pedido } from './telas/pedido/pedido';
import { PedidoForm } from './telas/pedido-form/pedido-form';
import { Pedidos } from './telas/pedidos/pedidos';
import { TrocarSenha } from './telas/trocar-senha/trocar-senha';

/** Rotas = `rotas` do app.js (mesmos hashes). */

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

/**
 * Com `loginAutomatico` ligado (como hoje) `#/login` redireciona para o Início,
 * igual ao app atual; desligado, mostra a tela de login.
 */
export function criarRotas(loginAutomatico: boolean): Routes {
  return [
    { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    loginAutomatico ? { path: 'login', redirectTo: 'inicio' } : { path: 'login', component: Login },
    {
      path: '',
      canActivateChild: [exigirSessao],
      children: [
        { path: 'inicio', component: Inicio },
        // novo e editar antes de :id (que aceitaria "novo")
        { path: 'pedidos', component: Pedidos }, // ?filtro=... | ?cliente=...
        { path: 'pedidos/novo', component: PedidoForm, canDeactivate: [guardaDeSaida] },
        { matcher: pedidoPorId('editar'), component: PedidoForm, canDeactivate: [guardaDeSaida] },
        { matcher: pedidoPorId(), component: Pedido, canDeactivate: [guardaDeSaida] },
        { path: 'cabecotes', component: Cabecotes, canDeactivate: [guardaDeSaida] },
        { path: 'catalogo', component: Catalogo },
        { path: 'servicos', component: CatalogoItens, data: { tipo: 'servicos' }, canDeactivate: [guardaDeSaida] },
        { path: 'pecas', component: CatalogoItens, data: { tipo: 'pecas' }, canDeactivate: [guardaDeSaida] },
        { path: 'clientes', component: Clientes, canDeactivate: [guardaDeSaida] },
        { path: 'encerrados', component: Encerrados },
        { path: 'dashboard', component: Dashboard },
        { path: 'trocar-senha', component: TrocarSenha, canDeactivate: [guardaDeSaida] },
        { path: 'empresa', component: Empresa, canDeactivate: [guardaDeSaida] },
        { path: 'alto-medidas', component: AltoMedidas },
      ],
    },
    // hash desconhecido: o app atual cai na tela inicial
    { path: '**', redirectTo: 'inicio' },
  ];
}

export const routes: Routes = criarRotas(LOGIN_AUTOMATICO_ATIVO);
