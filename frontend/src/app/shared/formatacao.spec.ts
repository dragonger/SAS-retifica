import { rotuloMes, textoDataIso } from './formatacao';

describe('formatacao: datas do Alto Medidas', () => {
  it('textoDataIso: vazio, data ISO e valor inválido', () => {
    expect(textoDataIso(null)).toBe('');
    expect(textoDataIso('')).toBe('');
    expect(textoDataIso('2026-10-25T15:00:00')).toBe('25/10/2026');
    expect(textoDataIso('lixo-qualquer')).toBe('lixo-qualq');
  });

  it('rotuloMes: "2026-10" vira "Outubro de 2026"; texto estranho volta como veio', () => {
    expect(rotuloMes('2026-10')).toBe('Outubro de 2026');
    expect(rotuloMes('2026-01')).toBe('Janeiro de 2026');
    expect(rotuloMes('todos')).toBe('todos');
  });
});
