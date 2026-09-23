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
  confianza: number; // 0 a 1
  campos_divergentes: string[];
  metodo: string;
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

const SYSTEM_PROMPT_CONFERENCIA = `Você é um verificador final de dados de NFSe.

São apresentadas DUAS extrações independentes da mesma NFSe.
Compare os campos e decida qual é o valor CORRETO para cada campo.

Regras:
- Se ambos coincidem em um campo, use esse valor.
- Se diferem, analise qual é mais plausível (formato de CNPJ válido, valor coerente, etc.)
- Se não conseguir decidir, use o valor da primeira extração.

Retorne APENAS um JSON válido com os campos finais:
{"cnpj": "...", "servico": "...", "valor": 0.00, "cidade": "...", "uf": "...", "numero_nfse": "...", "data_emision": "..."}`;

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
      const data = await res.json();
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
  return {
    cnpj: (d.cnpj || '').replace(/\D/g, ''),
    servico: d.servico || '',
    valor: typeof d.valor === 'number' ? d.valor : parseFloat(String(d.valor || 0)),
    cidade: d.cidade || '',
    uf: (d.uf || '').toUpperCase(),
    numero_nfse: d.numero_nfse || '',
    data_emision: d.data_emision || '',
  };
}

function compararCampos(a: DadosExtraidos, b: DadosExtraidos): { divergentes: string[]; coinciden: string[] } {
  const campos = ['cnpj', 'servico', 'valor', 'cidade', 'uf'];
  const divergentes: string[] = [];
  const coinciden: string[] = [];

  for (const campo of campos) {
    const va = String(a[campo] ?? '').trim().toLowerCase();
    const vb = String(b[campo] ?? '').trim().toLowerCase();
    if (va === vb && va !== '') {
      coinciden.push(campo);
    } else if (va !== vb) {
      divergentes.push(campo);
    }
  }

  return { divergentes, coinciden };
}

/**
 * OCR com conferência cruzada e redundância real.
 *
 * Estratégia de máxima confiabilidade:
 * 1. Extração primária: GPT-4o-mini (modelo A)
 * 2. Extração secundária: Claude 3.5 Sonnet (modelo B - diferente do A)
 * 3. Extração terciária: Gemini 2.0 Flash (modelo C - diferente de A e B)
 * 4. Voto majoritário: campo que aparece em 2+ extrações vence
 * 5. Validação: CNPJ (DV), UF (lista oficial), valor (positivo e razoável)
 * 6. Fallback: regex no texto extraído do PDF (se disponível)
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
  const mimeType = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    pdf: 'application/pdf',
  }[extension.toLowerCase()] || 'image/png';

  // --- Extração primária ---
  const mensajesPrimaria = [
    { role: 'system', content: SYSTEM_PROMPT_OCR },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extraia os dados desta NFSe e retorne APENAS o JSON.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${archivoBase64}` } },
      ],
    },
  ];

  const res1 = await llamarLlm(mensajesPrimaria, config, apiKey, config.modeloVision, 0.1);
  const datos1 = res1.ok ? normalizarDados(extraerJson(res1.content || '')) : { cnpj: '', servico: '', valor: 0, cidade: '', uf: '' };

  // --- Extração secundária (independente) ---
  const mensajesSecundaria = [
    { role: 'system', content: SYSTEM_PROMPT_OCR_VERIFICACION },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Verifique NOVAMENTE os dados desta NFSe. Retorne APENAS o JSON.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${archivoBase64}` } },
      ],
    },
  ];

const res2 = await llamarLlm(mensajesSecundaria, config, apiKey, config.modeloVisionAlt, 0.1);
  const datos2 = res2.ok ? normalizarDatos(extraerJson(res2.content || '')) : datos1;


  // --- Extração terciária: Gemini 2.0 Flash (outro modelo diferente) ---
  const mensajesTerciaria = [
    { role: 'system', content: SYSTEM_PROMPT_OCR },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Faça uma terceira extração independente dos dados desta NFSe. Retorne APENAS o JSON.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${archivoBase64}` } },
      ],
    },
  ];

  const res3 = await llamarLlm(mensajesTerciaria, config, apiKey, config.modeloOcrAlt, 0.1);
  const datos3 = res3.ok ? normalizarDados(extraerJson(res3.content || '')) : datos1;

  // --- Voto majoritário ---
  const datosVotados = votarDados([datos1, datos2, datos3]);

  // --- Validação ---
  const { validarDadosExtraidos } = await import('./validacoes');
  const validacao = validarDadosExtraidos(datosVotados);

  // --- Fallback com regex se texto do PDF disponível ---
  let datosFinales = validacao.dados;
  if (textoPdfExtraido) {
    const { extrairCnpjsDoTexto, extrairValoresDoTexto, extrairUfsDoTexto } = await import('./validacoes');
    const cnpjsRegex = extrairCnpjsDoTexto(textoPdfExtraido);
    const valoresRegex = extrairValoresDoTexto(textoPdfExtraido);
    const ufsRegex = extrairUfsDoTexto(textoPdfExtraido);

    if (cnpjsRegex.length > 0 && (!datosFinales.cnpj || datosFinales.cnpj.replace(/\D/g, '').length < 14)) {
      datosFinales.cnpj = cnpjsRegex[0];
    }
    if (valoresRegex.length > 0 && (!datosFinales.valor || datosFinales.valor === 0)) {
      datosFinales.valor = valoresRegex[0];
    }
    if (ufsRegex.length > 0 && (!datosFinales.uf || datosFinales.uf.length !== 2)) {
      datosFinales.uf = ufsRegex[0];
    }
  }

  // --- Cálculo de confiança ---
  const { divergentes, coinciden } = compararCampos(datos1, datos2);
  const camposConDatos = coinciden.length + divergentes.length;
  const confianza = camposConDatos > 0 ? coinciden.length / camposConDatos : 0;

  return {
    dados: datosFinales,
    confianza,
    campos_divergentes: divergentes,
    metodo: 'triple_extraccion_multimodelo',
  };
}

/**
 * Voto majoritário entre 3 extrações.
 * Para cada campo, o valor que aparece em 2+ extrações vence.
 * Se todos divergem, usa o primeiro não vazio.
 */
function votarDados(extracoes: DadosExtraidos[]): DadosExtraidos {
  const campos: (keyof DadosExtraidos)[] = ['cnpj', 'servico', 'valor', 'cidade', 'uf'];
  const resultado: DadosExtraidos = { cnpj: '', servico: '', valor: 0, cidade: '', uf: '' };

  for (const campo of campos) {
    const valores = extracoes.map((e) => String(e[campo] ?? '').trim());
    const contagem: Record<string, number> = {};
    for (const v of valores) {
      if (v) contagem[v] = (contagem[v] || 0) + 1;
    }

    // Encontra o valor com mais ocorrências
    let maxCount = 0;
    let valorVencedor = '';
    for (const [valor, count] of Object.entries(contagem)) {
      if (count > maxCount) {
        maxCount = count;
        valorVencedor = valor;
      }
    }

    // Se não há maioria (todos diferentes), usa o primeiro não vazio
    if (maxCount < 2) {
      valorVencedor = valores.find((v) => v) || '';
    }

    if (campo === 'valor') {
      resultado[campo] = parseFloat(valorVencedor) || 0;
    } else {
      (resultado as any)[campo] = valorVencedor;
    }
  }

  return resultado;
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
  return normalizarDatos(extraerJson(res.content || ''));
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
    const decoder = new TextDecoder('utf-8', { fatal: false });
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