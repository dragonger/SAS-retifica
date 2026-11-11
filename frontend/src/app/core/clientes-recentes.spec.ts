import { CHAVE_CLIENTES_RECENTES } from './auth.service';
import { clientesRecentesIds, registrarClienteRecente } from './clientes-recentes';

describe('clientes recentes', () => {
  beforeEach(() => localStorage.clear());

  it('o mais recente vai para o começo, sem repetir', () => {
    registrarClienteRecente(1);
    registrarClienteRecente(2);
    registrarClienteRecente(1);
    expect(clientesRecentesIds()).toEqual([1, 2]);
  });

  it('guarda no máximo 6, na mesma chave do app atual', () => {
    for (let i = 1; i <= 8; i++) registrarClienteRecente(i);
    expect(clientesRecentesIds()).toEqual([8, 7, 6, 5, 4, 3]);
    expect(JSON.parse(localStorage.getItem(CHAVE_CLIENTES_RECENTES)!)).toEqual([8, 7, 6, 5, 4, 3]);
  });

  it('valor inválido no localStorage vira lista vazia', () => {
    localStorage.setItem(CHAVE_CLIENTES_RECENTES, 'xx');
    expect(clientesRecentesIds()).toEqual([]);
    localStorage.setItem(CHAVE_CLIENTES_RECENTES, '{"a":1}');
    expect(clientesRecentesIds()).toEqual([]);
  });
});
