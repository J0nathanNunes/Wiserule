/**
 * Validações de dados extraídos da NFSe.
 * Garante que os dados extraídos pelo OCR são válidos antes de usar.
 */

/**
 * Valida CNPJ usando o algoritmo oficial dos dígitos verificadores.
 * Retorna true se o CNPJ é válido (14 dígitos + DV corretos).
 */
export function validarCnpj(cnpj: string): boolean {
  const limpo = cnpj.replace(/\D/g, '');
  if (limpo.length !== 14) return false;

  // Rejeita CNPJs com todos os dígitos iguais (00000000000000, 11111111111111, etc.)
  if (/^(\d)\1{13}$/.test(limpo)) return false;

  // Calcula DV1
  let soma = 0;
  let peso = 5;
  for (let i = 0; i < 12; i++) {
    soma += parseInt(limpo[i]) * peso;
    peso = peso === 2 ? 9 : peso - 1;
  }
  const resto = soma % 11;
  const dv1 = resto < 2 ? 0 : 11 - resto;
  if (dv1 !== parseInt(limpo[12])) return false;

  // Calcula DV2
  soma = 0;
  peso = 6;
  for (let i = 0; i < 13; i++) {
    soma += parseInt(limpo[i]) * peso;
    peso = peso === 2 ? 9 : peso - 1;
  }
  const resto2 = soma % 11;
  const dv2 = resto2 < 2 ? 0 : 11 - resto2;
  if (dv2 !== parseInt(limpo[13])) return false;

  return true;
}

/**
 * Formata CNPJ no padrão XX.XXX.XXX/XXXX-XX.
 */
export function formatarCnpj(cnpj: string): string {
  const limpo = cnpj.replace(/\D/g, '');
  if (limpo.length !== 14) return cnpj;
  return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Lista de UFs válidas do Brasil.
 */
const UFS_VALIDAS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/**
 * Valida se a UF é uma sigla válida do Brasil.
 */
export function validarUf(uf: string): boolean {
  if (!uf) return false;
  return UFS_VALIDAS.includes(uf.toUpperCase().trim());
}

/**
 * Valida se o valor é positivo e razoável (entre R$ 0,01 e R$ 10.000.000,00).
 */
export function validarValor(valor: number): boolean {
  return typeof valor === 'number' && valor > 0 && valor <= 10_000_000 && !isNaN(valor);
}

/**
 * Extrai CNPJs de um texto usando regex.
 * Retorna array de CNPJs encontrados (14 dígitos com ou sem formatação).
 */
export function extrairCnpjsDoTexto(texto: string): string[] {
  const regex = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  const matches = texto.match(regex) || [];
  return matches
    .map((m) => m.replace(/\D/g, ''))
    .filter((c) => c.length === 14);
}

/**
 * Extrai valores monetários de um texto (R$ 1.234,56 ou 1234.56).
 */
export function extrairValoresDoTexto(texto: string): number[] {
  const valores: number[] = [];

  // Padrão R$ 1.234,56
  const regexBr = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/gi;
  let match;
  while ((match = regexBr.exec(texto)) !== null) {
    const numStr = match[1].replace(/\./g, '').replace(',', '.');
    const num = parseFloat(numStr);
    if (!isNaN(num) && num > 0) valores.push(num);
  }

  // Padrão 1234.56 (sem R$)
  const regexNum = /\b(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+\.\d{2})\b/g;
  while ((match = regexNum.exec(texto)) !== null) {
    const numStr = match[1].replace(/\./g, '').replace(',', '.');
    const num = parseFloat(numStr);
    if (!isNaN(num) && num > 0 && num <= 10_000_000 && !valores.includes(num)) {
      valores.push(num);
    }
  }

  return valores.sort((a, b) => b - a); // Maior primeiro
}

/**
 * Extrai UFs de um texto (siglas de 2 letras maiúsculas).
 */
export function extrairUfsDoTexto(texto: string): string[] {
  const regex = /\b([A-Z]{2})\b/g;
  const matches = texto.match(regex) || [];
  return [...new Set(matches.filter((m) => UFS_VALIDAS.includes(m)))];
}

/**
 * Aplica validações aos dados extraídos e corrige quando possível.
 * Retorna os dados corrigidos e um relatório de validação.
 */
export function validarDadosExtraidos(dados: {
  cnpj: string;
  servico: string;
  valor: number;
  cidade: string;
  uf: string;
}): {
  dados: typeof dados;
  valido: boolean;
  erros: string[];
  correcoes: string[];
} {
  const erros: string[] = [];
  const correcoes: string[] = [];
  const dadosCorrigidos = { ...dados };

  // Valida CNPJ
  if (dados.cnpj) {
    const cnpjLimpo = dados.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      erros.push(`CNPJ com ${cnpjLimpo.length} dígitos (esperado 14)`);
    } else if (!validarCnpj(cnpjLimpo)) {
      erros.push('CNPJ com dígitos verificadores inválidos');
    } else {
      dadosCorrigidos.cnpj = formatarCnpj(cnpjLimpo);
      if (dadosCorrigidos.cnpj !== dados.cnpj) {
        correcoes.push(`CNPJ formatado: ${dadosCorrigidos.cnpj}`);
      }
    }
  } else {
    erros.push('CNPJ vazio');
  }

  // Valida UF
  if (dados.uf) {
    if (!validarUf(dados.uf)) {
      erros.push(`UF inválida: ${dados.uf}`);
    } else {
      dadosCorrigidos.uf = dados.uf.toUpperCase().trim();
    }
  } else {
    erros.push('UF vazia');
  }

  // Valida valor
  if (!validarValor(dados.valor)) {
    erros.push(`Valor inválido: ${dados.valor}`);
  }

  // Valida serviço
  if (!dados.servico || dados.servico.trim().length < 3) {
    erros.push('Descrição do serviço vazia ou muito curta');
  }

  // Valida cidade
  if (!dados.cidade || dados.cidade.trim().length < 2) {
    erros.push('Cidade vazia ou muito curta');
  }

  return {
    dados: dadosCorrigidos,
    valido: erros.length === 0,
    erros,
    correcoes,
  };
}