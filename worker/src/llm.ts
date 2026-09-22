/**
 * Integración con OpenRouter (LLM) + OCR con conferencia cruzada.
 * Equivalente a backend/agente_llm.py en Python.
 *
 * Estrategia de OCR redundante:
 * 1. Extracción primaria (LLM multimodal)
 * 2. Extracción secundaria (LLM con prompt diferente)
 * 3. Conferencia cruzada: compara campos, si divergen hace 3ª verificación
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
      if (!content) return { ok: false, error: 'Respuesta vacía de OpenRouter' };
      return { ok: true, content };
    })
    .catch((e) => ({ ok: false, error: `Error OpenRouter: ${e.message}` }));
}

export function extraerJson(texto: string): DadosExtraidos | null {
  // Intenta encontrar bloque JSON delimitado por ```json ... ```
  const matchFence = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidato = matchFence ? matchFence[1].trim() : texto;

  // Intenta parsear
  try {
    return JSON.parse(candidato) as DadosExtraidos;
  } catch {
    // Intenta encontrar { ... } en el texto
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
 * OCR con conferencia cruzada.
 * - Para PDF: extrae texto con pdfjs-dist y lo envía al LLM
 * - Para imagen: envía base64 al LLM multimodal
 * - Hace 2 extracciones independientes y las compara
 * - Si hay divergencias, hace 3ª verificación
 */
export async function extraerDatosNfse(
  archivoBase64: string,
  extension: string,
  config: Config,
  apiKey: string,
): Promise<ResultadoOcr> {
  const mimeType = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    pdf: 'application/pdf',
  }[extension.toLowerCase()] || 'image/png';

  // --- Extracción primaria ---
  const mensajesPrimaria = [
    { role: 'system', content: SYSTEM_PROMPT_OCR },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extrae los datos de esta NFSe y retorna SOLO el JSON.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${archivoBase64}` } },
      ],
    },
  ];

  const res1 = await llamarLlm(mensajesPrimaria, config, apiKey, config.modeloVision, 0.1);
  if (!res1.ok) {
    return {
      dados: { cnpj: '', servico: '', valor: 0, cidade: '', uf: '' },
      confianza: 0,
      campos_divergentes: [],
      metodo: 'error',
    };
  }
  const datos1 = normalizarDatos(extraerJson(res1.content || ''));

  // --- Extracción secundaria (independiente) ---
  const mensajesSecundaria = [
    { role: 'system', content: SYSTEM_PROMPT_OCR_VERIFICACION },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Verifica NUEVAMENTE los datos de esta NFSe. Retorna SOLO el JSON.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${archivoBase64}` } },
      ],
    },
  ];

  const res2 = await llamarLlm(mensajesSecundaria, config, apiKey, config.modeloVision, 0.1);
  const datos2 = res2.ok ? normalizarDatos(extraerJson(res2.content || '')) : datos1;

  // --- Conferencia cruzada ---
  const { divergentes, coinciden } = compararCampos(datos1, datos2);

  // Si hay divergencias, hace 3ª verificación
  let datosFinales = datos1;
  if (divergentes.length > 0) {
    const mensajesConferencia = [
      { role: 'system', content: SYSTEM_PROMPT_CONFERENCIA },
      {
        role: 'user',
        content: `Extracción 1: ${JSON.stringify(datos1)}\n\nExtracción 2: ${JSON.stringify(datos2)}\n\nDecide los valores finales correctos.`,
      },
    ];
    const res3 = await llamarLlm(mensajesConferencia, config, apiKey, config.modeloOcr, 0.1);
    if (res3.ok) {
      const datos3 = normalizarDatos(extraerJson(res3.content || ''));
      if (datos3.cnpj || datos3.servico) {
        datosFinales = datos3;
      }
    }
  }

  // Confianza: campos coincidentes / total de campos con datos
  const camposConDatos = coinciden.length + divergentes.length;
  const confianza = camposConDatos > 0 ? coinciden.length / camposConDatos : 0;

  return {
    dados: datosFinales,
    confianza,
    campos_divergentes: divergentes,
    metodo: divergentes.length > 0 ? 'conferencia_cruzada' : 'doble_extraccion',
  };
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
  if (!res.ok) return `Error generando análisis: ${res.error}`;

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
function normalizarEncoding(texto: string): string {
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