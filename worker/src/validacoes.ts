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
  const regex = /(?<!\d)(?:\d[\s.]*){2}\/?(?:\d[\s.]*){3}\/?(?:\d[\s.]*){3}\/?(?:\d[\s.]*){4}-?(?:\d[\s.]*){2}(?!\d)/g;
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

export interface DadosRotuladosNfse {
  dados: Partial<{ cnpj: string; servico: string; valor: number; cidade: string; uf: string }>;
  candidatos: Partial<Record<'cnpj' | 'servico' | 'valor' | 'cidade' | 'uf', string[]>>;
}

/**
 * Extrai valores associados a rótulos explícitos da NFSe.
 * Não escolhe o primeiro CNPJ/valor do documento: exige contexto do campo.
 */
export function extrairDadosRotuladosNfse(texto: string): DadosRotuladosNfse {
  const linhas = texto
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((linha) => linha.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // Dobra acentos sem alterar o comprimento da string; os índices continuam
  // alinhados ao texto original para recuperar descrições/cidades com acentos.
  const normalizar = (valor: string) => valor.toLowerCase()
    .replace(/[áàãâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòõôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c');
  const candidatos: DadosRotuladosNfse['candidatos'] = {};
  const dados: DadosRotuladosNfse['dados'] = {};

  const cnpjPontuados: Array<{ valor: string; pontos: number }> = [];
  linhas.forEach((linha, indice) => {
    const linhaComProxima = `${linha} ${linhas[indice + 1] || ''}`;
    const contexto = normalizar([...linhas.slice(Math.max(0, indice - 2), indice + 1)].join(' '));
    const contextoImediato = normalizar(linha);
    const cnpjs = extrairCnpjsDoTexto(linhaComProxima);
    for (const cnpj of cnpjs) {
      let pontos = 0;
      if (/prestador|emitente|fornecedor/.test(contexto)) pontos += 4;
      if (/cnpj\s*[:\-/]?\s*$/.test(normalizar(linha))) pontos += 3;
      if (/\bcnpj\b/.test(contextoImediato)) pontos += 2;
      if (/tomador|cliente|destinatario/.test(contextoImediato)) pontos -= 8;
      if (/tomador|cliente|destinatario/.test(contexto) && !/prestador|emitente|fornecedor/.test(contextoImediato)) pontos -= 4;
      if (pontos > 0) cnpjPontuados.push({ valor: cnpj, pontos });
    }
  });
  if (cnpjPontuados.length) {
    const maior = Math.max(...cnpjPontuados.map((item) => item.pontos));
    const valores = [...new Set(cnpjPontuados.filter((item) => item.pontos === maior).map((item) => item.valor))];
    const cnpjsValidos = valores.filter((valor) => validarCnpj(valor));
    candidatos.cnpj = cnpjsValidos.length ? cnpjsValidos : valores;
    if (candidatos.cnpj.length === 1 && cnpjsValidos.length === 1) dados.cnpj = cnpjsValidos[0];
  }

  const valoresServico: string[] = [];
  linhas.forEach((linha, indice) => {
    const linhaNormalizada = normalizar(linha);
    const rotulo = linhaNormalizada.match(/(?:(?:discriminacao|descricao)(?: dos)? servicos?|servico prestado|descricao do servico)\s*[:\-]?\s*(.*)$/);
    if (!rotulo) return;
    const rotuloComValor = linha.match(/(?:(?:discrimina.{0,2}o|descri.{0,2}o)(?:\s+dos?)?\s+servi.{0,2}os?|servi.{0,2}o prestado|descri.{0,2}o do servi.{0,2}o)\s*[:\-]?\s*(.*)$/i);
    let valor = rotuloComValor?.[1]?.trim() || '';
    if (!valor && linhas[indice + 1]) {
      const proxima = linhas[indice + 1];
      if (!/^(?:valor|iss|retenc|cnae|codigo|municipio|local|cnpj)\b/i.test(normalizar(proxima))) valor = proxima;
    }
    if (valor.length >= 3) valoresServico.push(valor.slice(0, 1000));
  });
  if (valoresServico.length) {
    candidatos.servico = [...new Set(valoresServico)];
    if (candidatos.servico.length === 1) dados.servico = candidatos.servico[0];
  }

  const valoresRotulados: number[] = [];
  const padraoValor = /(?:valor\s+(?:total(?:\s+da\s+nota)?|dos\s+servicos|do\s+servico)|total\s+(?:da\s+nota|dos\s+servicos))\s*[:\-]?\s*(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)/i;
  for (let indice = 0; indice < linhas.length; indice++) {
    const linha = linhas[indice];
    const textoLinha = normalizar(`${linha} ${linhas[indice + 1] || ''}`);
    const match = textoLinha.match(padraoValor);
    if (!match) continue;
    const valorTexto = match[1].replace(/\./g, '').replace(',', '.');
    const valor = Number(valorTexto);
    const contexto = textoLinha.slice(0, match.index || 0);
    if (/\b(?:liquido|iss|retenc|desconto|deducao|irrf|pis|cofins|csll)\b/i.test(contexto)) continue;
    if (Number.isFinite(valor) && valor > 0 && valor <= 10_000_000) valoresRotulados.push(valor);
  }
  if (valoresRotulados.length) {
    candidatos.valor = [...new Set(valoresRotulados)].map(String);
    if (candidatos.valor.length === 1) dados.valor = valoresRotulados[0];
  }

  const cidades: string[] = [];
  const ufs: string[] = [];
  for (const linha of linhas) {
    const linhaNormalizada = normalizar(linha);
      const cidadeMatch = linhaNormalizada.match(/(?:municipio|local)(?:\s+(?:da|de)\s+(?:prestacao(?:\s+dos\s+servicos)?|incidencia(?:\s+do\s+iss)?))\s*[:\-]\s*(?:municipio\s+de\s+)?([^;|]+?)(?:\s*(?:\/|\s+-\s+)\s*([A-Z]{2}))?\s*$/i);
    if (cidadeMatch && !/tomador|prestador|incidencia do iss/.test(normalizar(cidadeMatch[1]))) {
      const inicioValor = linhaNormalizada.indexOf(cidadeMatch[1]);
      const cidadeBruta = inicioValor >= 0 ? linha.slice(inicioValor, inicioValor + cidadeMatch[1].length) : cidadeMatch[1];
      const cidade = cidadeBruta.trim().replace(/\s+(?:UF|estado)\s*[:\-].*$/i, '').trim();
      if (cidade.length >= 2) cidades.push(cidade);
      if (cidadeMatch[2] && validarUf(cidadeMatch[2])) ufs.push(cidadeMatch[2].toUpperCase());
    }
    if (/\buf\s*[:\-]/i.test(linha)) {
      const uf = linha.match(/\buf\s*[:\-]\s*([A-Z]{2})\b/i)?.[1];
      if (uf && validarUf(uf)) ufs.push(uf.toUpperCase());
    }
    if (/municipio (?:da|de) (?:prestacao|incidencia)|local (?:da|de) (?:prestacao|incidencia)/.test(linhaNormalizada)) {
      const sigla = linha.match(/\b([A-Z]{2})\s*$/)?.[1];
      if (sigla && validarUf(sigla)) ufs.push(sigla.toUpperCase());
    }
  }
  if (cidades.length) {
    candidatos.cidade = [...new Set(cidades)];
    if (candidatos.cidade.length === 1) dados.cidade = candidatos.cidade[0];
  }
  if (ufs.length) {
    candidatos.uf = [...new Set(ufs)];
    if (candidatos.uf.length === 1) dados.uf = candidatos.uf[0];
  }

  return { dados, candidatos };
}