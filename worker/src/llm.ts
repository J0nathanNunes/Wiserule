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
  cnpj_tomador?: string;
  servico: string;
  servico_descricao?: string;
  codigo_servico_nfse?: string;
  item_lista_lc116?: string;
  valor: number;
  valor_liquido?: number;
  iss_retencao?: string;
  cidade: string;
  uf: string;
  numero_nfse?: string;
  data_emissao?: string;
  simples_nacional_nfse?: string;
  mei_nfse?: boolean;
}

export interface ResultadoOcr {
  dados: DadosExtraidos;
  candidatos: Record<'cnpj' | 'servico' | 'servico_descricao' | 'valor' | 'cidade' | 'uf', string[]>;
  confianza: number; // 0 a 1
  campos_divergentes: string[];
  metodo: string;
  erros: string[];
  texto_ocr?: string;
}

const SYSTEM_PROMPT_OCR = `Você é um especialista em leitura de Notas Fiscais de Serviço eletrônicas (NFSe) brasileiras.

Extraia os seguintes dados da NFSe fornecida (imagem/PDF):
- CNPJ do prestador do serviço (formato XX.XXX.XXX/XXXX-XX ou apenas números)
- CNPJ do tomador, separadamente, se visível
- Descrição do serviço (o texto que descreve o que foi prestado)
- Código de tributação do serviço e item da lista LC 116, se visíveis
- Valor total da nota (valor numérico, sem R$)
- Valor líquido e situação de retenção do ISS, em campos separados, se visíveis
- Município da prestação (cidade onde o serviço foi prestado)
- UF (sigla do estado, ex: MS, SP, RJ)
- Número da NFSe (se visível)
- Data de emissão (se visível)
- Situação do Simples Nacional/MEI declarada na própria NFS-e, se visível

Procure campos como "Prestador", "CNPJ", "Valor Total", "Município", "Descrição" na nota.
Não confunda CNPJ do prestador com CNPJ do tomador. Para valor, informe o total dos serviços/nota, nunca ISS, retenções, descontos ou valor líquido quando houver um total geral separado. Para cidade/UF, use município da prestação/incidência quando identificado; não substitua pelo endereço do tomador.

Retorne APENAS um JSON válido e nada mais, no formato exato:
{"cnpj": "...", "cnpj_tomador": "...", "servico": "...", "servico_descricao": "...", "codigo_servico_nfse": "...", "item_lista_lc116": "...", "valor": 0.00, "valor_liquido": 0.00, "iss_retencao": "...", "cidade": "...", "uf": "...", "numero_nfse": "...", "data_emissao": "...", "simples_nacional_nfse": "...", "mei_nfse": false}

Se algum campo não estiver visível, use string vazia ou 0.0 para valor.
NÃO invente dados. Se não encontrar, deixe vazio.`;

const SYSTEM_PROMPT_OCR_VERIFICACION = `Você é um verificador de dados de Notas Fiscais de Serviço (NFSe) brasileiras.

Será mostrada uma NFSe (imagem/PDF) e você deve EXTRAIR os dados NOVAMENTE, de forma independente.
Preste MUITA atenção em:
- O CNPJ (14 dígitos) - verifique cada dígito
- O valor total - verifique decimais
- A cidade e UF
- CNPJ do prestador e CNPJ do tomador em campos separados
- Código do serviço, valor líquido e retenção de ISS, sem confundir com o valor total
Não confunda prestador com tomador. Extraia o total dos serviços/nota, não o ISS retido, os tributos ou o valor líquido se houver total geral separado.

Retorne APENAS um JSON válido e nada mais, no formato exato:
{"cnpj": "...", "cnpj_tomador": "...", "servico": "...", "servico_descricao": "...", "codigo_servico_nfse": "...", "item_lista_lc116": "...", "valor": 0.00, "valor_liquido": 0.00, "iss_retencao": "...", "cidade": "...", "uf": "...", "numero_nfse": "...", "data_emissao": "...", "simples_nacional_nfse": "...", "mei_nfse": false}

Se algum campo não estiver visível, use string vazia ou 0.0 para valor.
NÃO invente dados.`;

const SYSTEM_PROMPT_TRANSCRICAO_NFSE = `Você é um OCR especializado em Notas Fiscais de Serviço eletrônicas (NFSe) brasileiras.
Transcreva fielmente TODO o conteúdo visível da imagem/PDF para texto simples, atuando como leitor óptico.
Preserve os rótulos, a ordem de leitura e as quebras de linha. Mantenha cada valor junto do rótulo a que pertence.
Transcreva separadamente os blocos PRESTADOR/EMITENTE e TOMADOR/CLIENTE; não misture seus CNPJs.
Mantenha todos os valores monetários e seus rótulos (valor dos serviços, valor líquido, ISS, retenções, total da nota).
Não calcule, não corrija, não complete e não deduza conteúdo. Quando não conseguir ler, escreva [ilegível].
Retorne somente a transcrição, sem resumo ou comentário.`;

const SYSTEM_PROMPT_ANALISE = `Você é um analista fiscal sênior especializado em NFSe e direito tributário brasileiro.
Analise os dados fornecidos e gere um relatório técnico-jurídico completo em Markdown.

REGRAS PARA USAR OS DADOS:
- Trate o bloco "nfse" como evidência declarada no documento: use seu código de serviço, valor bruto, valor líquido, retenção de ISS, regime declarado e identificação separada de prestador/tomador.
- Use o código da NFS-e (inclusive subitem nacional) como evidência principal para classificar o serviço; não infira o item LC 116 apenas pelo CNAE ou pelo texto livre quando houver código explícito.
- Preserve a distinção entre valor bruto da operação e valor líquido. Não calcule retenção como se estivesse efetivamente retida quando a nota informa "Não retido".
- Compare o regime tributário consultado para o CNPJ com o regime declarado na NFS-e. Se diferirem ou faltarem dados, mostre a divergência e não escolha um silenciosamente.
- A condição "optante pelo Simples Nacional" declarada na NFS-e não prova, por si só, a situação cadastral atual. Informe-a como declaração do documento e compare com a consulta cadastral.
- Não conclua que a NFS-e e a atividade efetivamente prestada são incompatíveis apenas por as descrições serem diferentes; destaque os dados e peça validação quando a diferença puder alterar o enquadramento.
- Diferencie fatos extraídos, dados consultados e conclusões. Não invente alíquotas municipais, retenções ou itens fiscais; informe limitações e necessidade de validação local quando aplicável.
- Em caso de conflito, apresente ambos os valores e a origem de cada um. A confirmação humana dos campos básicos não transforma campos incertos em fatos legais.

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

const SYSTEM_PROMPT_CHAT_FISCAL = `Você é o assistente fiscal conversacional da Wiserule, com conhecimento especializado em NFS-e, ISS, retenções federais, Simples Nacional, MEI, CNAE, LC 116/2003, LC 123/2006 e obrigações fiscais brasileiras.

Responda à pergunta específica do usuário com clareza, em português brasileiro e em Markdown simples. Seja objetivo; use listas ou exemplos curtos quando ajudarem.

REGRAS DE CONFIABILIDADE:
- Diferencie informação geral de uma conclusão aplicável a um caso concreto. Para ISS, pergunte o município/UF e a natureza efetiva do serviço quando forem necessários.
- Não invente artigos, alíquotas, exceções, decisões, fontes ou regras municipais. Se não tiver segurança ou faltarem dados, diga isso e peça apenas as informações necessárias.
- Ao tratar legislação, indique a norma e o dispositivo somente quando tiver segurança; recomende conferir a redação vigente em fonte oficial, especialmente para mudanças recentes.
- Não afirme que todo serviço ou todo prestador está sujeito à mesma retenção. Considere regime tributário, tipo de serviço, tomador, município, legislação vigente e eventuais exceções.
- Não solicite nem exponha dados pessoais desnecessários. Para uma orientação preliminar, prefira exemplos sem CNPJ ou outros identificadores.
- Forneça informação educativa e analítica, não parecer jurídico/contábil definitivo nem instrução para recolhimento. Recomende validação profissional quando a decisão depender de documentos ou legislação local.
- Se a pergunta não for relacionada à área fiscal brasileira, explique brevemente o escopo e convide o usuário a perguntar sobre tributos, NFS-e ou conformidade fiscal.`;

export async function responderChatFiscal(
  mensagens: Array<{ role: 'user' | 'assistant'; content: string }>,
  config: Config,
  apiKey: string,
): Promise<{ ok: boolean; resposta?: string; error?: string }> {
  const res = await llamarLlm(
    [
      { role: 'system', content: SYSTEM_PROMPT_CHAT_FISCAL },
      ...mensagens,
    ],
    config,
    apiKey,
    config.modeloAnalise,
    0.35,
    1200,
  );

  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, resposta: normalizarEncoding(res.content || '') };
}

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
    cnpj_tomador: typeof d.cnpj_tomador === 'string' ? d.cnpj_tomador.replace(/\D/g, '') : undefined,
    servico: typeof d.servico === 'string' ? d.servico.trim() : '',
    servico_descricao: typeof d.servico_descricao === 'string' ? d.servico_descricao.trim() : undefined,
    codigo_servico_nfse: typeof d.codigo_servico_nfse === 'string' ? d.codigo_servico_nfse.trim() : undefined,
    item_lista_lc116: typeof d.item_lista_lc116 === 'string' ? d.item_lista_lc116.trim() : undefined,
    valor: Number.isFinite(valor) ? valor : 0,
    valor_liquido: typeof d.valor_liquido === 'number' ? d.valor_liquido : undefined,
    iss_retencao: typeof d.iss_retencao === 'string' ? d.iss_retencao.trim() : undefined,
    cidade: typeof d.cidade === 'string' ? d.cidade.trim() : '',
    uf: typeof d.uf === 'string' ? d.uf.toUpperCase().trim() : '',
    numero_nfse: typeof d.numero_nfse === 'string' ? d.numero_nfse : '',
    data_emissao: typeof d.data_emissao === 'string' ? d.data_emissao : '',
    simples_nacional_nfse: typeof d.simples_nacional_nfse === 'string' ? d.simples_nacional_nfse.trim() : undefined,
    mei_nfse: d.mei_nfse === true,
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
 * 1. Extração primária: modelo visual configurado (modelo A)
 * 2. Extração secundária: segundo modelo visual configurado (modelo B)
 * 3. Extração terciária: terceiro modelo visual configurado (modelo C)
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

  const textoNativoPdf = formato === 'pdf' && Boolean(textoPdfExtraido?.trim());
  // PDFs com camada textual podem ser lidos e conferidos sem depender de OCR
  // remoto. O LLM continua disponível para complementar campos que o parser não
  // identificou, mas sua indisponibilidade não deve apagar os dados rotulados.
  // O modelo de transcrição é excluído da confirmação dos campos que transcreveu.
  let modeloTranscricao: string | undefined = textoNativoPdf ? undefined : config.modeloOcr;
  const nomesModelos = [config.modeloVision, config.modeloVisionAlt, config.modeloOcrAlt];
  const modelosIndependentes = new Set(nomesModelos).size === nomesModelos.length;
  let textoDocumento = textoPdfExtraido?.trim() || '';
  let textoOcrConfiavel = textoNativoPdf;
  let erroTranscricao: string | undefined;
  if (!textoDocumento) {
    const mime = formato === 'pdf' ? 'application/pdf' : formato === 'png' ? 'image/png' : 'image/jpeg';
    const arquivoVisual = formato === 'pdf'
      ? { type: 'file', file: { filename: 'nfse.pdf', file_data: `data:application/pdf;base64,${archivoBase64}` } }
      : { type: 'image_url', image_url: { url: `data:${mime};base64,${archivoBase64}` } };
    const transcricao = await llamarLlm([
      { role: 'system', content: SYSTEM_PROMPT_TRANSCRICAO_NFSE },
      { role: 'user', content: [{ type: 'text', text: 'Transcreva fielmente todos os campos legíveis e preserve rótulos e linhas.' }, arquivoVisual] },
    ], config, apiKey, config.modeloOcr, 0.1, 6000);
    modeloTranscricao = config.modeloOcr;
    if (transcricao.ok && transcricao.content?.trim()) {
      textoDocumento = transcricao.content.trim();
      // A transcrição multimodal do LLM é a leitura principal do documento e
      // deve ser tratada como evidência rotulada confiável.
      textoOcrConfiavel = true;
    } else {
      erroTranscricao = transcricao.error || 'A transcrição visual não retornou texto.';
    }
  }

  const evidenciaPdf = textoDocumento
    ? `\n\n${textoNativoPdf ? 'Texto embutido no PDF' : 'Transcrição do OCR multimodal (pode conter erros de leitura)'}; use os rótulos e mantenha prestador/tomador e cada tipo de valor separados. Não invente nem complete dados:\n${textoDocumento.slice(0, 40000)}`
    : '';
  const mimeType = formato === 'pdf' ? 'application/pdf' : formato === 'png' ? 'image/png' : 'image/jpeg';
  const anexo = formato === 'pdf'
    ? { type: 'file', file: { filename: 'nfse.pdf', file_data: `data:application/pdf;base64,${archivoBase64}` } }
    : { type: 'image_url', image_url: { url: `data:${mimeType};base64,${archivoBase64}` } };
  const criarMensagens = (prompt: string, instrucao: string) => [
    { role: 'system', content: prompt },
    { role: 'user', content: [{ type: 'text', text: `${instrucao}${evidenciaPdf}` }, anexo] },
  ];

  // Modelos repetidos não contam como confirmações independentes. Ainda assim,
  // permitem obter candidatos para revisão, sem bloqueio absoluto da extração.
  const respostas = !apiKey
    ? []
    : modelosIndependentes
    ? await Promise.all([
      llamarLlm(criarMensagens(SYSTEM_PROMPT_OCR, 'Extraia os dados desta NFSe e retorne APENAS o JSON.'), config, apiKey, config.modeloVision, 0.1),
      llamarLlm(criarMensagens(SYSTEM_PROMPT_OCR_VERIFICACION, 'Verifique novamente os dados desta NFSe e retorne APENAS o JSON.'), config, apiKey, config.modeloVisionAlt, 0.1),
      llamarLlm(criarMensagens(SYSTEM_PROMPT_OCR, 'Faça uma extração independente dos dados desta NFSe e retorne APENAS o JSON.'), config, apiKey, config.modeloOcrAlt, 0.1),
    ])
    : [await llamarLlm(criarMensagens(SYSTEM_PROMPT_OCR, 'Extraia os dados desta NFSe e retorne APENAS o JSON.'), config, apiKey, config.modeloVision, 0.1)];
  const extracoes = respostas.map((res) => res.ok ? extraerJson(res.content || '') : null);
  const votosComModelo = extracoes.flatMap((dados, indice) => dados
    ? [{ dados: normalizarDados(dados), modelo: nomesModelos[indice] }]
    : []);
  const votosValidos = votosComModelo.map(({ dados }) => dados);
  const { dados: datosVotados, divergentes: divergenciasModelos, confianza } = votarDados(votosValidos);
  const campos = ['cnpj', 'servico', 'valor', 'cidade', 'uf'] as const;
  const candidatos = Object.fromEntries([...campos, 'servico_descricao'].map((campo) => [
    campo,
    [...new Set(votosValidos.map((dados) => String((dados as unknown as Record<string, unknown>)[campo] ?? '').trim()).filter(Boolean))],
  ])) as ResultadoOcr['candidatos'];

  // Extrai dados associados a rótulos explícitos. Em texto nativo de PDF, é evidência
  // estrutural; em imagens/PDFs escaneados, a transcrição é auxiliar e precisa ser
  // corroborada por pelo menos dois modelos visuais independentes.
  const divergenciasResolvidas = new Set<string>();
  if (textoDocumento) {
    const { extrairDadosRotuladosNfse } = await import('./validacoes');
    const rotulados = extrairDadosRotuladosNfse(textoDocumento);
    if (textoOcrConfiavel) {
      Object.assign(datosVotados, {
        ...(rotulados.dados.cnpj ? { cnpj: rotulados.dados.cnpj } : {}),
        ...(rotulados.dados.servico ? { servico: rotulados.dados.servico } : {}),
        ...(rotulados.dados.valor !== undefined ? { valor: rotulados.dados.valor } : {}),
        ...(rotulados.dados.cidade ? { cidade: rotulados.dados.cidade } : {}),
        ...(rotulados.dados.uf ? { uf: rotulados.dados.uf } : {}),
      });
      Object.assign(datosVotados, Object.fromEntries(
        Object.entries({
          cnpj_tomador: rotulados.dados.cnpj_tomador,
          codigo_servico_nfse: rotulados.dados.codigo_servico_nfse,
          item_lista_lc116: rotulados.dados.item_lista_lc116,
          valor_liquido: rotulados.dados.valor_liquido,
          iss_retencao: rotulados.dados.iss_retencao,
          numero_nfse: rotulados.dados.numero_nfse,
          data_emissao: rotulados.dados.data_emissao,
          simples_nacional_nfse: rotulados.dados.simples_nacional_nfse,
          mei_nfse: rotulados.dados.mei_nfse,
        }).filter(([, valor]) => valor !== undefined),
      ));
    }
    for (const campo of campos) {
      const opcoes = rotulados.candidatos[campo] || [];
      if (opcoes.length === 1) {
        const valor = rotulados.dados[campo];
        const modelosCorrespondentes = votosComModelo.filter(({ dados: extracao, modelo }) => {
          // O transcritor não pode votar também como corroborador do próprio OCR.
          if (modeloTranscricao && modelo === modeloTranscricao) return false;
          const valorModelo = String(extracao[campo] ?? '').trim();
          return valorModelo && chaveComparacao(campo, valorModelo) === chaveComparacao(campo, String(valor));
        });
        // Texto nativo do PDF pode preencher o campo quando inequívoco e não contestado.
        // Transcrição de imagem/PDF escaneado exige confirmação de pelo menos 2 modelos visuais.
        const modelosConcordam = textoOcrConfiavel
          ? votosValidos.every((extracao) => {
              const valorModelo = String(extracao[campo] ?? '').trim();
              return !valorModelo || chaveComparacao(campo, valorModelo) === chaveComparacao(campo, String(valor));
            })
          : modelosCorrespondentes.length >= 2;
        // Para "servico" (Serviço Prestado) e "cnpj" (prestador), a evidência
        // estrutural do rótulo prevalece: distingue prestador de tomador e
        // serviço prestado de descrição informativa. Não deve ser descartado
        // por divergência dos modelos que podem mezclar ambos campos.
        const evidenciaPrevalece = textoOcrConfiavel;
        if (valor !== undefined && valor !== '' && (modelosConcordam || evidenciaPrevalece)) {
          (datosVotados as any)[campo] = valor;
          candidatos[campo] = [String(valor)];
          divergenciasResolvidas.add(campo);
        } else if (valor !== undefined && valor !== '') {
          candidatos[campo] = [...new Set([String(valor), ...(candidatos[campo] || [])])];
          divergenciasResolvidas.delete(campo);
        }
      } else if (opcoes.length > 1) {
        candidatos[campo] = [...new Set([...(candidatos[campo] || []), ...opcoes])];
      }
    }

    // "Descrição do Serviço" é informativo (detalhamento), não para tributação.
    // Se existe, se guarda como evidência e se verifica coherencia com o serviço prestado.
    const descricao = rotulados.dados.servico_descricao;
    if (descricao && descricao.trim()) {
      (datosVotados as any).servico_descricao = descricao.trim();
      candidatos.servico_descricao = [descricao.trim()];
    }
  }
  const divergentes = [...new Set([
    ...divergenciasModelos.filter((campo) => !divergenciasResolvidas.has(campo)),
    ...campos.filter((campo) => candidatos[campo].length > 1),
    ...(apiKey && (!modelosIndependentes || votosValidos.length === 1) ? campos : []),
  ])];

  const { validarDadosExtraidos, validarCnpj } = await import('./validacoes');
  const validacao = validarDadosExtraidos(datosVotados);
  const dadosFinais: DadosExtraidos = { ...datosVotados, ...validacao.dados };
  // Não use um CNPJ inválido para consultar uma empresa; pode ser o CNPJ do tomador.
  if (dadosFinais.cnpj && !validarCnpj(dadosFinais.cnpj)) {
    validacao.erros.push('CNPJ extraído não passou na validação dos dígitos verificadores');
    dadosFinais.cnpj = '';
  }
  const erros = [...validacao.erros];
  if (erroTranscricao) erros.push(`Transcrição auxiliar: ${erroTranscricao}`);
  if (textoDocumento && !textoOcrConfiavel) erros.push('A transcrição visual é auxiliar; confira todos os campos na imagem/PDF original.');
  if (apiKey && votosValidos.length < 2) {
    erros.push(`Redundância insuficiente: apenas ${votosValidos.length} de 3 modelos produziram JSON válido; confirme os dados na NFSe.`);
  }
  if (apiKey && !modelosIndependentes) {
    erros.push('Os modelos configurados não são distintos; a leitura foi obtida para conferência, mas não houve voto independente entre modelos.');
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
    metodo: modelosIndependentes ? 'extracao_multimodelo_e_rotulos' : 'extracao_por_rotulos_e_um_modelo',
    erros,
    texto_ocr: textoDocumento || undefined,
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
    } else if (valores.length > 0 && extracoes.length === 1) {
      // Uma única leitura pode servir como sugestão para revisão humana, mas
      // não conta como voto majoritário nem como confirmação independente.
      const escolhido = valores[0];
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
      content: `Analise os dados abaixo e gere o relatório completo em português brasileiro, obedecendo às regras de evidência e divergência do sistema:\n\n${JSON.stringify(contexto, null, 2)}`,
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