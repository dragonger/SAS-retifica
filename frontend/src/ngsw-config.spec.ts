import config from '../ngsw-config.json';

interface Grupo {
  name: string;
  installMode: string;
  resources: { files: string[]; urls?: string[] };
}

describe('ngsw-config.json', () => {
  const c = config as unknown as { index: string; assetGroups: Grupo[]; dataGroups?: unknown[]; navigationUrls: string[] };
  const grupo = (nome: string) => c.assetGroups.find(g => g.name === nome)!;

  it('NÃO cacheia a API: sem dataGroups e sem /api em nenhum grupo', () => {
    expect(c.dataGroups ?? []).toEqual([]);
    expect(JSON.stringify(c.assetGroups)).not.toContain('/api');
  });

  it('o shell (index, js, css, manifest e ícones) é baixado na instalação (prefetch)', () => {
    const app = grupo('app');
    expect(app.installMode).toBe('prefetch');
    expect(c.index).toBe('/index.html');
    for (const arquivo of ['/index.html', '/*.js', '/*.css', '/manifest.json', '/icon-*.png', '/icon.svg']) {
      expect(app.resources.files).toContain(arquivo);
    }
  });

  it('fontes e vendor (pdf-lib) são sob demanda (lazy)', () => {
    const lazy = grupo('fontes-e-vendor');
    expect(lazy.installMode).toBe('lazy');
    expect(lazy.resources.files).toEqual(expect.arrayContaining(['/fonts/**', '/vendor/**']));
  });

  it('assume a navegação da raiz, mas nunca /api (PDF abre por navegação), /health nem /novo/ (redireciona)', () => {
    expect(c.navigationUrls).toContain('/**');
    for (const fora of ['!/api/**', '!/health', '!/novo/**']) expect(c.navigationUrls).toContain(fora);
  });

  it('não guarda o sw.js de transição (ele precisa vir sempre do servidor)', () => {
    expect(grupo('app').resources.files).toContain('!/sw.js');
  });
});
