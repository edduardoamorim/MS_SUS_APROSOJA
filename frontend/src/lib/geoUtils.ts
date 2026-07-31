/**
 * Utilitário de Resolução de Municípios do Mato Grosso do Sul por Código IBGE do CAR, Nome da Fazenda ou Fallback Territorial.
 */
export function resolveMunicipioFromCarOrName(
  carCode?: string | null,
  farmName?: string | null,
  propMuni?: string | null
): string {
  // 1. Se propMuni for um nome de município válido e específico, retornar formatado
  if (propMuni && typeof propMuni === 'string') {
    const clean = propMuni.trim();
    if (clean.length > 0 && !clean.toLowerCase().includes('geral') && clean !== 'MS') {
      return clean.endsWith(', MS') ? clean : `${clean}, MS`;
    }
  }

  // 2. Extrair código IBGE de 7 dígitos do CAR (ex: MS-5005707-...)
  if (carCode && typeof carCode === 'string') {
    const match = carCode.match(/^[A-Z]{2}-(\d{7})-/i);
    if (match && match[1]) {
      const ibgeCode = match[1];
      const ibgeMap: Record<string, string> = {
        '5005707': 'Naviraí',
        '5005251': 'Maracaju',
        '5002902': 'Chapadão do Sul',
        '5000203': 'Água Clara',
        '5006606': 'Ponta Porã',
        '5003207': 'Corumbá',
        '5002704': 'Campo Grande',
        '5003702': 'Dourados',
        '5007901': 'Sidrolândia',
        '5008305': 'Três Lagoas',
        '5006200': 'Nova Andradina',
        '5006309': 'Paranaíba',
        '5001102': 'Aquidauana',
        '5002209': 'Bonito',
        '5007307': 'Rio Verde de Mato Grosso',
        '5002100': 'Caarapó',
        '5002605': 'Camapuã',
        '5003108': 'Corguinho',
        '5003306': 'Coxim',
        '5004004': 'Fátima do Sul',
        '5004301': 'Iguatemi',
        '5004400': 'Inocência',
        '5004509': 'Itaporã',
        '5004608': 'Itaquiraí',
        '5004707': 'Ivinhema',
        '5004806': 'Japorã',
        '5004905': 'Jaraguari',
        '5005001': 'Jardim',
        '5005100': 'Jateí',
        '5005400': 'Maracaju',
        '5005608': 'Miranda',
        '5005806': 'Nioaque',
        '5006002': 'Nova Alvorada do Sul',
        '5006358': 'Paranhos',
        '5006408': 'Pedro Gomes',
        '5006903': 'Ribas do Rio Pardo',
        '5007109': 'Rio Brilhante',
        '5007208': 'Rio Negro',
        '5007406': 'Rochedo',
        '5007505': 'Santa Rita do Pardo',
        '5007695': 'São Gabriel do Oeste',
        '5007703': 'Sete Quedas',
        '5007802': 'Sonora',
        '5007935': 'Tacuru',
        '5007950': 'Taquarussu',
        '5007976': 'Terenos',
        '5008008': 'Terenos',
        '5008404': 'Vicentina'
      };
      if (ibgeMap[ibgeCode]) {
        return `${ibgeMap[ibgeCode]}, MS`;
      }
    }
  }

  // 3. Fallback inteligente por palavras no nome da fazenda
  if (farmName && typeof farmName === 'string') {
    const fname = farmName.toLowerCase();
    if (fname.includes('chapad')) return 'Chapadão do Sul, MS';
    if (fname.includes('rio verde')) return 'Rio Verde de Mato Grosso, MS';
    if (fname.includes('cácer') || fname.includes('cacer')) return 'Corumbá, MS';
    if (fname.includes('dourad')) return 'Dourados, MS';
    if (fname.includes('ponta por')) return 'Ponta Porã, MS';
    if (fname.includes('naviraí') || fname.includes('navirai')) return 'Naviraí, MS';
    if (fname.includes('sol nascente')) return 'Maracaju, MS';
    if (fname.includes('virgí') || fname.includes('virgin')) return 'Caarapó, MS';
  }

  return 'Mato Grosso do Sul, MS';
}
