// App web/mobile da retífica — SPA leve, sem framework, consumindo /api/*.
// Visual baseado no protótipo compartilhado (claude.ai/design — tema "blueprint").
(() => {
  'use strict';

  const conteudo = document.getElementById('conteudo');
  const tituloTopo = document.getElementById('tituloTopo');
  const btnVoltar = document.getElementById('btnVoltar');
  const btnCatalogo = document.getElementById('btnCatalogo');
  const toastEl = document.getElementById('toast');
  const tabs = document.querySelectorAll('.tab');
  const ROOTS = ['#/inicio', '#/pedidos', '#/cabecotes', '#/encerrados', '#/dashboard'];

  let catalogoCache = { cabecotes: [], servicos: [], pecas: [], categorias: [], clientes: [] };

  // ---------- utilidades ----------

  function toast(msg, erro) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('erro', !!erro);
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json; charset=UTF-8';
      opts.body = JSON.stringify(body);
    }
    let resp;
    try {
      resp = await fetch(path, opts);
    } catch (e) {
      toast('Sem conexão com o servidor.', true);
      throw e;
    }
    if (resp.status === 204) return null;
    if (!resp.ok) {
      toast('Erro ao acessar ' + path + ' (' + resp.status + ')', true);
      throw new Error('HTTP ' + resp.status);
    }
    const ct = resp.headers.get('content-type') || '';
    return ct.includes('application/json') ? resp.json() : resp;
  }

  // Busca o PDF do orçamento em segundo plano (chamar assim que a tela abre,
  // bem antes do usuário tocar em "Gerar orçamento"). No iOS/Safari o
  // navigator.share() com arquivo só funciona se for chamado bem perto do
  // toque — pré-carregar o PDF evita que o fetch "gaste" essa janela de gesto.
  function prepararOrcamento(id) {
    const promise = fetch('/api/pedidos/' + id + '/pdf')
      .then(r => r.ok ? r.blob() : Promise.reject(new Error('HTTP ' + r.status)));
    promise.catch(() => {}); // evita "unhandled rejection" antes do clique
    return promise;
  }

  // Compartilha o PDF já pré-carregado pelo menu nativo do celular (WhatsApp,
  // e-mail, etc.); sem suporte, abre o PDF numa aba.
  async function compartilharOrcamento(pdfPromise, nomeArquivo, novaAba) {
    let blob;
    try {
      blob = await pdfPromise;
    } catch (e) {
      if (novaAba) novaAba.close();
      toast('Não foi possível gerar o orçamento.', true);
      return;
    }

    if (navigator.canShare && navigator.share) {
      const file = new File([blob], nomeArquivo, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        if (novaAba) novaAba.close();
        try {
          await navigator.share({ files: [file], title: 'Orçamento', text: 'Orçamento da retífica' });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return; // usuário cancelou o menu — tudo bem
          window.open(URL.createObjectURL(blob), '_blank'); // ex.: gesto expirado no iOS
          return;
        }
      }
    }

    // Fallback (desktop / navegadores sem Web Share de arquivos): abre o PDF na aba já criada.
    const url = URL.createObjectURL(blob);
    if (novaAba) novaAba.location.href = url;
    else window.open(url, '_blank');
  }

  function moeda(v) {
    const n = Number(v || 0);
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function el(tag, attrs, ...filhos) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const f of filhos.flat()) {
      if (f === null || f === undefined) continue;
      e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
    }
    return e;
  }

  // — decoração "blueprint": cantos em L nos cards/botões —
  function corners() {
    return ['tl', 'tr', 'bl', 'br'].map(pos => el('i', { class: 'corner ' + pos }));
  }
  function blueprintBox(tag, attrs, ...filhos) {
    attrs = Object.assign({}, attrs, { class: ((attrs && attrs.class) || '') + ' blueprint' });
    return el(tag, attrs, ...corners(), ...filhos);
  }
  function btnBlueprint(texto, cls, attrs) {
    return blueprintBox('button', Object.assign({ type: 'button' }, attrs, { class: 'btn ' + cls }), texto);
  }

  const STATUS_OPCOES = [['ABERTO', 'Aberto'], ['EM_ANDAMENTO', 'Em andamento'], ['PRONTO', 'Pronto']];

  function tagSituacao(situacao) {
    const map = { 'Aberto': 'tag-neutral', 'Em andamento': 'tag-outline', 'Pronto': 'tag-accent', 'Atrasado': 'tag-accent-2', 'Finalizado': 'tag-neutral' };
    return el('span', { class: 'tag ' + (map[situacao] || 'tag-neutral') }, situacao);
  }

  async function carregarCatalogos() {
    const [cabecotes, servicos, pecas, categorias, clientes] = await Promise.all([
      api('GET', '/api/cabecotes'),
      api('GET', '/api/servicos-catalogo'),
      api('GET', '/api/pecas-catalogo'),
      api('GET', '/api/categorias'),
      api('GET', '/api/clientes'),
    ]);
    catalogoCache = { cabecotes, servicos, pecas, categorias, clientes };
  }

  // ---------- router ----------

  const rotas = [
    { re: /^#\/inicio$/, fn: () => telaInicio() },
    { re: /^#\/pedidos$/, fn: () => telaPedidos() },
    { re: /^#\/pedidos\/novo$/, fn: () => telaFormPedido(null) },
    { re: /^#\/pedidos\/(\d+)\/editar$/, fn: (m) => telaFormPedido(m[1]) },
    { re: /^#\/pedidos\/(\d+)$/, fn: (m) => telaVisualizarPedido(m[1]) },
    { re: /^#\/cabecotes$/, fn: () => telaCabecotes() },
    { re: /^#\/catalogo$/, fn: () => telaCatalogoMenu() },
    { re: /^#\/servicos$/, fn: () => telaCatalogo('servicos') },
    { re: /^#\/pecas$/, fn: () => telaCatalogo('pecas') },
    { re: /^#\/clientes$/, fn: () => telaClientes() },
    { re: /^#\/encerrados$/, fn: () => telaEncerrados() },
    { re: /^#\/dashboard$/, fn: () => telaDashboardEncerrados() },
  ];

  function rotear() {
    const hash = location.hash || '#/inicio';
    const raiz = '#/' + (hash.split('/')[1] || 'inicio');
    tabs.forEach(t => t.classList.toggle('active', ('#/' + t.dataset.tab) === raiz));
    btnVoltar.hidden = ROOTS.includes(hash);
    conteudo.scrollTop = 0;

    for (const r of rotas) {
      const m = hash.match(r.re);
      if (m) { r.fn(m); return; }
    }
    telaInicio();
  }

  btnVoltar.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = '#/inicio';
  });
  btnCatalogo.addEventListener('click', () => { location.hash = '#/catalogo'; });
  tabs.forEach(t => t.addEventListener('click', () => { location.hash = '#/' + t.dataset.tab; }));
  window.addEventListener('hashchange', rotear);

  // ---------- Início (dashboard) ----------

  async function telaInicio() {
    tituloTopo.textContent = 'Retífica';
    conteudo.innerHTML = '';
    const dash = await api('GET', '/api/pedidos/dashboard');
    conteudo.innerHTML = '';

    const hoje = new Date();
    conteudo.appendChild(el('h2', { class: 'titulo' }, 'Retífica'));
    conteudo.appendChild(el('div', { class: 'subtitulo' }, hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })));

    conteudo.appendChild(el('div', { class: 'stat-grid' },
      statCard('Em aberto', dash.abertos, 'pedidos'),
      statCard('Entregas hoje', dash.hoje, 'pedidos'),
      statCard('Prontos', dash.prontos, 'p/ retirada'),
      statCard('Atrasados', dash.atrasados, 'pedidos'),
    ));

    conteudo.appendChild(el('div', { class: 'btn-group', style: 'margin-top:0;margin-bottom:24px' },
      btnBlueprint('Novo pedido', 'btn-primary', { onclick: () => { location.hash = '#/pedidos/novo'; } }),
      btnBlueprint('Ver pedidos', 'btn-secondary', { onclick: () => { location.hash = '#/pedidos'; } }),
    ));

    conteudo.appendChild(el('h2', { class: 'secao' }, 'Entregas de hoje'));
    if (!dash.entregasHoje.length) {
      conteudo.appendChild(el('div', { class: 'empty' }, 'Nenhuma entrega prevista para hoje.'));
    } else {
      dash.entregasHoje.forEach(p => conteudo.appendChild(linhaPedido(p)));
    }
  }

  function statCard(kicker, valor, sub) {
    return blueprintBox('div', { class: 'stat-card' },
      el('div', { class: 'stat-kicker' }, kicker),
      el('div', { class: 'stat-value' }, String(valor)),
      el('div', { class: 'stat-sub' }, sub),
    );
  }

  // ---------- Pedidos: lista ----------

  async function telaPedidos() {
    tituloTopo.textContent = 'Pedidos';
    conteudo.innerHTML = '';
    conteudo.appendChild(el('div', { class: 'empty' }, 'Carregando...'));

    const pedidos = await api('GET', '/api/pedidos');
    conteudo.innerHTML = '';

    conteudo.appendChild(el('h2', { class: 'titulo' }, 'Pedidos'));
    conteudo.appendChild(el('div', { class: 'subtitulo' }, pedidos.filter(p => !p.finalizado).length + ' em aberto'));

    if (!pedidos.length) {
      conteudo.appendChild(el('div', { class: 'empty' }, 'Nenhum pedido cadastrado ainda.'));
    } else {
      pedidos.forEach(p => conteudo.appendChild(linhaPedido(p)));
    }

    conteudo.appendChild(btnBlueprint('+', 'btn-primary btn-fab', {
      'aria-label': 'Novo pedido', onclick: () => { location.hash = '#/pedidos/novo'; }
    }));
  }

  function linhaPedido(p) {
    return el('div', {
      class: 'linha', onclick: () => { location.hash = '#/pedidos/' + p.id; }
    },
      el('div', { class: 'linha-topo' },
        el('span', { class: 'linha-titulo' }, p.clienteNome || '-'),
        tagSituacao(p.situacao)
      ),
      el('div', { class: 'linha-sub' }, p.componentesResumo || '-'),
      el('div', { class: 'linha-meta' },
        svgCalendario(),
        el('span', null, (p.finalizado ? 'Entregue ' : 'Entrega ') + (p.dataEntrega || '-') + '  ·  ' + moeda(p.totalGeral))
      )
    );
  }

  function svgCalendario() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '13'); s.setAttribute('height', '13'); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5');
    s.innerHTML = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>';
    return s;
  }

  // ---------- Pedido: visualizar ----------

  async function telaVisualizarPedido(id) {
    tituloTopo.textContent = 'Pedido #' + id;
    conteudo.innerHTML = '';
    const p = await api('GET', '/api/pedidos/' + id);
    if (!p) { conteudo.appendChild(el('div', { class: 'empty' }, 'Pedido não encontrado.')); return; }

    const pdfPromise = prepararOrcamento(id);

    conteudo.appendChild(blueprintBox('div', { style: 'padding:14px;margin-bottom:16px' },
      el('div', { class: 'linha-titulo', style: 'margin-bottom:8px' }, p.cliente ? p.cliente.nome : '-'),
      p.cliente && p.cliente.telefone ? el('div', { class: 'linha-sub' }, p.cliente.telefone) : null,
      (p.cliente && (p.cliente.rua || p.cliente.municipio)) ? el('div', { class: 'linha-sub' },
        [p.cliente.rua, p.cliente.numero].filter(Boolean).join(', ') +
        (p.cliente.bairro ? ' – ' + p.cliente.bairro : '') +
        (p.cliente.municipio ? ', ' + p.cliente.municipio + (p.cliente.uf ? '/' + p.cliente.uf : '') : '')
      ) : null,
    ));

    conteudo.appendChild(el('div', { style: 'display:flex;flex-direction:column;gap:8px;font-size:13px;margin-bottom:16px' },
      linhaChave('Componentes', (p.componentes && p.componentes.length ? p.componentes.map(c => c.nome).join(', ') : p.pedidoDescricao) || '-'),
      linhaChave('Criado em', p.datCriacao || '-'),
      linhaChave('Entrega estimada', p.datEntregaEstimada ? formatarDataBr(p.datEntregaEstimada) : '-'),
      linhaChaveTag('Situação', p.situacao),
    ));

    conteudo.appendChild(el('h2', { class: 'secao' }, 'Serviços'));
    conteudo.appendChild(tabelaItens(p.servicos, 'Nenhum serviço.'));

    conteudo.appendChild(el('h2', { class: 'secao' }, 'Peças'));
    conteudo.appendChild(tabelaItens(p.pecas, 'Nenhuma peça utilizada.'));

    conteudo.appendChild(el('div', { class: 'total-box' },
      el('span', null, 'Total'), el('span', { class: 'valor' }, moeda(p.totalGeral))
    ));

    if (p.observacao) {
      conteudo.appendChild(el('div', { style: 'font-size:12px;opacity:.75;background:var(--color-surface);padding:10px;margin-top:16px' }, p.observacao));
    }

    const acoes = el('div', { class: 'btn-group' });
    if (!p.finalizado) {
      acoes.appendChild(btnBlueprint('Finalizar pedido', 'btn-primary', {
        onclick: async () => {
          if (!confirm('Finalizar o pedido #' + id + '? A data de entrega será registrada agora.')) return;
          await api('POST', '/api/pedidos/' + id + '/finalizar');
          toast('Pedido finalizado.');
          telaVisualizarPedido(id);
        }
      }));
    }
    conteudo.appendChild(acoes);

    const acoes2 = el('div', { class: 'btn-group' });
    acoes2.appendChild(btnBlueprint('Gerar orçamento', 'btn-secondary', {
      onclick: () => {
        // Reserva a aba já no clique (síncrono) — evita bloqueio de pop-up
        // se o compartilhamento por arquivo não estiver disponível.
        const novaAba = window.open('', '_blank');
        compartilharOrcamento(pdfPromise, 'orcamento-' + id + '.pdf', novaAba);
      }
    }));
    if (!p.finalizado) {
      acoes2.appendChild(btnBlueprint('Editar', 'btn-secondary', {
        onclick: () => { location.hash = '#/pedidos/' + id + '/editar'; }
      }));
    }
    conteudo.appendChild(acoes2);

    conteudo.appendChild(el('button', {
      class: 'btn btn-ghost btn-block', style: 'margin-top:8px', type: 'button', onclick: async () => {
        if (!confirm('Deletar o pedido #' + id + '? Essa ação não pode ser desfeita.')) return;
        await api('DELETE', '/api/pedidos/' + id);
        toast('Pedido deletado.');
        location.hash = '#/pedidos';
      }
    }, 'Excluir pedido'));
  }

  function linhaChave(rotulo, valor) {
    return el('div', { style: 'display:flex;justify-content:space-between' },
      el('span', { style: 'opacity:.55' }, rotulo), el('span', { style: 'font-weight:600' }, valor));
  }
  function linhaChaveTag(rotulo, situacao) {
    return el('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
      el('span', { style: 'opacity:.55' }, rotulo), tagSituacao(situacao));
  }

  function tabelaItens(itens, vazio) {
    if (!itens || !itens.length) {
      return el('div', { class: 'empty', style: 'padding:16px 0' }, vazio);
    }
    const box = el('div', {});
    itens.forEach(i => {
      box.appendChild(el('div', { class: 'item-linha' },
        el('div', null,
          el('div', null, i.descricao),
          el('div', { style: 'opacity:.55;font-size:11px;margin-top:2px' }, i.quantidade + ' × ' + moeda(i.valorUnitario))
        ),
        el('div', { style: 'font-weight:600' }, moeda(i.valorTotal))
      ));
    });
    return box;
  }

  function formatarDataBr(iso) {
    const [ano, mes, dia] = iso.split('-');
    return dia + '/' + mes + '/' + ano;
  }

  // ---------- Pedido: criar/editar ----------

  async function telaFormPedido(id) {
    tituloTopo.textContent = id ? 'Editar pedido #' + id : 'Novo pedido';
    conteudo.innerHTML = '';
    conteudo.appendChild(el('div', { class: 'empty' }, 'Carregando...'));

    await carregarCatalogos();
    let pedido = null;
    if (id) pedido = await api('GET', '/api/pedidos/' + id);

    const linhasServicos = pedido ? pedido.servicos.map(clonarItem) : [];
    const linhasPecas = pedido ? pedido.pecas.map(clonarItem) : [];
    const linhasComponentes = pedido && pedido.componentes
      ? pedido.componentes.map(c => ({ id: c.id, nome: c.nome }))
      : [];
    const categoriasSelecionadas = new Set(pedido && pedido.categorias ? pedido.categorias : []);
    linhasComponentes.forEach(item => {
      // Compatibilidade: garante que a categoria de cada componente já
      // vinculado apareça marcada, senão o campo ficaria oculto ao editar.
      const catalogo = catalogoCache.cabecotes.find(c => c.id === item.id);
      if (catalogo) categoriasSelecionadas.add(catalogo.categoria);
    });
    let clienteSelecionado = pedido && pedido.cliente
      ? { id: pedido.cliente.id, nome: pedido.cliente.nome, telefone: pedido.cliente.telefone }
      : null;
    let abaAtual = 'pedido';

    conteudo.innerHTML = '';

    // — componentes técnicos (cabeçote/bloco/biela/virabrequim): o seletor só
    // aparece quando a categoria correspondente estiver marcada em
    // "Categorias envolvidas"; um pedido pode ter mais de um componente —
    const CATEGORIAS_COMPONENTE = ['CABECOTE', 'BLOCO', 'BIELA', 'VIRABREQUIM'];
    const selComponente = el('select', { class: 'input' });
    const listaComponentesEl = el('div', {});

    function redesenharComponentes() {
      listaComponentesEl.innerHTML = '';
      if (!linhasComponentes.length) {
        listaComponentesEl.appendChild(el('div', { style: 'text-align:center;font-size:13px;opacity:.55;padding:10px 0' }, 'Nenhum componente adicionado ainda'));
        return;
      }
      linhasComponentes.forEach((item, idx) => {
        listaComponentesEl.appendChild(el('div', { class: 'item-linha' },
          el('span', null, item.nome),
          el('button', { onclick: () => { linhasComponentes.splice(idx, 1); redesenharComponentes(); } }, '✕')
        ));
      });
    }

    const campoComponente = el('div', { hidden: true },
      el('div', { class: 'field' },
        el('label', null, 'Componentes (cabeçote / bloco / biela / virabrequim)'),
        el('div', { style: 'display:flex;gap:8px' }, selComponente)
      ),
      btnBlueprint('Adicionar componente', 'btn-secondary btn-block', {
        onclick: () => {
          const item = catalogoCache.cabecotes.find(c => String(c.id) === selComponente.value);
          if (!item) { toast('Selecione um componente.', true); return; }
          if (linhasComponentes.some(c => c.id === item.id)) { toast('Esse componente já foi adicionado.', true); return; }
          linhasComponentes.push({ id: item.id, nome: item.nome });
          selComponente.value = '';
          redesenharComponentes();
        }
      }),
      listaComponentesEl
    );

    function atualizarOpcoesComponente() {
      const relevantes = CATEGORIAS_COMPONENTE.filter(cat => categoriasSelecionadas.has(cat));
      selComponente.innerHTML = '';
      if (!relevantes.length) {
        campoComponente.hidden = true;
        return;
      }
      campoComponente.hidden = false;
      selComponente.appendChild(el('option', { value: '' }, 'Selecione'));
      const filtrado = catalogoCache.cabecotes.filter(c => relevantes.includes(c.categoria));
      agruparPorCategoria(filtrado).forEach(grupo => {
        selComponente.appendChild(el('optgroup', { label: grupo.rotulo },
          ...grupo.itens.map(i => el('option', { value: i.id }, i.nome))
        ));
      });
    }
    redesenharComponentes();

    const fldStatus = el('select', { class: 'input' },
      ...STATUS_OPCOES.map(([valor, rotulo]) => {
        const opt = el('option', { value: valor }, rotulo);
        if (pedido ? pedido.status === valor : valor === 'ABERTO') opt.selected = true;
        return opt;
      })
    );
    const fldDescricao = el('input', { class: 'input', type: 'text', placeholder: 'Ex.: Retífica completa', value: pedido ? (pedido.pedidoDescricao || '') : '' });
    const fldEntrega = el('input', { class: 'input', type: 'date', value: pedido ? (pedido.datEntregaEstimada || '') : '' });
    const fldObservacao = el('textarea', { class: 'input', rows: '4', placeholder: 'Detalhes adicionais do serviço' }, pedido ? (pedido.observacao || '') : '');

    // — chips de categoria: filtram os serviços/peças disponíveis abaixo —
    const chipsCategoria = catalogoCache.categorias.filter(cat => CATEGORIAS_COMPONENTE.includes(cat.nome)).map(cat => {
      const btn = el('button', {
        type: 'button',
        class: 'chip' + (categoriasSelecionadas.has(cat.nome) ? ' active' : ''),
        onclick: () => {
          if (categoriasSelecionadas.has(cat.nome)) categoriasSelecionadas.delete(cat.nome);
          else categoriasSelecionadas.add(cat.nome);
          btn.classList.toggle('active');
          atualizarOpcoesServico();
          atualizarOpcoesPeca();
          atualizarOpcoesComponente();
        }
      }, cat.rotulo);
      return btn;
    });
    const painelCategorias = el('div', { class: 'chip-group' }, ...chipsCategoria);

    // — Cliente: box do selecionado + busca/seleção + cadastro rápido —
    const clienteBoxSelecionado = el('div', { hidden: true });
    const fldBuscaCliente = el('input', { class: 'input', type: 'search', placeholder: 'Buscar por nome ou telefone...' });
    const selCliente = el('select', { class: 'input', size: '6' });
    const buscaClienteBox = el('div', {}, campo('Buscar cliente', fldBuscaCliente), selCliente);

    function atualizarClienteUI() {
      clienteBoxSelecionado.innerHTML = '';
      if (clienteSelecionado) {
        clienteBoxSelecionado.hidden = false;
        buscaClienteBox.hidden = true;
        // Já tem cliente escolhido — não faz sentido oferecer cadastro de outro
        // aqui; pra trocar de cliente, usa o botão "Trocar" abaixo.
        btnNovoCliente.hidden = true;
        novoClienteBox.hidden = true;
        clienteBoxSelecionado.appendChild(el('div', { class: 'cliente-selecionado' },
          el('div', null,
            el('div', { style: 'font-weight:600' }, clienteSelecionado.nome),
            el('div', { style: 'font-size:12px;opacity:.7' }, clienteSelecionado.telefone || '')
          ),
          el('button', { type: 'button', onclick: () => { clienteSelecionado = null; atualizarClienteUI(); } }, 'Trocar')
        ));
      } else {
        clienteBoxSelecionado.hidden = true;
        buscaClienteBox.hidden = false;
        btnNovoCliente.hidden = false;
      }
    }

    function atualizarListaClientes() {
      const termo = fldBuscaCliente.value.trim().toLowerCase();
      const filtrados = !termo ? catalogoCache.clientes : catalogoCache.clientes.filter(c =>
        (c.nome || '').toLowerCase().includes(termo) || (c.telefone || '').toLowerCase().includes(termo));
      selCliente.innerHTML = '';
      if (!filtrados.length) {
        selCliente.appendChild(el('option', { value: '', disabled: 'disabled' }, 'Nenhum cliente encontrado'));
        return;
      }
      filtrados.forEach(c => {
        selCliente.appendChild(el('option', { value: c.id }, c.nome + (c.telefone ? ' — ' + c.telefone : '')));
      });
    }
    fldBuscaCliente.addEventListener('input', atualizarListaClientes);
    selCliente.addEventListener('change', () => {
      const c = catalogoCache.clientes.find(x => String(x.id) === selCliente.value);
      if (c) { clienteSelecionado = { id: c.id, nome: c.nome, telefone: c.telefone }; atualizarClienteUI(); }
    });
    atualizarListaClientes();

    const fldNovoNome = el('input', { class: 'input', type: 'text', placeholder: 'Nome completo' });
    const fldNovoTelefone = el('input', { class: 'input', type: 'tel', placeholder: '(11) 90000-0000' });
    const novoClienteBox = el('div', { hidden: true, style: 'margin-top:10px;display:flex;flex-direction:column;gap:12px' },
      campo('Nome', fldNovoNome),
      campo('Telefone', fldNovoTelefone),
      btnBlueprint('Salvar cliente', 'btn-secondary btn-block', {
        onclick: async () => {
          if (!fldNovoNome.value.trim()) { toast('Informe o nome.', true); return; }
          let novo;
          try {
            novo = await api('POST', '/api/clientes', {
              nome: fldNovoNome.value.trim(),
              telefone: fldNovoTelefone.value.trim() || null
            });
          } catch (e) { return; }
          catalogoCache.clientes.push(novo);
          clienteSelecionado = { id: novo.id, nome: novo.nome, telefone: novo.telefone };
          fldNovoNome.value = ''; fldNovoTelefone.value = '';
          novoClienteBox.hidden = true;
          atualizarListaClientes();
          atualizarClienteUI();
          toast('Cliente cadastrado.');
        }
      })
    );
    const btnNovoCliente = el('button', {
      type: 'button', class: 'btn btn-secondary btn-block',
      onclick: () => { novoClienteBox.hidden = !novoClienteBox.hidden; }
    }, 'Novo cliente');
    atualizarClienteUI();

    const listaServicosEl = el('div', {});
    const listaPecasEl = el('div', {});

    function redesenharItens(container, lista, redesenhar) {
      container.innerHTML = '';
      if (!lista.length) {
        container.appendChild(el('div', { style: 'text-align:center;font-size:13px;opacity:.55;padding:20px 0' }, 'Nenhum item adicionado ainda'));
        return;
      }
      lista.forEach((item, idx) => {
        container.appendChild(el('div', { class: 'item-linha' },
          el('span', null, item.descricao + ' ×' + item.quantidade),
          el('span', { class: 'valor' }, moeda(item.valorUnitario * item.quantidade)),
          el('button', { onclick: () => { lista.splice(idx, 1); redesenhar(); } }, '✕')
        ));
      });
    }
    const redesenharServicos = () => redesenharItens(listaServicosEl, linhasServicos, redesenharServicos);
    const redesenharPecas = () => redesenharItens(listaPecasEl, linhasPecas, redesenharPecas);
    redesenharServicos();
    redesenharPecas();

    function catalogoFiltrado(catalogo) {
      if (categoriasSelecionadas.size === 0) return catalogo;
      return catalogo.filter(item => categoriasSelecionadas.has(item.categoria));
    }

    function construirOpcoes(sel, catalogo) {
      sel.innerHTML = '';
      sel.appendChild(el('option', { value: '' }, 'Selecione'));
      const filtrado = catalogoFiltrado(catalogo);
      if (!filtrado.length) {
        sel.appendChild(el('option', { value: '', disabled: 'disabled' }, 'Nenhum item nessa(s) categoria(s)'));
      }
      agruparPorCategoria(filtrado).forEach(grupo => {
        sel.appendChild(el('optgroup', { label: grupo.rotulo },
          ...grupo.itens.map(i => el('option', { value: i.id }, i.nome + ' (' + moeda(i.valor) + ')'))
        ));
      });
    }

    function seletorAdicionar(catalogo, lista, redesenhar) {
      const sel = el('select', { class: 'input' });
      construirOpcoes(sel, catalogo);
      const qtd = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: '1', placeholder: 'Qtd', style: 'width:66px' });
      const elemento = el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
        el('div', { style: 'display:flex;gap:8px' }, sel, qtd),
        btnBlueprint('Adicionar', 'btn-secondary btn-block', {
          onclick: () => {
            const item = catalogo.find(c => String(c.id) === sel.value);
            if (!item) { toast('Selecione um item.', true); return; }
            const quantidade = Math.max(1, parseInt(qtd.value || '1', 10));
            lista.push({ descricao: item.nome, valorUnitario: item.valor, quantidade });
            sel.value = ''; qtd.value = '1';
            redesenhar();
          }
        })
      );
      return { elemento, atualizarOpcoes: () => construirOpcoes(sel, catalogo) };
    }

    const seletorServico = seletorAdicionar(catalogoCache.servicos, linhasServicos, redesenharServicos);
    const seletorPeca = seletorAdicionar(catalogoCache.pecas, linhasPecas, redesenharPecas);
    const atualizarOpcoesServico = seletorServico.atualizarOpcoes;
    const atualizarOpcoesPeca = seletorPeca.atualizarOpcoes;

    // Categorias podem já vir marcadas (edição/compatibilidade) — monta as
    // opções do componente já filtradas antes de exibir o formulário.
    atualizarOpcoesComponente();

    // — segmented control de abas —
    const painelPedido = el('div', { style: 'display:flex;flex-direction:column;gap:14px' },
      el('div', { class: 'field' }, el('label', null, 'Categorias envolvidas'), painelCategorias),
      campoComponente,
      campo('Situação', fldStatus),
      campo('Descrição', fldDescricao),
      campo('Entrega estimada', fldEntrega), campo('Observação', fldObservacao));
    const painelCliente = el('div', { style: 'display:flex;flex-direction:column;gap:0' },
      clienteBoxSelecionado, buscaClienteBox, btnNovoCliente, novoClienteBox);
    const painelServico = el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      seletorServico.elemento, listaServicosEl);
    const painelPeca = el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      seletorPeca.elemento, listaPecasEl);

    const paineis = { pedido: painelPedido, cliente: painelCliente, servico: painelServico, peca: painelPeca };
    const painelBox = el('div', { style: 'padding-top:16px' }, painelPedido);

    const segButtons = {};
    const seg = el('div', { class: 'seg' },
      ...[['pedido', 'Pedido'], ['cliente', 'Cliente'], ['servico', 'Serviço'], ['peca', 'Peça']].map(([k, rotulo]) => {
        const b = el('button', {
          type: 'button', onclick: () => selecionarAba(k)
        }, rotulo);
        segButtons[k] = b;
        return b;
      })
    );
    function selecionarAba(k) {
      abaAtual = k;
      Object.keys(segButtons).forEach(key => segButtons[key].classList.toggle('active', key === k));
      painelBox.innerHTML = '';
      painelBox.appendChild(paineis[k]);
    }
    selecionarAba('pedido');

    const form = el('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (!clienteSelecionado) { toast('Selecione ou cadastre um cliente.', true); selecionarAba('cliente'); return; }

        const body = {
          componenteIds: linhasComponentes.map(c => c.id),
          clienteId: clienteSelecionado.id,
          categorias: Array.from(categoriasSelecionadas),
          status: fldStatus.value,
          pedidoDescricao: fldDescricao.value.trim() || null,
          observacao: fldObservacao.value.trim() || null,
          datEntregaEstimada: fldEntrega.value || null,
          servicos: linhasServicos,
          pecas: linhasPecas,
        };

        const salvo = id
          ? await api('PUT', '/api/pedidos/' + id, body)
          : await api('POST', '/api/pedidos', body);
        toast('Pedido salvo.');
        location.hash = '#/pedidos/' + salvo.id;
      }
    }, seg, painelBox);

    conteudo.appendChild(form);

    conteudo.appendChild(el('div', { class: 'btn-group' },
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => form.requestSubmit() }, 'Salvar'),
      el('button', {
        type: 'button', class: 'btn btn-secondary',
        onclick: () => { location.hash = id ? '#/pedidos/' + id : '#/pedidos'; }
      }, 'Cancelar')
    ));
  }

  function clonarItem(i) {
    return { descricao: i.descricao, valorUnitario: i.valorUnitario, quantidade: i.quantidade };
  }

  function campo(rotulo, inputEl) {
    return el('div', { class: 'field' }, el('label', null, rotulo), inputEl);
  }

  function agruparPorCategoria(catalogo) {
    const mapa = new Map();
    catalogo.forEach(item => {
      const chave = item.categoriaRotulo || 'Outro';
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(item);
    });
    return Array.from(mapa.entries()).map(([rotulo, itens]) => ({ rotulo, itens }));
  }

  // ---------- Cabeçotes ----------

  async function telaCabecotes() {
    tituloTopo.textContent = 'Cabeçotes';
    conteudo.innerHTML = '';
    conteudo.appendChild(el('div', { class: 'empty' }, 'Carregando...'));
    const [lista, categorias] = await Promise.all([api('GET', '/api/cabecotes'), api('GET', '/api/categorias')]);
    conteudo.innerHTML = '';

    conteudo.appendChild(el('h2', { class: 'titulo' }, 'Cabeçotes'));
    conteudo.appendChild(el('div', { class: 'subtitulo' }, 'Cabeçotes, blocos, bielas e virabrequins — ' + lista.length + ' cadastrados'));

    let emEdicaoId = null;
    const fldCategoria = el('select', { class: 'input' }, ...categorias.map(c => el('option', { value: c.nome }, c.rotulo)));
    const fldNome = el('input', { class: 'input', type: 'text', placeholder: 'Nome / Motor' });
    const fldMovel = el('input', { class: 'input', type: 'text', placeholder: 'Móvel (ex.: 25,045-27,070)' });
    const fldFixo = el('input', { class: 'input', type: 'text', placeholder: 'Fixo (ex.: 29,990-30,015)' });

    const listaEl = el('div', {});

    function redesenhar(items) {
      listaEl.innerHTML = '';
      if (!items.length) {
        listaEl.appendChild(el('div', { class: 'empty' }, 'Nada cadastrado ainda.'));
        return;
      }
      agruparPorCategoria(items).forEach(grupo => {
        listaEl.appendChild(el('div', { class: 'grupo-categoria' },
          el('h3', null, grupo.rotulo),
          ...grupo.itens.map(c => el('div', { class: 'linha', onclick: () => {
            emEdicaoId = c.id;
            fldCategoria.value = c.categoria;
            fldNome.value = c.nome || '';
            fldMovel.value = c.movelFaixa || '';
            fldFixo.value = c.fixoFaixa || '';
            window.scrollTo(0, 0);
          } },
            el('div', { class: 'linha-titulo' }, c.nome),
            el('div', { style: 'display:flex;gap:18px;font-size:12px' },
              el('div', null, el('span', { style: 'opacity:.55' }, 'Móvel '), el('strong', null, (c.movelFaixa || '-') + ' mm')),
              el('div', null, el('span', { style: 'opacity:.55' }, 'Fixo '), el('strong', null, (c.fixoFaixa || '-') + ' mm')),
            )
          ))
        ));
      });
    }
    redesenhar(lista);

    function limpar() {
      emEdicaoId = null; fldCategoria.selectedIndex = 0; fldNome.value = ''; fldMovel.value = ''; fldFixo.value = '';
    }

    const form = el('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (!fldNome.value.trim()) { toast('Informe o nome.', true); return; }
        const body = {
          categoria: fldCategoria.value,
          nome: fldNome.value.trim(),
          movelFaixa: fldMovel.value.trim() || null,
          fixoFaixa: fldFixo.value.trim() || null
        };
        try {
          if (emEdicaoId) await api('PUT', '/api/cabecotes/' + emEdicaoId, body);
          else await api('POST', '/api/cabecotes', body);
        } catch (e) { return; }
        toast('Salvo.');
        limpar();
        telaCabecotes();
      }
    },
      el('h2', { class: 'secao' }, 'Novo / editar'),
      campo('Categoria', fldCategoria),
      campo('Nome / Motor', fldNome),
      el('div', { class: 'row' }, campo('Móvel', fldMovel), campo('Fixo', fldFixo)),
      el('div', { class: 'btn-group' },
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => limpar() }, 'Limpar'),
        el('button', {
          type: 'button', class: 'btn btn-danger', onclick: async () => {
            if (!emEdicaoId) { toast('Selecione um item na lista para remover.', true); return; }
            if (!confirm('Remover este item?')) return;
            await api('DELETE', '/api/cabecotes/' + emEdicaoId);
            toast('Removido.');
            limpar();
            telaCabecotes();
          }
        }, 'Remover')
      )
    );

    conteudo.appendChild(form);
    conteudo.appendChild(el('h2', { class: 'secao' }, 'Cadastrados'));
    conteudo.appendChild(listaEl);
  }

  // ---------- Clientes ----------

  async function telaClientes() {
    tituloTopo.textContent = 'Clientes';
    conteudo.innerHTML = '';
    conteudo.appendChild(el('div', { class: 'empty' }, 'Carregando...'));
    const lista = await api('GET', '/api/clientes');
    conteudo.innerHTML = '';

    conteudo.appendChild(el('h2', { class: 'titulo' }, 'Clientes'));
    conteudo.appendChild(el('div', { class: 'subtitulo' }, lista.length + ' cadastrados'));

    let emEdicaoId = null;
    const fldNome = el('input', { class: 'input', type: 'text', placeholder: 'Nome completo' });
    const fldTelefone = el('input', { class: 'input', type: 'tel', placeholder: '(11) 90000-0000' });
    const fldRua = el('input', { class: 'input', type: 'text' });
    const fldNumero = el('input', { class: 'input', type: 'text' });
    const fldBairro = el('input', { class: 'input', type: 'text' });
    const fldCep = el('input', { class: 'input', type: 'text' });
    const fldMunicipio = el('input', { class: 'input', type: 'text' });
    const fldUf = el('input', { class: 'input', type: 'text', maxlength: '2' });
    const fldBusca = el('input', { class: 'input', type: 'search', placeholder: 'Buscar por nome ou telefone...' });

    const listaEl = el('div', {});

    function redesenhar() {
      const termo = fldBusca.value.trim().toLowerCase();
      const filtrados = !termo ? lista : lista.filter(c =>
        (c.nome || '').toLowerCase().includes(termo) || (c.telefone || '').toLowerCase().includes(termo));

      listaEl.innerHTML = '';
      if (!filtrados.length) {
        listaEl.appendChild(el('div', { class: 'empty' }, termo ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'));
        return;
      }
      filtrados.forEach(c => {
        listaEl.appendChild(el('div', { class: 'linha', onclick: () => {
          emEdicaoId = c.id;
          fldNome.value = c.nome || '';
          fldTelefone.value = c.telefone || '';
          fldRua.value = c.rua || '';
          fldNumero.value = c.numero || '';
          fldBairro.value = c.bairro || '';
          fldCep.value = c.cep || '';
          fldMunicipio.value = c.municipio || '';
          fldUf.value = c.uf || '';
          window.scrollTo(0, 0);
        } },
          el('div', { class: 'linha-titulo' }, c.nome),
          el('div', { class: 'linha-sub' }, c.telefone || '-')
        ));
      });
    }
    redesenhar();
    fldBusca.addEventListener('input', redesenhar);

    function limpar() {
      emEdicaoId = null;
      fldNome.value = ''; fldTelefone.value = ''; fldRua.value = ''; fldNumero.value = '';
      fldBairro.value = ''; fldCep.value = ''; fldMunicipio.value = ''; fldUf.value = '';
    }

    const form = el('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (!fldNome.value.trim()) { toast('Informe o nome do cliente.', true); return; }
        const body = {
          nome: fldNome.value.trim(),
          telefone: fldTelefone.value.trim() || null,
          rua: fldRua.value.trim() || null,
          numero: fldNumero.value.trim() || null,
          bairro: fldBairro.value.trim() || null,
          cep: fldCep.value.trim() || null,
          municipio: fldMunicipio.value.trim() || null,
          uf: fldUf.value.trim() || null,
        };
        try {
          if (emEdicaoId) await api('PUT', '/api/clientes/' + emEdicaoId, body);
          else await api('POST', '/api/clientes', body);
        } catch (e) { return; }
        toast('Cliente salvo.');
        limpar();
        telaClientes();
      }
    },
      el('h2', { class: 'secao' }, 'Novo / editar'),
      campo('Nome', fldNome),
      campo('Telefone', fldTelefone),
      campo('Rua', fldRua),
      el('div', { class: 'row' }, campo('Número', fldNumero), campo('Bairro', fldBairro)),
      el('div', { class: 'row' }, campo('CEP', fldCep), campo('UF', fldUf)),
      campo('Município', fldMunicipio),
      el('div', { class: 'btn-group' },
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => limpar() }, 'Limpar'),
        el('button', {
          type: 'button', class: 'btn btn-danger', onclick: async () => {
            if (!emEdicaoId) { toast('Selecione um cliente na lista para remover.', true); return; }
            if (!confirm('Remover este cliente?')) return;
            try {
              await api('DELETE', '/api/clientes/' + emEdicaoId);
            } catch (e) {
              toast('Não foi possível remover: cliente tem pedidos vinculados.', true);
              return;
            }
            toast('Removido.');
            limpar();
            telaClientes();
          }
        }, 'Remover')
      )
    );

    conteudo.appendChild(form);
    conteudo.appendChild(el('h2', { class: 'secao' }, 'Cadastrados'));
    conteudo.appendChild(campo('Buscar', fldBusca));
    conteudo.appendChild(listaEl);
  }

  // ---------- Catálogo (menu Serviços/Peças) ----------

  function telaCatalogoMenu() {
    tituloTopo.textContent = 'Catálogo';
    conteudo.innerHTML = '';
    conteudo.appendChild(el('h2', { class: 'titulo' }, 'Catálogo'));
    conteudo.appendChild(el('div', { class: 'subtitulo' }, 'Clientes, serviços e peças usados nos orçamentos'));
    conteudo.appendChild(el('div', { class: 'catalogo-menu' },
      el('div', { class: 'linha', onclick: () => { location.hash = '#/clientes'; } },
        el('span', { class: 'linha-titulo' }, 'Clientes'), el('span', null, '→')),
      el('div', { class: 'linha', onclick: () => { location.hash = '#/servicos'; } },
        el('span', { class: 'linha-titulo' }, 'Serviços'), el('span', null, '→')),
      el('div', { class: 'linha', onclick: () => { location.hash = '#/pecas'; } },
        el('span', { class: 'linha-titulo' }, 'Peças'), el('span', null, '→')),
    ));
  }

  // ---------- Serviços / Peças (catálogo com categoria) ----------

  async function telaCatalogo(tipo) {
    const isServico = tipo === 'servicos';
    tituloTopo.textContent = isServico ? 'Serviços' : 'Peças';
    const base = isServico ? '/api/servicos-catalogo' : '/api/pecas-catalogo';

    conteudo.innerHTML = '';
    conteudo.appendChild(el('div', { class: 'empty' }, 'Carregando...'));
    const [lista, categorias] = await Promise.all([api('GET', base), api('GET', '/api/categorias')]);
    conteudo.innerHTML = '';

    conteudo.appendChild(el('h2', { class: 'titulo' }, isServico ? 'Serviços' : 'Peças'));
    conteudo.appendChild(el('div', { class: 'subtitulo' }, lista.length + ' cadastrados'));

    let emEdicaoId = null;
    const fldCategoria = el('select', { class: 'input' }, ...categorias.map(c => el('option', { value: c.nome }, c.rotulo)));
    const fldNome = el('input', { class: 'input', type: 'text', placeholder: isServico ? 'Nome do serviço' : 'Nome da peça' });
    const fldValor = el('input', { class: 'input', type: 'number', step: '0.01', min: '0', placeholder: '0.00' });

    const listaEl = el('div', {});

    function redesenhar(items) {
      listaEl.innerHTML = '';
      if (!items.length) {
        listaEl.appendChild(el('div', { class: 'empty' }, 'Nada cadastrado ainda.'));
        return;
      }
      agruparPorCategoria(items).forEach(grupo => {
        listaEl.appendChild(el('div', { class: 'grupo-categoria' },
          el('h3', null, grupo.rotulo),
          ...grupo.itens.map(item => el('div', { class: 'linha', onclick: () => {
            emEdicaoId = item.id;
            fldCategoria.value = item.categoria;
            fldNome.value = item.nome || '';
            fldValor.value = item.valor != null ? item.valor : '';
            window.scrollTo(0, 0);
          } },
            el('div', { class: 'linha-topo' },
              el('span', { class: 'linha-titulo', style: 'font-size:15px' }, item.nome),
              el('span', { style: 'font-weight:600' }, moeda(item.valor))
            )
          ))
        ));
      });
    }
    redesenhar(lista);

    function limpar() { emEdicaoId = null; fldCategoria.selectedIndex = 0; fldNome.value = ''; fldValor.value = ''; }

    const form = el('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (!fldNome.value.trim()) { toast('Informe o nome.', true); return; }
        const body = { categoria: fldCategoria.value, nome: fldNome.value.trim(), valor: Number(fldValor.value || 0) };
        try {
          if (emEdicaoId) await api('PUT', base + '/' + emEdicaoId, body);
          else await api('POST', base, body);
        } catch (e) { return; }
        toast('Salvo.');
        limpar();
        telaCatalogo(tipo);
      }
    },
      el('h2', { class: 'secao' }, 'Novo / editar'),
      campo('Categoria', fldCategoria),
      campo('Nome', fldNome),
      campo('Valor (R$) — pode deixar 0 e ajustar depois', fldValor),
      el('div', { class: 'btn-group' },
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => limpar() }, 'Limpar'),
        el('button', {
          type: 'button', class: 'btn btn-danger', onclick: async () => {
            if (!emEdicaoId) { toast('Selecione um item na lista para remover.', true); return; }
            if (!confirm('Remover este item do catálogo?')) return;
            await api('DELETE', base + '/' + emEdicaoId);
            toast('Removido.');
            limpar();
            telaCatalogo(tipo);
          }
        }, 'Remover')
      )
    );

    conteudo.appendChild(form);
    conteudo.appendChild(el('h2', { class: 'secao' }, 'Cadastrados'));
    conteudo.appendChild(listaEl);
  }

  // ---------- Encerrados ----------

  async function telaEncerrados() {
    tituloTopo.textContent = 'Encerrados';
    conteudo.innerHTML = '';
    conteudo.appendChild(el('div', { class: 'empty' }, 'Carregando...'));
    const grupos = await api('GET', '/api/pedidos/encerrados');
    conteudo.innerHTML = '';

    conteudo.appendChild(el('h2', { class: 'titulo' }, 'Encerrados'));
    const totalPedidos = grupos.reduce((a, g) => a + g.quantidade, 0);
    conteudo.appendChild(el('div', { class: 'subtitulo' }, totalPedidos + ' pedidos concluídos'));

    if (!grupos.length) {
      conteudo.appendChild(el('div', { class: 'empty' }, 'Nenhum pedido encerrado ainda.'));
      return;
    }

    grupos.forEach(grupo => {
      const corpo = el('div', { class: 'accordion-body' }, ...grupo.pedidos.map(linhaPedido));
      const cab = el('div', { class: 'accordion-cab' },
        el('span', { class: 'linha-titulo' }, grupo.mes),
        el('span', { style: 'font-size:12px;opacity:.6' }, grupo.quantidade + ' · ' + moeda(grupo.total))
      );
      cab.addEventListener('click', () => { corpo.hidden = !corpo.hidden; });
      conteudo.appendChild(el('div', { style: 'margin-bottom:12px' }, cab, corpo));
    });
  }

  // ---------- Dashboard de encerrados ----------

  async function telaDashboardEncerrados() {
    tituloTopo.textContent = 'Dashboard';
    conteudo.innerHTML = '';
    conteudo.appendChild(el('div', { class: 'empty' }, 'Carregando...'));
    const grupos = await api('GET', '/api/pedidos/encerrados');
    conteudo.innerHTML = '';

    conteudo.appendChild(el('h2', { class: 'titulo' }, 'Dashboard'));
    conteudo.appendChild(el('div', { class: 'subtitulo' }, 'Pedidos encerrados, valores por cliente e por serviço'));

    if (!grupos.length) {
      conteudo.appendChild(el('div', { class: 'empty' }, 'Nenhum pedido encerrado ainda.'));
      return;
    }

    let mesSelecionado = grupos[0].mes;

    const selMes = el('select', { class: 'input' },
      ...grupos.map(g => el('option', { value: g.mes }, g.mes))
    );
    selMes.addEventListener('change', () => {
      mesSelecionado = selMes.value;
      redesenhar();
    });
    conteudo.appendChild(el('div', { class: 'field' }, selMes));

    const corpo = el('div', {});
    conteudo.appendChild(corpo);

    function redesenhar() {
      const grupo = grupos.find(g => g.mes === mesSelecionado);
      corpo.innerHTML = '';
      if (!grupo) return;

      corpo.appendChild(el('div', { class: 'stat-grid' },
        statCard('Total do mês', moeda(grupo.total), grupo.quantidade + (grupo.quantidade === 1 ? ' pedido' : ' pedidos')),
        statCard('Pedidos encerrados', String(grupo.quantidade), grupo.mes),
      ));

      corpo.appendChild(el('h2', { class: 'secao' }, 'Pedidos do mês'));
      grupo.pedidos.forEach(p => corpo.appendChild(linhaPedido(p)));

      corpo.appendChild(blocoAgregado('Valor por cliente', grupo.porCliente, grupo.total));
      corpo.appendChild(blocoAgregado('Valor por serviço', grupo.porServico, grupo.total));
    }

    redesenhar();
  }

  // Bloco reaproveitado pra "valor por cliente" e "valor por serviço": gráfico
  // de barras horizontais + tabela + subtotal — mesma lógica pros dois.
  function blocoAgregado(titulo, itens, totalGeral) {
    const wrap = el('div', { style: 'margin-top:4px' });
    wrap.appendChild(el('h2', { class: 'secao' }, titulo));
    if (!itens || !itens.length) {
      wrap.appendChild(el('div', { class: 'empty' }, 'Sem dados.'));
      return wrap;
    }
    const maior = Math.max(...itens.map(i => Number(i.total)));
    wrap.appendChild(el('div', { class: 'bar-list' },
      ...itens.map(i => el('div', { class: 'bar-row' },
        el('div', { class: 'bar-row-top' },
          el('span', { class: 'bar-label' }, i.descricao),
          el('span', { class: 'bar-value' }, moeda(i.total)),
        ),
        el('div', { class: 'bar-track' },
          el('div', { class: 'bar-fill', style: 'width:' + (maior > 0 ? (Number(i.total) / maior * 100) : 0) + '%' }),
        ),
      ))
    ));
    wrap.appendChild(el('div', { class: 'total-box' },
      el('span', null, 'Total (' + titulo.replace('Valor por ', '') + ')'),
      el('span', { class: 'valor' }, moeda(totalGeral)),
    ));
    return wrap;
  }

  // ---------- boot ----------

  rotear();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
