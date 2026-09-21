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

const SYSTEM_PROMPT_OCR = `Eres un especialista en lectura de Notas Fiscales de Servicio electrónicas (NFSe) brasileñas.

Extrae los siguientes datos de la NFSe proporcionada (imagen/PDF):
- CNPJ del prestador del servicio (formato XX.XXX.XXX/XXXX-XX o solo números)
- Descripción del servicio (el texto que describe lo que se prestó)
- Valor total de la nota (valor numérico, sin R$)
- Municipio de la prestación (ciudad donde se prestó el servicio)
- UF (sigla del estado, ej: MS, SP, RJ)
- Número de la NFSe (si es visible)
- Fecha de emisión (si es visible)

Busca campos como "Prestador", "CNPJ", "Valor Total", "Municipio", "Descripción" en la nota.

Retorna SOLO un JSON válido y nada más, en el formato exacto:
{"cnpj": "...", "servico": "...", "valor": 0.00, "cidade": "...", "uf": "...", "numero_nfse": "...", "data_emision": "..."}

Si algún campo no es visible, usa string vacía o 0.0 para valor.
NO inventes datos. Si no encuentras, déjalo vacío.`;

const SYSTEM_PROMPT_OCR_VERIFICACION = `Eres un verificador de datos de Notas Fiscales de Servicio (NFSe) brasileñas.

Se te mostrará una NFSe (imagen/PDF) y debes EXTRAER los datos NUEVAMENTE, de forma independiente.
Presta MUCHA atención a:
- El CNPJ (14 dígitos) - verifica cada dígito
- El valor total - verifica decimales
- La ciudad y UF

Retorna SOLO un JSON válido y nada más, en el formato exacto:
{"cnpj": "...", "servico": "...", "valor": 0.00, "cidade": "...", "uf": "...", "numero_nfse": "...", "data_emision": "..."}

Si algún campo no es visible, usa string vacía o 0.0 para valor.
NO inventes datos.`;

const SYSTEM_PROMPT_CONFERENCIA = `Eres un verificador final de datos de NFSe.

Se te presentan DOS extracciones independientes de la misma NFSe.
Compara los campos y decide cuál es el valor CORRECTO para cada campo.

Reglas:
- Si ambos coinciden en un campo, usa ese valor.
- Si difieren, analiza cuál es más plausible (formato de CNPJ válido, valor coherente, etc.)
- Si no puedes decidir, usa el valor de la primera extracción.

Retorna SOLO un JSON válido con los campos finales:
{"cnpj": "...", "servico": "...", "valor": 0.00, "cidade": "...", "uf": "...", "numero_nfse": "...", "data_emision": "..."}`;

const SYSTEM_PROMPT_ANALISE = `Eres un analista fiscal senior especializado en NFSe y derecho tributario brasileño.
Analiza los datos proporcionados y genera un informe técnico-jurídico completo en Markdown.

El informe DEBE contener estas secciones obligatorias:

## 📋 Datos de la Empresa
- Razón social, nombre fantasia, CNPJ, situación catastral
- Dirección completa, municipio, UF, CEP
- Naturaleza jurídica, porte
- Fecha de inicio de actividad
- CNAE principal y CNAEs secundarios

## 🏢 Encuadramiento Fiscal
- **Simples Nacional:** Sí/No/No informado
- **MEI:** Sí/No/No informado

## 🛠️ Servicio Prestado
- Descripción, código LC 116/2003, CNAE, NBS, CSN

## ⚖️ Legislación Aplicable
- LC 116/2003, Ley Municipal, LC 123/2006, IN RFB 2.100/2022

## 🧮 Análisis de Retenciones
- ISS, IRRF, CSLL, COFINS, PIS según encuadramiento

## 📍 Lugar de Pago del ISS
- Según Art. 3º LC 116/2003

## 🔢 Códigos para Emisión NFSe
- Item Lista Servicio, CNAE, NBS, CSN, CTM

## 🧾 Destaque de Tributos en la NFSe
- Si aplica o no

## 🧾 INSS - Cota Patronal
- Según art. 31 y art. 195 CF

## 💬 Opiniones de la Comunidad
- Resumen de fuentes confiables

## ✅ Conclusión
- Análisis final consolidada

IMPORTANTE: Formatea el informe en Markdown limpio y bien estructurado.`;

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
  return res.ok ? res.content || '' : `Error generando análisis: ${res.error}`;
}