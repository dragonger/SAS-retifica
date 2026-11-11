import { UrlSegment } from '@angular/router';
import { pedidoPorId } from './app.routes';

const segs = (...partes: string[]) => partes.map(p => new UrlSegment(p, {}));

describe('pedidoPorId', () => {
  it('pedidos/<dígitos> casa e devolve o id', () => {
    const r = pedidoPorId()(segs('pedidos', '137'), null as never, null as never);
    expect(r?.posParams?.['id'].path).toBe('137');
  });

  it('pedidos/<id>/editar só casa com o matcher de editar', () => {
    expect(pedidoPorId('editar')(segs('pedidos', '12', 'editar'), null as never, null as never)?.posParams?.['id'].path).toBe('12');
    expect(pedidoPorId()(segs('pedidos', '12', 'editar'), null as never, null as never)).toBeNull();
    expect(pedidoPorId('editar')(segs('pedidos', '12'), null as never, null as never)).toBeNull();
  });

  it('id que não é só dígitos não casa (novo, abc, 12a, vazio)', () => {
    for (const id of ['novo', 'abc', '12a', '1.5', '']) {
      expect(pedidoPorId()(segs('pedidos', id), null as never, null as never)).toBeNull();
    }
  });

  it('outros prefixos não casam', () => {
    expect(pedidoPorId()(segs('clientes', '1'), null as never, null as never)).toBeNull();
  });
});
