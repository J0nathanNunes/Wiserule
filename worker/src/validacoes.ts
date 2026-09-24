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
  dados: Partial<{
    cnpj: string;
    cnpj_tomador: string;
    servico: string;
    servico_descricao: string;
    codigo_servico_nfse: string;
    item_lista_lc116: string;
    valor: number;
    valor_liquido: number;
    iss_retencao: string;
    simples_nacional_nfse: string;
    mei_nfse: boolean;
    cidade: string;
    uf: string;
    numero_nfse: string;
    data_emissao: string;
  }>;
  candidatos: Partial<Record<'cnpj' | 'servico' | 'servico_descricao' | 'valor' | 'cidade' | 'uf', string[]>>;
}

/**
 * Extrai valores associados a rótulos explícitos da NFSe.
 * Não escolhe o primeiro CNPJ/valor do documento: exige contexto do campo.
 */
export function extrairDadosRotuladosNfse(texto: string): DadosRotuladosNfse {
  // Alguns PDFs antigos do emissor municipal usam mapeamentos de fonte que o
  // PDF.js expõe como sequências CP437. Corrige os pares observados antes de
  // localizar rótulos; o texto original do documento não é alterado fora daqui.
  const mapaCodificacaoPdf: Record<string, string> = {
    '├úo': 'ão', 'N├âO': 'NÃO', 'N├úO': 'NÃO', 'N├úo': 'Não',
    '├º': 'ç', '├ç': 'Ç', '├ú': 'ã', '├â': 'Ã', '├í': 'á', '├ü': 'Á',
    '├®': 'é', '├É': 'É', '├¬': 'ê', '├ê': 'Ê', '├¡': 'í', '├Í': 'Í',
    '├│': 'ó', '├ô': 'ô', '├Ô': 'Ô', '├║': 'ú', '├Ü': 'Ú',
    '├┤': 'õ', '├ö': 'ö', '├Ö': 'Ö', '├ë': 'ë', '├Ë': 'Ë', '├┬': 'º',
  };
  let textoCorrigido = texto;
  for (const [sequencia, caractere] of Object.entries(mapaCodificacaoPdf)) {
    textoCorrigido = textoCorrigido.split(sequencia).join(caractere);
  }
  const linhas = textoCorrigido
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

  const indicePrestador = linhas.findIndex((linha) => /prestador|emitente|fornecedor/.test(normalizar(linha))
    && !/tomador|adquirente/.test(normalizar(linha)));
  const indiceTomador = linhas.findIndex((linha) => /tomador|adquirente/.test(normalizar(linha)));
  const cnpjPontuados: Array<{ valor: string; pontos: number }> = [];
  const cnpjTomadorPontuados: Array<{ valor: string; pontos: number }> = [];
  linhas.forEach((linha, indice) => {
    const bloco = indiceTomador >= 0 && indice >= indiceTomador
      ? linhas.slice(Math.max(indiceTomador, indice - 1), indice + 2)
      : indicePrestador >= 0 && indice >= indicePrestador
        ? linhas.slice(Math.max(indicePrestador, indice - 1), Math.min(indiceTomador >= 0 ? indiceTomador : linhas.length, indice + 2))
        : linhas.slice(Math.max(0, indice - 1), indice + 2);
    const linhaComProxima = bloco.join(' ');
    const contexto = normalizar([...linhas.slice(Math.max(0, indice - 2), indice + 1)].join(' '));
    const contextoImediato = normalizar(linha);
    const cnpjs = extrairCnpjsDoTexto(linhaComProxima);
    for (const cnpj of cnpjs) {
      let pontos = 0;
      if (/prestador|emitente|fornecedor/.test(contexto)) pontos += 4;
      if (indicePrestador >= 0 && indice <= indiceTomador && indice >= indicePrestador) pontos += 10;
      if (indiceTomador >= 0 && indice >= indiceTomador) pontos -= 10;
      if (/cnpj\s*[:\-/]?\s*$/.test(normalizar(linha))) pontos += 3;
      if (/\bcnpj\b/.test(contextoImediato)) pontos += 2;
      if (/tomador|cliente|destinatario/.test(contextoImediato)) pontos -= 8;
      if (/tomador|cliente|destinatario/.test(contexto) && !/prestador|emitente|fornecedor/.test(contextoImediato)) pontos -= 4;
      if (pontos > 0) cnpjPontuados.push({ valor: cnpj, pontos });

      let pontosTomador = 0;
      if (/tomador|cliente|adquirente/.test(contexto)) pontosTomador += 4;
      if (indiceTomador >= 0 && indice >= indiceTomador) pontosTomador += 10;
      if (indicePrestador >= 0 && indice < indiceTomador && indice >= indicePrestador) pontosTomador -= 10;
      if (/cnpj\s*[:\-/]?\s*$/.test(normalizar(linha))) pontosTomador += 3;
      if (/\bcnpj\b/.test(contextoImediato)) pontosTomador += 2;
      if (/prestador|emitente|fornecedor/.test(contextoImediato)) pontosTomador -= 8;
      if (pontosTomador > 0) cnpjTomadorPontuados.push({ valor: cnpj, pontos: pontosTomador });
    }
  });
  if (cnpjPontuados.length) {
    const maior = Math.max(...cnpjPontuados.map((item) => item.pontos));
    const valores = [...new Set(cnpjPontuados.filter((item) => item.pontos === maior).map((item) => item.valor))];
    const cnpjsValidos = valores.filter((valor) => validarCnpj(valor));
    candidatos.cnpj = cnpjsValidos.length ? cnpjsValidos : valores;
    if (candidatos.cnpj.length === 1 && cnpjsValidos.length === 1) dados.cnpj = cnpjsValidos[0];
  }
  const cnpjsRotuladosTomador = new Set<string>();
  linhas.forEach((linha, indice) => {
    if (!/tomador|adquirente/.test(normalizar(linha))) return;
    const bloco = linhas.slice(indice, Math.min(linhas.length, indice + 12)).join(' ');
    for (const cnpj of extrairCnpjsDoTexto(bloco)) {
      if (validarCnpj(cnpj)) cnpjsRotuladosTomador.add(cnpj);
    }
  });
  if (cnpjsRotuladosTomador.size === 1) {
    dados.cnpj_tomador = [...cnpjsRotuladosTomador][0];
  }
  if (cnpjTomadorPontuados.length) {
    const maior = Math.max(...cnpjTomadorPontuados.map((item) => item.pontos));
    const valores = [...new Set(cnpjTomadorPontuados.filter((item) => item.pontos === maior).map((item) => item.valor))];
    const cnpjsValidos = valores.filter((valor) => validarCnpj(valor));
    if (cnpjsValidos.length === 1 && !dados.cnpj_tomador) dados.cnpj_tomador = cnpjsValidos[0];
  }
  if (!dados.cnpj_tomador && dados.cnpj) {
    const cnpjsDoDocumento = [...new Set(extrairCnpjsDoTexto(texto))].filter((valor) => valor !== dados.cnpj && validarCnpj(valor));
    if (cnpjsDoDocumento.length === 1) dados.cnpj_tomador = cnpjsDoDocumento[0];
  }

  // "Serviço Prestado" (código + descrição oficial da legislação) é o campo
  // principal para tributação. "Descrição do Serviço" é informativo (detalhamento)
  // e não serve para tributação, mas deve ser coerente com o serviço prestado.
  const valoresServico: string[] = [];
  const codigosServico: string[] = [];
  const valoresServicoDescricao: string[] = [];
  let encontrouRotuloServicoPrestado = false;
  linhas.forEach((linha, indice) => {
    const linhaNormalizada = normalizar(linha);
    // Rótulo "Descrição do Serviço" (informativo)
    const rotuloDescricao = linhaNormalizada.match(/descri.{0,2}o\s+do\s+servi.{0,2}o(?:\s+prestado)?\s*[:\-]?\s*(.*)$/);
    if (rotuloDescricao && /\bdescricao\b/.test(linhaNormalizada)) {
      let valor = linha.match(/descri.{0,2}o\s+do\s+servi.{0,2}o(?:\s+prestado)?\s*[:\-]?\s*(.*)$/i)?.[1]?.trim() || '';
      if (!valor && linhas[indice + 1]) {
        const proxima = linhas[indice + 1];
        if (!/^(?:valor|iss|retenc|cnae|codigo|municipio|local|cnpj|total|base|tributac)\b/i.test(normalizar(proxima))) valor = proxima;
      }
      if (valor.length >= 3) valoresServicoDescricao.push(valor.slice(0, 1000));
      return;
    }
    // Rótulo "Serviço Prestado" (código + descrição oficial). Não confundir
    // com "Descrição do Serviço" (informativo).
    // Formato nacional: o cabeçalho informa o código de tributação e a descrição
    // oficial aparece nas linhas seguintes.
    if (/servi.{0,2}o\s+prestado/.test(linhaNormalizada)) {
      encontrouRotuloServicoPrestado = true;
        // Na NFS-e nacional, o código pode vir com três níveis (13.05.01).
        // No modelo anterior, pode haver rótulos intermediários como CNAE/CBO.
        const linhasSeguintes = linhas.slice(indice + 1, indice + 9);
        const indiceCodigo = linhasSeguintes.findIndex((linhaSeguinte) =>
          /^(\d{2}\.\d{2}(?:\.\d{2})?)(?:\s|$)/.test(linhaSeguinte)
          && !/^\d{4,}/.test(linhaSeguinte)
        );
        const proxima = indiceCodigo >= 0 ? linhasSeguintes[indiceCodigo] : linhas[indice + 1] || '';
        const codigoMatch = proxima.match(/^(\d{2}\.\d{2}(?:\.\d{2})?)(?:\s*[-–:]\s*(.*))?/);
        if (codigoMatch) {
          codigosServico.push(codigoMatch[1]);
          const descricaoOficial = codigoMatch[2]?.trim()
            || linhas[indice + 1 + indiceCodigo + 1]
            || '';
          const descricao = descricaoOficial.trim();
          const valor = descricao.length >= 3 ? `${codigoMatch[1]} - ${descricao}` : codigoMatch[1];
          if (valor.length >= 3) valoresServico.push(valor.slice(0, 1000));
        } else if (proxima && !/^(?:valor|iss|retenc|cnae|codigo|municipio|local|cnpj|total|base|tributac|descri)\b/i.test(normalizar(proxima))) {
        // Formato antiguo: "SERVIÇO PRESTADO" como rótulo de sección y la
        // descripción en la línea siguiente.
        if (proxima.length >= 3) valoresServico.push(proxima.slice(0, 1000));
      }
    }
  });
  if (valoresServico.length) {
    candidatos.servico = [...new Set(valoresServico)];
    if (candidatos.servico.length === 1) dados.servico = candidatos.servico[0];
  }
  if (codigosServico.length) {
    const codigosUnicos = [...new Set(codigosServico)];
    if (codigosUnicos.length === 1) {
      dados.codigo_servico_nfse = codigosUnicos[0];
      dados.item_lista_lc116 = codigosUnicos[0].split('.').slice(0, 2).join('.');
    }
  }
  if (!valoresServico.length && !encontrouRotuloServicoPrestado) {
    for (let indice = 0; indice < linhas.length; indice++) {
      if (!/codigo\s+de\s+tributacao\s+nacional/.test(normalizar(linhas[indice]))) continue;
      const linhaSeguinte = linhas[indice + 1] || '';
      const codigoMatch = linhaSeguinte.match(/^(\d{2}\.\d{2}(?:\.\d{2})?)(?:\s*[-–:]\s*(.*))?/);
      if (!codigoMatch) continue;
      codigosServico.push(codigoMatch[1]);
      const descricao = codigoMatch[2]?.trim() || linhas[indice + 2] || '';
      valoresServico.push(descricao.length >= 3 ? `${codigoMatch[1]} - ${descricao}` : codigoMatch[1]);
    }
    if (valoresServico.length) {
      candidatos.servico = [...new Set(valoresServico)];
      if (candidatos.servico.length === 1) dados.servico = candidatos.servico[0];
    }
    if (codigosServico.length) {
      const codigosUnicos = [...new Set(codigosServico)];
      if (codigosUnicos.length === 1) {
        dados.codigo_servico_nfse = codigosUnicos[0];
        dados.item_lista_lc116 = codigosUnicos[0].split('.').slice(0, 2).join('.');
      }
    }
  }
  if (valoresServicoDescricao.length) {
    candidatos.servico_descricao = [...new Set(valoresServicoDescricao)];
    if (candidatos.servico_descricao.length === 1) dados.servico_descricao = candidatos.servico_descricao[0];
  }

  const valoresRotulados: number[] = [];
  const padraoValor = /(?:valor\s+(?:total(?:\s+da\s+(?:nota|nfs?[- ]?e))?|dos\s+servicos|do\s+servico)|total\s+(?:da\s+(?:nota|nfs?[- ]?e)|dos\s+servicos))\s*[:\-]?\s*(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)/i;
  for (let indice = 0; indice < linhas.length; indice++) {
    const linha = linhas[indice];
    const linhaNormalizada = normalizar(linha);
    const textoLinha = normalizar(`${linha} ${linhas[indice + 1] || ''}`);
    const match = textoLinha.match(padraoValor);
    if (!match) continue;
    const valorTexto = match[1].replace(/\./g, '').replace(',', '.');
    const valor = Number(valorTexto);
    const contexto = textoLinha.slice(0, match.index || 0);
    if (/\b(?:liquido|iss|retenc|desconto|deducao|irrf|pis|cofins|csll)\b/i.test(contexto)) continue;
    if (Number.isFinite(valor) && valor > 0 && valor <= 10_000_000) valoresRotulados.push(valor);
  }
  // Em tabelas, os rótulos e valores podem estar em linhas separadas. Para o
  // valor total da NFS-e, o primeiro valor da linha seguinte corresponde ao total.
  for (let indice = 0; indice < linhas.length; indice++) {
    const linhaNormalizada = normalizar(linhas[indice]);
    if (!/valor\s+total(?:\s+da\s+(?:nota|nfs?[- ]?e))?\s*(?:\(r\$\))?/.test(linhaNormalizada)) continue;
    const proxima = linhas.slice(indice + 1, indice + 4).find((linha) => /(?:R\$\s*)\d/.test(linha)) || '';
    const valores = [...proxima.matchAll(/(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)/g)];
    if (!valores) continue;
    const valorBruto = valores.find((valor) => /R\$/.test(valor[0])) || valores[0];
    const primeiroValor = Number(valorBruto[1].replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(primeiroValor) && primeiroValor > 0 && primeiroValor <= 10_000_000) valoresRotulados.push(primeiroValor);
  }
  if (valoresRotulados.length) {
    candidatos.valor = [...new Set(valoresRotulados)].map(String);
    if (candidatos.valor.length === 1) dados.valor = valoresRotulados[0];
  }

  // O valor líquido e a retenção do ISS são dados declarados na nota; não os
  // confundir com o valor bruto usado como base para a análise.
  for (let indice = 0; indice < linhas.length; indice++) {
    const linhaNormalizada = normalizar(linhas[indice]);
    if (/valor\s+liquido\s+da\s+nfs?[- ]?e/.test(linhaNormalizada)) {
      const proxima = linhas.slice(indice + 1, indice + 4).find((linha) => /(?:R\$\s*)?\d/.test(linha)) || '';
      const valorMatch = proxima.match(/(?:R\$\s*)((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)/i)
        || proxima.match(/\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/);
      if (valorMatch) {
        const valorLiquido = Number(valorMatch[1].replace(/\./g, '').replace(',', '.'));
        if (Number.isFinite(valorLiquido) && valorLiquido >= 0 && valorLiquido <= 10_000_000) dados.valor_liquido = valorLiquido;
      }
    }
    if (/retencao\s+do\s+issqn/.test(linhaNormalizada)) {
      const proxima = normalizar(linhas.slice(indice + 1, indice + 4).join(' '));
      if (/nao\s+retido|n.{1,4}o\s+retido/.test(proxima)) dados.iss_retencao = 'Não retido';
      else if (/retido/.test(proxima)) dados.iss_retencao = 'Retido';
    }
    if (/retencao\s+do\s+issqn/.test(normalizar(linhas[indice - 1] || ''))) {
      const celula = normalizar(linhas[indice]);
      if (/nao\s+retido|n.{1,4}o\s+retido/.test(celula)) dados.iss_retencao = 'Não retido';
      else if (/retido/.test(celula)) dados.iss_retencao = 'Retido';
    }
    if (/issqn\s*\(r\$\)/.test(linhaNormalizada) && !dados.iss_retencao) {
      const valoresIss = linhas.slice(indice + 1, indice + 3).join(' ');
      const valorIss = valoresIss.match(/(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)/);
      if (valorIss) {
        dados.iss_retencao = Number(valorIss[1].replace(/\./g, '').replace(',', '.')) > 0 ? 'Retido' : 'Não retido';
      }
    }
    if (/documento\s+emitido\s+por\s+me\s+ou\s+epp\s+optante\s+pelo\s+simples\s+nacional/.test(linhaNormalizada)) {
      dados.simples_nacional_nfse = 'Optante';
    }
    if (/simples\s+nacional\s+na\s+data\s+de\s+competencia/.test(linhaNormalizada)) {
      const proximaLinha = normalizar(linhas[indice + 1] || '');
      const situacao = /optante\s*[-|]\s*microempreendedor\s+individual/.test(proximaLinha)
        ? proximaLinha
        : linhaNormalizada.slice(/simples\s+nacional\s+na\s+data\s+de\s+competencia/.exec(linhaNormalizada)?.index || 0);
      if (/nao\s+optante/.test(situacao)) dados.simples_nacional_nfse = 'Não optante';
      else if (/optante/.test(situacao)) dados.simples_nacional_nfse = 'Optante';
      if (/microempreendedor\s+individual|\bmei\b/.test(situacao)) dados.mei_nfse = true;
    }
    if (/simples\s+nacional\s+na\s+data\s+de\s+competencia/.test(linhaNormalizada)
      && /optante\s*[-|]\s*microempreendedor\s+individual/.test(`${linhaNormalizada} ${normalizar(linhas[indice + 1] || '')}`)) {
      dados.mei_nfse = true;
    }
    if (/nfs?[- ]?e\s+mei\b/.test(linhaNormalizada)) dados.mei_nfse = true;
  }

  const numeroNfse: string[] = [];
  for (let indice = 0; indice < linhas.length; indice++) {
    const linhaNormalizada = normalizar(linhas[indice]);
    const rotuloNfse = linhaNormalizada.match(/numero\s+da\s+nfs?-?e/);
    if (rotuloNfse) {
      const restanteLinha = normalizar(linhas[indice]).slice((rotuloNfse.index || 0) + rotuloNfse[0].length);
      const camposRotulados = [...restanteLinha.matchAll(/(?:numero\s+da\s+nfs?-?e|competencia\s+da\s+nfs?-?e|data\s+e\s+hora\s+da\s+emissao\s+da\s+nfs?-?e)/g)];
      const rotulosLinha = [...normalizar(linhas[indice]).matchAll(/(?:numero\s+da\s+nfs?-?e|competencia\s+da\s+nfs?-?e|data\s+e\s+hora\s+da\s+emissao\s+da\s+nfs?-?e)/g)];
      const proximaRotulo = rotulosLinha.find((rotulo) => (rotulo.index || 0) > (rotuloNfse.index || 0));
      const limiteValor = proximaRotulo?.index ?? linhas[indice].length;
      const valorMesmoCampo = linhas[indice].slice((rotuloNfse.index || 0) + rotuloNfse[0].length, limiteValor);
      const numero = valorMesmoCampo.match(/^\s*[:\-]?\s*(\d{1,12})\b/)?.[1];
      if (numero) numeroNfse.push(numero);
      else {
        const proximaLinha = (linhas[indice + 1] || '').replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, ' ').replace(/\b\d{1,2}\/\d{4}\b/g, ' ');
        const numeroComSerie = proximaLinha.match(/\b(\d{1,12})\s*\/\s*[A-Z0-9]{1,5}\b/i)?.[1];
        const numeroProximaLinha = numeroComSerie || proximaLinha.match(/^\s*(\d{1,12})\b/)?.[1];
        if (numeroProximaLinha) numeroNfse.push(numeroProximaLinha);
      }
    }
    if (/numero\s*\/\s*serie/.test(linhaNormalizada)) {
      const proximaLinha = (linhas[indice + 1] || '').replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, ' ');
      // A linha de valores pode começar com a data de emissão e competência;
      // só considerar número/série com série alfabética, para não tomar o dia
      // da data (ex.: 18/09/2026) como número da nota.
      const numeroComSerie = proximaLinha.match(/\b(\d{1,12})\s*\/\s*[A-Z]{1,5}\b/i)?.[1];
      const numerosNaLinha = [...proximaLinha.matchAll(/\b(\d{1,12})\b/g)].map((resultado) => resultado[1]);
      const numero = numeroComSerie || (numerosNaLinha.length === 1 ? numerosNaLinha[0] : '');
      if (numero) numeroNfse.push(numero);
    }
    if (/(?:emiss.{0,2}o|competencia)/.test(linhaNormalizada) && /numero/.test(linhaNormalizada)) {
      const numeroNaLinha = linhas[indice + 1]?.match(/^\s*(\d{1,12})\s*\|/)?.[1];
      if (numeroNaLinha) numeroNfse.push(numeroNaLinha);
    }
  }
  const numerosNfseUnicos = [...new Set(numeroNfse)];
  if (numerosNfseUnicos.length === 1) dados.numero_nfse = numerosNfseUnicos[0];

  for (let indice = 0; indice < linhas.length; indice++) {
    if (!/data\s+e\s+hora\s+da\s+emissao\s+da\s+nfs?-?e|data\s+e\s+hora\s+de\s+emissao|data\s+de\s+emissao/.test(normalizar(linhas[indice]))) continue;
    const data = (linhas[indice + 1] || '').match(/\b(\d{2}\/\d{2}\/\d{4})\b/)
      || linhas[indice].match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (data) {
      const [dia, mes, ano] = data[1].split('/');
      dados.data_emissao = `${ano}-${mes}-${dia}`;
      break;
    }
  }
  if (!dados.data_emissao) {
    const datas = [...texto.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)];
    const dataEmissao = datas.find((data) => {
      const posicao = data.index || 0;
      const contexto = normalizar(texto.slice(Math.max(0, posicao - 60), posicao));
      return /emissao/.test(contexto) && !/competencia/.test(contexto);
    });
    if (dataEmissao) dados.data_emissao = `${dataEmissao[3]}-${dataEmissao[2]}-${dataEmissao[1]}`;
  }

  const cidades: string[] = [];
  const ufs: string[] = [];
  for (let indice = 0; indice < linhas.length; indice++) {
    const linha = linhas[indice];
    const linhaNormalizada = normalizar(linha);
    const cidadeMatch = linhaNormalizada.match(/(?:municipio|local)(?:\s+(?:da|de)\s+(?:prestacao(?:\s+dos\s+servicos)?|incidencia(?:\s+do\s+iss)?))\s*[:\-]\s*(?:municipio\s+de\s+)?([^;|]+?)(?:\s*(?:\/|\s+-\s+)\s*([A-Z]{2}))?\s*$/i);
    if (cidadeMatch && !/tomador|prestador|incidencia do iss/.test(normalizar(cidadeMatch[1]))) {
      const inicioValor = linhaNormalizada.indexOf(cidadeMatch[1]);
      const cidadeBruta = inicioValor >= 0 ? linha.slice(inicioValor, inicioValor + cidadeMatch[1].length) : cidadeMatch[1];
      const cidade = cidadeBruta.trim().replace(/\s+(?:UF|estado)\s*[:\-].*$/i, '').trim();
      if (cidade.length >= 2) cidades.push(cidade);
      if (cidadeMatch[2] && validarUf(cidadeMatch[2])) ufs.push(cidadeMatch[2].toUpperCase());
    }
    // Formato antigo: cidade e UF aparecem na linha logo após o rótulo.
    // Modelo nacional: "Local da Prestação / Sigla UF / País" y
    // "Campo Grande / MS / -" en la línea siguiente.
    if (/local\s+(?:da|de)\s+prestacao(?:\s+dos\s+servicos)?/.test(linhaNormalizada)) {
      const linhasComLocal = linhas.slice(indice + 1, indice + 4);
      const matchLocal = linhasComLocal
        .map((linhaLocal) => linhaLocal.match(/([A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÇÑ][A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÇÑa-záéíóúâêîôûäëïöüçñ ]+?)\s*\/\s*([A-Z]{2})\b/i))
        .find(Boolean);
      if (matchLocal) {
        const cidade = matchLocal[1].trim().replace(/^[-–\s]+/, '');
        if (cidade.length >= 2) cidades.push(cidade);
        if (validarUf(matchLocal[2])) ufs.push(matchLocal[2].toUpperCase());
      }
    }
    // No modelo nacional, código tributário, NBS e local podem compartilhar
    // o cabeçalho; a cidade/UF aparece após o código na linha de valores.
    if (/local\s+da\s+prestacao\s*\/\s*sigla\s+uf/.test(linhaNormalizada)) {
      const linhasComLocal = linhas.slice(indice + 1, indice + 4);
      const matchLocal = linhasComLocal
        .map((linhaLocal) => linhaLocal.match(/([A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÇÑ][A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÇÑa-záéíóúâêîôûäëïöüçñ ]+?)\s*\/\s*([A-Z]{2})\b/i))
        .find(Boolean);
      if (matchLocal) {
        const cidade = matchLocal[1].trim().replace(/^[-–\s]+/, '');
        if (cidade.length >= 2) cidades.push(cidade);
        if (validarUf(matchLocal[2])) ufs.push(matchLocal[2].toUpperCase());
      }
    }
    if (/local\s+da\s+prestacao\s*\/\s*sigla\s+uf/.test(linhaNormalizada)) {
      const valoresComLocal = linhas.slice(indice + 1, indice + 4).join(' ');
      const matchLocalCompleto = valoresComLocal.match(/([A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÇÑ][A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÇÑa-záéíóúâêîôûäëïöüçñ ]+?)\s*\/\s*([A-Z]{2})\s*\/\s*(?:-|BRASIL)?/i);
      if (matchLocalCompleto) {
        const cidade = matchLocalCompleto[1].trim().replace(/^[-–\s]+/, '');
        if (cidade.length >= 2) cidades.push(cidade);
        if (validarUf(matchLocalCompleto[2])) ufs.push(matchLocalCompleto[2].toUpperCase());
      }
    }
    if (/\buf\s*[:\-]/i.test(linha)) {
      const uf = linha.match(/\buf\s*[:\-]\s*([A-Z]{2})\b/i)?.[1];
      if (uf && validarUf(uf)) ufs.push(uf.toUpperCase());
    }
    const cidadeUfNaLinha = linha.match(/([A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÇÑ][A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÇÑa-záéíóúâêîôûäëïöüçñ ]+?)\s*\/\s*([A-Z]{2})\s*\/\s*(?:-|BRASIL)?\s*$/i);
    if (cidadeUfNaLinha && /prestacao|incidencia/.test(linhaNormalizada)) {
      const cidade = cidadeUfNaLinha[1].trim();
      if (cidade.length >= 2) cidades.push(cidade);
      if (validarUf(cidadeUfNaLinha[2])) ufs.push(cidadeUfNaLinha[2].toUpperCase());
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