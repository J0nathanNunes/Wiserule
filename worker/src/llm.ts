/**
 * Integração com OpenRouter (LLM) + OCR com conferência cruzada.
 * Equivalente a backend/agente_llm.py em Python.
 *
 * Estratégia de OCR redundante:
 * 1. Extração primária (LLM multimodal)
 * 2. Extração secundária (LLM com prompt diferente)
 * 3. Conferência cruzada: compara campos, se divergem faz 3ª verificação
 */

import { Config } from './config';

export interface DadosExtraidos {
  cnpj: string;
  servico: string;
  valor: number;
  cidade: string;
  uf: string;
  numero_nfse?: string;
  data_emision?: string;
}

export interface ResultadoOcr {
  dados: DadosExtraidos;
  candidatos: Record<'cnpj' | 'servico' | 'valor' | 'cidade' | 'uf', string[]>;
  confianza: number; // 0 a 1
  campos_divergentes: string[];
  metodo: string;
  erros: string[];
}

const SYSTEM_PROMPT_OCR = `Você é um especialista em leitura de Notas Fiscais de Serviço eletrônicas (NFSe) brasileiras.

Extraia os seguintes dados da NFSe fornecida (imagem/PDF):
- CNPJ do prestador do serviço (formato XX.XXX.XXX/XXXX-XX ou apenas números)
- Descrição do serviço (o texto que descreve o que foi prestado)
- Valor total da nota (valor numérico, sem R$)
- Município da prestação (cidade onde o serviço foi prestado)
- UF (sigla do estado, ex: MS, SP, RJ)
- Número da NFSe (se visível)
- Data de emissão (se visível)

Procure campos como "Prestador", "CNPJ", "Valor Total", "Município", "Descrição" na nota.

Retorne APENAS um JSON válido e nada mais, no formato exato:
{"cnpj": "...", "servico": "...", "valor": 0.00, "cidade": "...", "uf": "...", "numero_nfse": "...", "data_emision": "..."}

Se algum campo não estiver visível, use string vazia ou 0.0 para valor.
NÃO invente dados. Se não encontrar, deixe vazio.`;

const SYSTEM_PROMPT_OCR_VERIFICACION = `Você é um verificador de dados de Notas Fiscais de Serviço (NFSe) brasileiras.

Será mostrada uma NFSe (imagem/PDF) e você deve EXTRAIR os dados NOVAMENTE, de forma independente.
Preste MUITA atenção em:
- O CNPJ (14 dígitos) - verifique cada dígito
- O valor total - verifique decimais
- A cidade e UF

Retorne APENAS um JSON válido e nada mais, no formato exato:
{"cnpj": "...", "servico": "...", "valor": 0.00, "cidade": "...", "uf": "...", "numero_nfse": "...", "data_emision": "..."}

Se algum campo não estiver visível, use string vazia ou 0.0 para valor.
NÃO invente dados.`;

const SYSTEM_PROMPT_ANALISE = `Você é um analista fiscal sênior especializado em NFSe e direito tributário brasileiro.
Analise os dados fornecidos e gere um relatório técnico-jurídico completo em Markdown.

O relatório DEVE conter estas seções obrigatórias:

## 📋 Dados da Empresa
- Razão social, nome fantasia, CNPJ, situação cadastral
- Endereço completo, município, UF, CEP
- Natureza jurídica, porte
- Data de início de atividade
- CNAE principal e CNAEs secundários

## 🏢 Enquadramento Fiscal
- **Simples Nacional:** Sim/Não/Não informado
- **MEI:** Sim/Não/Não informado

## 🛠️ Serviço Prestado
- Descrição, código LC 116/2003, CNAE, NBS, CSN

## ⚖️ Legislação Aplicável
- LC 116/2003, Lei Municipal, LC 123/2006, IN RFB 2.100/2022

## 🧮 Análise de Retenções
- ISS, IRRF, CSLL, COFINS, PIS conforme enquadramento

## 📍 Local de Pagamento do ISS
- Conforme Art. 3º LC 116/2003

## 🔢 Códigos para Emissão NFSe
- Item Lista Serviço, CNAE, NBS, CSN, CTM

## 🧾 Destaque de Tributos na NFSe
- Se aplica ou não

## 🧾 INSS - Cota Patronal
- Conforme art. 31 e art. 195 CF

## 💬 Opiniões da Comunidade
- Resumo de fontes confiáveis

## ✅ Conclusão
- Análise final consolidada

IMPORTANTE: Formate o relatório em Markdown limpo e bem estruturado. Responda em português brasileiro.`;

export function llamarLlm(
  mensajes: Array<{ role: string; content: unknown }>,
  config: Config,
  apiKey: string,
  modelo?: string,
  temperatura = 0.3,
  maxTokens = 2048,
): Promise<{ ok: boolean; content?: string; error?: string }> {
  if (!apiKey) {
    return Promise.resolve({ ok: false, error: 'OPENROUTER_API_KEY no configurada' });
  }

  return fetch(`${config.openrouterBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://wiserule.com',
      'X-Title': 'Wiserule',
    },
    body: JSON.stringify({
      model: modelo || config.modeloAnalise,
      messages: mensajes,
      temperature: temperatura,
      max_tokens: maxTokens,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `OpenRouter HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return { ok: false, error: 'Resposta vazia do OpenRouter' };
      return { ok: true, content };
    })
    .catch((e) => ({ ok: false, error: `Erro OpenRouter: ${e.message}` }));
}

export function extraerJson(texto: string): DadosExtraidos | null {
  // Tenta encontrar bloco JSON delimitado por ```json ... ```
  const matchFence = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidato = matchFence ? matchFence[1].trim() : texto;

  // Tenta parsear
  try {
    return JSON.parse(candidato) as DadosExtraidos;
  } catch {
    // Tenta encontrar { ... } no texto
    const matchObj = candidato.match(/\{[\s\S]*\}/);
    if (matchObj) {
      try {
        return JSON.parse(matchObj[0]) as DadosExtraidos;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizarDados(d: DadosExtraidos | null): DadosExtraidos {
  if (!d) return { cnpj: '', servico: '', valor: 0, cidade: '', uf: '' };
  const valor = typeof d.valor === 'number' ? d.valor : parseValor(d.valor);
  return {
    cnpj: typeof d.cnpj === 'string' ? d.cnpj.replace(/\D/g, '') : '',
    servico: typeof d.servico === 'string' ? d.servico.trim() : '',
    valor: Number.isFinite(valor) ? valor : 0,
    cidade: typeof d.cidade === 'string' ? d.cidade.trim() : '',
    uf: typeof d.uf === 'string' ? d.uf.toUpperCase().trim() : '',
    numero_nfse: typeof d.numero_nfse === 'string' ? d.numero_nfse : '',
    data_emision: typeof d.data_emision === 'string' ? d.data_emision : '',
  };
}

function parseValor(valor: unknown): number {
  const texto = String(valor ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!texto) return 0;
  const normalizado = texto.includes(',') && texto.includes('.')
    ? texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '')
    : texto.includes(',')
      ? texto.replace(',', '.')
      : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function chaveComparacao(campo: keyof DadosExtraidos, valor: string): string {
  if (campo === 'cnpj') return valor.replace(/\D/g, '');
  if (campo === 'uf') return valor.trim().toUpperCase();
  if (campo === 'valor') return String(parseValor(valor));
  return valor.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

/**
 * OCR com conferência cruzada e redundância real.
 *
 * Estratégia de redundância com confirmação por maioria:
 * 1. Extração primária: GPT-4o-mini (modelo A)
 * 2. Extração secundária: Claude 3.5 Sonnet (modelo B - diferente do A)
 * 3. Extração terciária: Gemini 2.0 Flash (modelo C - diferente de A e B)
 * 4. Voto majoritário: campo que aparece em 2+ extrações vence
 * 5. Validação: CNPJ (DV), UF (lista oficial), valor (positivo e razoável)
 * 6. Divergências sem maioria são devolvidas para confirmação humana.
 *
 * Modelos diferentes = erros diferentes = chance muito menor de erro sistemático.
 */
export async function extraerDatosNfse(
  archivoBase64: string,
  extension: string,
  config: Config,
  apiKey: string,
  textoPdfExtraido?: string,
): Promise<ResultadoOcr> {
  const formato = extension.toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'pdf'].includes(formato)) {
    throw new Error('Formato não suportado. Envie uma NFSe em PNG, JPG ou PDF.');
  }

  const evidenciaPdf = textoPdfExtraido
    ? `\n\nTexto embutido no PDF (use como evidência; não presuma que todo CNPJ ou valor pertence ao prestador/total):\n${textoPdfExtraido.slice(0, 40000)}`
    : '';
  const mimeType = formato === 'pdf' ? 'application/pdf' : formato === 'png' ? 'image/png' : 'image/jpeg';
  const anexo = formato === 'pdf'
    ? { type: 'file', file: { filename: 'nfse.pdf', file_data: `data:application/pdf;base64,${archivoBase64}` } }
    : { type: 'image_url', image_url: { url: `data:${mimeType};base64,${archivoBase64}` } };
  const criarMensagens = (prompt: string, instrucao: string) => [
    { role: 'system', content: prompt },
    { role: 'user', content: [{ type: 'text', text: `${instrucao}${evidenciaPdf}` }, anexo] },
  ];

  // Falhas de chamada ou JSON inválido não participam do voto.
  const nomesModelos = [config.modeloVision, config.modeloVisionAlt, config.modeloOcrAlt];
  if (new Set(nomesModelos).size !== nomesModelos.length) {
    return {
      dados: { cnpj: '', servico: '', valor: 0, cidade: '', uf: '' },
      candidatos: { cnpj: [], servico: [], valor: [], cidade: [], uf: [] },
      confianza: 0,
      campos_divergentes: ['cnpj', 'servico', 'valor', 'cidade', 'uf'],
      metodo: 'bloqueado_modelos_repetidos',
      erros: ['A extração foi bloqueada: configure três identificadores de modelo distintos para reduzir votos correlacionados.'],
    };
  }
  const [res1, res2, res3] = await Promise.all([
    llamarLlm(criarMensagens(SYSTEM_PROMPT_OCR, 'Extraia os dados desta NFSe e retorne APENAS o JSON.'), config, apiKey, config.modeloVision, 0.1),
    llamarLlm(criarMensagens(SYSTEM_PROMPT_OCR_VERIFICACION, 'Verifique novamente os dados desta NFSe e retorne APENAS o JSON.'), config, apiKey, config.modeloVisionAlt, 0.1),
    llamarLlm(criarMensagens(SYSTEM_PROMPT_OCR, 'Faça uma extração independente dos dados desta NFSe e retorne APENAS o JSON.'), config, apiKey, config.modeloOcrAlt, 0.1),
  ]);
  const respostas = [res1, res2, res3];
  const extracoes = respostas.map((res) => res.ok ? extraerJson(res.content || '') : null);
  const votosValidos = extracoes.filter((d): d is DadosExtraidos => d !== null).map(normalizarDados);
  const { dados: datosVotados, divergentes, confianza } = votarDados(votosValidos);
  const campos = ['cnpj', 'servico', 'valor', 'cidade', 'uf'] as const;
  const candidatos = Object.fromEntries(campos.map((campo) => [
    campo,
    [...new Set(votosValidos.map((dados) => String(dados[campo] ?? '').trim()).filter(Boolean))],
  ])) as ResultadoOcr['candidatos'];

  const { validarDadosExtraidos, validarCnpj } = await import('./validacoes');
  const validacao = validarDadosExtraidos(datosVotados);
  const dadosFinais = { ...validacao.dados };
  // Não use um CNPJ inválido para consultar uma empresa; pode ser o CNPJ do tomador.
  if (dadosFinais.cnpj && !validarCnpj(dadosFinais.cnpj)) {
    validacao.erros.push('CNPJ extraído não passou na validação dos dígitos verificadores');
    dadosFinais.cnpj = '';
  }
  const erros = [...validacao.erros];
  if (votosValidos.length < 2) {
    erros.push(`Redundância insuficiente: apenas ${votosValidos.length} de 3 modelos produziram JSON válido; confirme os dados na NFSe.`);
  }
  respostas.forEach((res, indice) => {
    if (!res.ok) erros.push(`Falha no modelo ${nomesModelos[indice]}: ${res.error || 'sem resposta'}`);
    else if (!extracoes[indice]) erros.push(`O modelo ${nomesModelos[indice]} retornou conteúdo que não pôde ser interpretado como JSON`);
  });
  if (votosValidos.length === 0) {
    erros.unshift(`Nenhum modelo retornou uma extração válida. ${respostas.map((r) => r.error).filter(Boolean).join(' | ')}`.trim());
  }

  return {
    dados: dadosFinais,
    candidatos,
    confianza,
    campos_divergentes: divergentes,
    metodo: 'triple_extraccion_multimodelo',
    erros,
  };
}

/**
 * Voto majoritário entre 3 extrações.
 * Para cada campo, o valor que aparece em 2+ extrações vence.
 * Se todos divergem, usa o primeiro não vazio.
 */
function votarDados(extracoes: DadosExtraidos[]): { dados: DadosExtraidos; divergentes: string[]; confianza: number } {
  const campos: (keyof DadosExtraidos)[] = ['cnpj', 'servico', 'valor', 'cidade', 'uf'];
  const resultado: DadosExtraidos = { cnpj: '', servico: '', valor: 0, cidade: '', uf: '' };
  const divergentes: string[] = [];
  let camposDecididos = 0;
  let concordancia = 0;

  for (const campo of campos) {
    const valores = extracoes
      .map((e) => String(e[campo] ?? '').trim())
      .filter((valor) => Boolean(valor) && (campo !== 'valor' || parseValor(valor) > 0));
    const grupos = new Map<string, string[]>();
    for (const valor of valores) {
      const chave = chaveComparacao(campo, valor);
      if (chave) grupos.set(chave, [...(grupos.get(chave) || []), valor]);
    }
    const ordenados = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
    const [, votosVencedores] = ordenados[0] || ['', []];
    const temMaioria = votosVencedores.length >= 2 && votosVencedores.length > (extracoes.length / 2);
    if (valores.length > 0) camposDecididos++;
    if (temMaioria) {
      concordancia += votosVencedores.length / extracoes.length;
      const escolhido = votosVencedores[0];
      if (campo === 'valor') resultado.valor = parseValor(escolhido);
      else (resultado as any)[campo] = escolhido;
    } else if (valores.length > 0 && (grupos.size > 1 || extracoes.length > 1)) {
      divergentes.push(campo);
    }
  }

  return { dados: resultado, divergentes, confianza: camposDecididos ? concordancia / camposDecididos : 0 };
}
export async function extraerDatosTexto(
  texto: string,
  config: Config,
  apiKey: string,
): Promise<DadosExtraidos> {
  const mensajes = [
    { role: 'system', content: SYSTEM_PROMPT_OCR },
    { role: 'user', content: texto },
  ];
  const res = await llamarLlm(mensajes, config, apiKey, config.modeloOcr, 0.1);
  if (!res.ok) return { cnpj: '', servico: '', valor: 0, cidade: '', uf: '' };
  return normalizarDados(extraerJson(res.content || ''));
}

export async function generarAnalisis(
  contexto: Record<string, unknown>,
  config: Config,
  apiKey: string,
): Promise<string> {
  const mensajes = [
    { role: 'system', content: SYSTEM_PROMPT_ANALISE },
    {
      role: 'user',
      content: `Analiza los datos y genera el informe completo:\n\n${JSON.stringify(contexto, null, 2)}`,
    },
  ];
  const res = await llamarLlm(mensajes, config, apiKey, config.modeloAnalise, 0.3, 4096);
  if (!res.ok) return `Erro ao gerar análise: ${res.error}`;

  // Normaliza encoding (corrige caracteres UTF-8 mal interpretados como Latin-1)
  return normalizarEncoding(res.content || '');
}

/**
 * Detecta e corrige automaticamente texto UTF-8 que foi mal interpretado como Latin-1.
 *
 * O problema: quando o texto passa pelo JSON.stringify/JSON.parse do Durable Object,
 * caracteres UTF-8 multibyte (como 'í', 'ç', emojis) são corrompidos porque cada
 * byte UTF-8 é tratado como um caractere Latin-1 separado.
 *
 * A solução: tentamos decodificar o texto tratando os bytes como Latin-1 e depois
 * decodificando como UTF-8. Se o resultado for válido (sem caracteres de substituição),
 * usamos ele. Caso contrário, mantemos o texto original.
 *
 * Esta abordagem funciona para QUALQUER caractere corrompido, não apenas os conhecidos.
 */
export function normalizarEncoding(texto: string): string {
  if (!texto) return texto;

  // Verifica se o texto tem sinais de corrupção UTF-8
  // Caracteres UTF-8 multibyte começam com bytes >= 0x80
  const temBytesAltos = /[\u0080-\u00FF]/.test(texto);

  if (!temBytesAltos) {
    // Texto puro ASCII, não precisa normalizar
    return texto;
  }

  try {
    // Converte a string para bytes (cada char vira um byte Latin-1)
    const bytes = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i++) {
      bytes[i] = texto.charCodeAt(i) & 0xff;
    }

    // Tenta decodificar como UTF-8
    const decoder = new TextDecoder('utf-8');
    const decoded = decoder.decode(bytes);

    // Se não houver caracteres de substituição (\uFFFD), o decoding foi bem-sucedido
    if (!decoded.includes('\uFFFD')) {
      return decoded;
    }
  } catch {
    // Ignora erros e usa o texto original
  }

  // Fallback: mapa de caracteres conhecidos (para casos onde o decoding automático falha)
  const mapa: Record<string, string> = {
    '├í': 'í', '├¡': 'í', '├│': 'ó',
    '├ú': 'ú', '├║': 'ú', '├é': 'é', '├ë': 'ë',
    '├â': 'â', '├Á': 'Á', '├É': 'É', '├Í': 'Í',
    '├Ó': 'Ó', '├Ú': 'Ú', '├ç': 'ç', '├Ç': 'Ç',
    '├úo': 'ção', '├úes': 'ções',
    '├¡vel': 'ível', '├¡veis': 'íveis',
    'T├®cnico': 'Técnico', 'T├®cnico-Jur├¡dico': 'Técnico-Jurídico',
    'Jur├¡dico': 'Jurídico', 'An├ílise': 'Análise',
    'conclu├¡da': 'concluída', 'conclu├¡do': 'concluído',
    '├ü': 'Á', '├ô': 'Ô', '├û': 'Û', '├ê': 'Ê',
    '├¬': 'Ã',
    'Ô£à': '✅', 'ƒôï': '📋', 'ƒÅó': '🏢',
    'ƒøá´©Å': '🛠️', 'ÔÜû´©Å': '⚖️', 'ƒº«': '🧮',
    'ƒôì': '📍', 'ƒöó': '🔢', 'ƒº¥': '🧾',
    'ƒÆ¼': '💬', 'ÔåÆ': '→',
  };

  let resultado = texto;
  for (const [corrompido, correto] of Object.entries(mapa)) {
    resultado = resultado.split(corrompido).join(correto);
  }

  return resultado;
}