import { agruparPorCategoria } from './lista-agrupada';
import { exibirAoSair, formatarTelefone, mascararAoDigitar, telefoneCombina, telefoneExibicao } from './telefone';
import { cadastrados, chaveNome, filtrarPorPalavras } from './texto';

describe('texto', () => {
  it('chaveNome ignora maiúsculas e espaços das pontas', () => {
    expect(chaveNome('  Junta ABC ')).toBe('junta abc');
    expect(chaveNome(null)).toBe('');
  });

  it('cadastrados concorda com o singular', () => {
    expect(cadastrados(1)).toBe('1 cadastrado');
    expect(cadastrados(0)).toBe('0 cadastrados');
  });

  it('filtrarPorPalavras: todas as palavras, sem acento, ordenado com números naturais', () => {
    const lista = [{ nome: 'Fire 16V' }, { nome: 'AP 10' }, { nome: 'AP 2' }, { nome: 'Opala Cabeçote' }];
    expect(filtrarPorPalavras(lista, 'ap').map(i => i.nome)).toEqual(['AP 2', 'AP 10']);
    expect(filtrarPorPalavras(lista, 'cabecote opala').map(i => i.nome)).toEqual(['Opala Cabeçote']);
    expect(filtrarPorPalavras(lista, '').length).toBe(4);
  });

  it('agruparPorCategoria usa "Outro" e mantém a ordem de aparição', () => {
    const grupos = agruparPorCategoria([
      { categoriaRotulo: 'B', n: 1 }, { categoriaRotulo: null, n: 2 }, { categoriaRotulo: 'B', n: 3 },
    ]);
    expect(grupos.map(g => g.rotulo)).toEqual(['B', 'Outro']);
    expect(grupos[0].itens.map(i => i.n)).toEqual([1, 3]);
  });
});

describe('telefone', () => {
  it('formata celular e fixo', () => {
    expect(formatarTelefone('31985565586')).toBe('(31) 98556-5586');
    expect(formatarTelefone('3133334444')).toBe('(31) 3333-4444');
    expect(formatarTelefone('319')).toBe('(31) 9');
  });

  it('exibição só formata 10/11 dígitos', () => {
    expect(telefoneExibicao('31985565586')).toBe('(31) 98556-5586');
    expect(telefoneExibicao('ramal 12')).toBe('ramal 12');
  });

  it('busca ignora a formatação mas texto com letras é busca por nome', () => {
    expect(telefoneCombina('(31) 99901-5257', '3199')).toBe(true);
    expect(telefoneCombina('(31) 99901-5257', 'rua 12')).toBe(false);
  });

  it('máscara ao digitar e ao sair do campo; apagar não reformata', () => {
    const campo = document.createElement('input');
    campo.value = '31985565586';
    const ev = new Event('input');
    Object.defineProperty(ev, 'target', { value: campo });
    expect(mascararAoDigitar(ev)).toBe('(31) 98556-5586');
    campo.value = '(31) 98556-';
    const apagar = new InputEvent('input', { inputType: 'deleteContentBackward' });
    Object.defineProperty(apagar, 'target', { value: campo });
    expect(mascararAoDigitar(apagar)).toBe('(31) 98556-');
    campo.value = '31985565586';
    const sair = new Event('blur');
    Object.defineProperty(sair, 'target', { value: campo });
    expect(exibirAoSair(sair)).toBe('(31) 98556-5586');
  });
});
