/**
 * API principal del Worker Wiserule.
 * Equivalente a backend/main.py en Python.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getConfig, Env } from './config';
import { consultarCnpj, consultarCnpjFallback, emptyEmpresa } from './cnpj';
import { extraerDatosNfse, extraerDatosTexto, generarAnalisis } from './llm';
import { codificarBase64, decodificarBase64 } from './encoding';
import { buscarOnline, formatearBuscaParaLlm } from './busca';
import { correlacionarPorCnae, formatearCorrelacionParaLlm } from './correlacao';
import { formatearClasificacionParaLlm } from './classificacao';
import { salvarAnalise, listarAnalises, buscarAnalisePorId } from './db';
import { consultarNotas } from './geranet';
import { TareaAnalisis, generarTaskId } from './tarefas';
import { validarCnpj, validarUf } from './validacoes';

export { TareaAnalisis };

/**
 * Normaliza encoding de texto que pode ter sido corrompido por encoding duplo.
 * O OpenRouter às vezes retorna texto UTF-8 que é interpretado como Latin-1.
 */
function normalizarEncoding(texto: string): string {
  if (!texto) return texto;

  // Mapeamento manual de caracteres corrompidos comuns
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

function parseValorMonetario(valor: string): number {
  const texto = valor.trim().replace(/[^\d,.-]/g, '');
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

function arquivoCorrespondeExtensao(bytes: Uint8Array, extensao: string): boolean {
  if (extensao === 'pdf') {
    const cabecalho = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
    return cabecalho.includes('%PDF-');
  }
  if (extensao === 'png') {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, indice) => bytes[indice] === byte);
  }
  if (extensao === 'jpg' || extensao === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return false;
}

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const config = getConfig(c.env);
      if (config.corsOrigins.includes(origin)) return origin;
      return config.corsOrigins[0];
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check
app.get('/api/health', (c) => {
  const env = c.env;
  return c.json({
    status: 'ok',
    app: env.APP_NAME || 'Wiserule',
    apis_configured: {
      openrouter: Boolean(env.OPENROUTER_API_KEY),
      tavily: Boolean(env.TAVILY_API_KEY),
      geranet: Boolean(env.GERANET_API_KEY),
      d1: Boolean(env.DB),
    },
  });
});

// Health detallado
app.get('/api/health/detalhado', (c) => {
  const env = c.env;
  return c.json({
    app: env.APP_NAME || 'Wiserule',
    timestamp: new Date().toISOString(),
    apis: {
      openrouter: { status: env.OPENROUTER_API_KEY ? 'online' : 'no_configurada', configurada: Boolean(env.OPENROUTER_API_KEY) },
      minhareceita: { status: 'online', configurada: true },
      tavily: { status: env.TAVILY_API_KEY ? 'online' : 'no_configurada', configurada: Boolean(env.TAVILY_API_KEY) },
      geranet: { status: env.GERANET_API_KEY ? 'online' : 'no_configurada', configurada: Boolean(env.GERANET_API_KEY) },
      d1: { status: env.DB ? 'online' : 'no_configurada', configurada: Boolean(env.DB) },
      backend: { status: 'online', version: '2.0.0' },
    },
  });
});

// An+�lisis de NFSe
app.post('/api/analisar', async (c) => {
  const env = c.env;
  const config = getConfig(env);

  try {
    const form = await c.req.formData();
    const cnpjForm = form.get('cnpj')?.toString() || '';
    const servicoForm = form.get('servico')?.toString() || '';
    const servicoDescricaoForm = form.get('servico_descricao')?.toString() || '';
    const valorForm = form.get('valor')?.toString() || '';
    const cidadeForm = form.get('cidade')?.toString() || '';
    const ufForm = form.get('uf')?.toString() || '';
    const mensajeForm = form.get('mensaje')?.toString() || '';
    const cnpjTomador = form.get('cnpj_tomador')?.toString() || '';
    const archivo = form.get('archivo');
    const dadosConfirmados = form.get('confirmar_dados')?.toString() === 'true';

    // --- FASE 1: Extraer datos ---
    let datosExtraidos: Record<string, unknown> = {};
    let resultadoOcr: Awaited<ReturnType<typeof extraerDatosNfse>> | null = null;

    if (archivo && archivo instanceof File) {
      const extension = archivo.name.includes('.')
        ? archivo.name.split('.').pop()!.toLowerCase()
        : 'png';
      if (!['png', 'jpg', 'jpeg', 'pdf'].includes(extension)) {
        return c.json({ status: 'error', error: 'Formato não suportado. Envie uma NFSe em PNG, JPG ou PDF.' }, 415);
      }
      if (archivo.size === 0 || archivo.size > config.maxFileSizeMb * 1024 * 1024) {
        return c.json({ status: 'error', error: `Arquivo vazio ou muito grande. Máximo: ${config.maxFileSizeMb}MB` }, 413);
      }
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      if (!arquivoCorrespondeExtensao(bytes, extension)) {
        return c.json({ status: 'error', error: 'O conteúdo do arquivo não corresponde à extensão. Envie um PDF, PNG ou JPG válido.' }, 415);
      }

      if (dadosConfirmados) {
        datosExtraidos = {
          cnpj: cnpjForm,
          servico: servicoForm,
          servico_descricao: servicoDescricaoForm,
          valor: parseValorMonetario(valorForm),
          cidade: cidadeForm,
          uf: ufForm,
          confianza_ocr: 0,
          campos_divergentes_ocr: [],
          erros_ocr: [],
        };
      } else {
        // Convierte a base64
        let binary = '';
        for (const byte of bytes) {
          binary += String.fromCharCode(byte);
        }
        const base64 = btoa(binary);

        // Se for PDF, extrai texto para usar como evidência adicional.
        let textoPdfExtraido: string | undefined;
        if (extension === 'pdf') {
          try {
            const { extrairTextoPdf } = await import('./pdf');
            textoPdfExtraido = await extrairTextoPdf(bytes);
          } catch (e) {
            console.error('[PDF] Erro ao extrair texto:', e);
          }
        }

        resultadoOcr = await extraerDatosNfse(base64, extension, config, env.OPENROUTER_API_KEY || '', textoPdfExtraido);
        datosExtraidos = resultadoOcr.dados as unknown as Record<string, unknown>;
      }
    } else if (mensajeForm && !cnpjForm && !servicoForm && !valorForm && !cidadeForm) {
      const datos = await extraerDatosTexto(mensajeForm, config, env.OPENROUTER_API_KEY || '');
      datosExtraidos = datos as unknown as Record<string, unknown>;
    }

    // Mezcla datos
    const cnpj = cnpjForm || String(datosExtraidos.cnpj || '');
    const servico = servicoForm || String(datosExtraidos.servico || '');
    const servicoDescricao = servicoDescricaoForm || String(datosExtraidos.servico_descricao || '');
    const valor = valorForm ? parseValorMonetario(valorForm) : Number(datosExtraidos.valor || 0);
    const cidade = cidadeForm || String(datosExtraidos.cidade || '');
    const uf = ufForm || String(datosExtraidos.uf || '');

    const divergenciasCriticas = resultadoOcr?.campos_divergentes.filter((campo) => {
      if (campo === 'cnpj') return !cnpjForm;
      if (campo === 'servico') return !servicoForm;
      if (campo === 'valor') return !valorForm;
      if (campo === 'cidade') return !cidadeForm;
      if (campo === 'uf') return !form.get('uf');
      return false;
    }) || [];

    // Anexo nunca inicia análise diretamente: exige leitura/revisão confirmada pelo usuário.
    if (archivo instanceof File && !dadosConfirmados) {
      return c.json({
        status: 'revisao_necessaria',
        mensagem: 'Confira os campos extraídos da NFSe e confirme antes de iniciar a análise.',
        dados_extraidos: { cnpj, servico, servico_descricao: servicoDescricao, valor, cidade, uf },
        candidatos_ocr: resultadoOcr?.candidatos || {},
        confiança_ocr: resultadoOcr?.confianza ?? 0,
        campos_divergentes: resultadoOcr?.campos_divergentes || [],
        erros_ocr: resultadoOcr?.erros || [],
      });
    }

    if (!cnpj || servico.trim().length < 3 || cidade.trim().length < 2 || !uf || (archivo instanceof File && valor <= 0) || divergenciasCriticas.length > 0) {
      const problemasOcr = resultadoOcr?.erros.length ? ` Problemas na extração: ${resultadoOcr.erros.join('; ')}.` : '';
      const camposDivergentes = resultadoOcr?.campos_divergentes.length
        ? ` Os modelos divergiram em: ${resultadoOcr.campos_divergentes.join(', ')}.`
        : '';
      return c.json({
        status: 'error',
        error: `Dados insuficientes ou divergentes. Confirme CNPJ do prestador, serviço, valor, cidade e UF da NFSe.${problemasOcr}${camposDivergentes}`,
        dados_extraidos: datosExtraidos,
        campos_divergentes: resultadoOcr?.campos_divergentes || [],
        erros_ocr: resultadoOcr?.erros || [],
      }, 422);
    }

    const cnpjLimpio = cnpj.replace(/\D/g, '');
    if (!validarCnpj(cnpjLimpio)) {
      return c.json({ status: 'error', error: 'O CNPJ informado/extraído é inválido. Confirme o CNPJ do prestador na NFSe.' }, 422);
    }
    if (!validarUf(uf)) {
      return c.json({ status: 'error', error: `UF inválida: ${uf}. Confirme a UF do município de prestação.` }, 422);
    }

    // --- FASE 2: Consultas paralelas ---
    const taskId = generarTaskId();
    const id = c.env.DB ? `${taskId}` : taskId;
    const doId = c.env.TAREA_ANALISIS.idFromName(id);
    const doObj = c.env.TAREA_ANALISIS.get(doId);
    await doObj.fetch(`https://tarea/${id}/inicializar`, {
      method: 'POST',
      body: JSON.stringify({ id: taskId }),
    });

    const inicioEm = new Date().toISOString();
    const actualizarEtapa = (etapa: string, progreso: number) =>
      doObj.fetch(`https://tarea/${id}/actualizar`, {
        method: 'POST',
        body: JSON.stringify({ status: 'procesando', progreso, etapa_actual: etapa, inicio_em: inicioEm }),
      });

    await actualizarEtapa('Consultando Receita Federal...', 20);
    const empresa = await consultarCnpj(cnpjLimpio, config.minhaReceitaUrl);
    if (!empresa.razon_social && empresa.situacion && empresa.situacion.startsWith('Erro')) {
      const fallback = await consultarCnpjFallback(cnpjLimpio);
      if (fallback.razon_social) {
        Object.assign(empresa, fallback);
      }
    }
    const correlacion = correlacionarPorCnae(empresa.cnae, servico);
    const correlacionFormatada = formatearCorrelacionParaLlm(correlacion);

    // --- FASE 3: Búsqueda online ---
    await actualizarEtapa('Consultando legislação aplicable...', 40);
    const cnaeStr = empresa.cnae || servico;
    const pregunta = `${cnaeStr} ${servico} retenci+�n ISS ${cidade} ${uf} LC 116 legislaci+�n`;
    const resultadosBusca = await buscarOnline(pregunta, env);
    const buscaFormatada = formatearBuscaParaLlm(resultadosBusca);

    // --- FASE 4: Clasificación fiscal ---
    await actualizarEtapa('Calculando retenções e tributos...', 60);
    const lc116Codigo = correlacion.lc116;
    const clasificacionFiscal = formatearClasificacionParaLlm({
      lc116Codigo,
      simplesNacional: empresa.simples_nacional,
      ciudadServicio: cidade,
      ufServicio: uf,
      ciudadPrestador: empresa.municipio,
      cnpjTomador,
      valorServicio: valor,
      cnaeServicio: empresa.cnae,
      descripcionServicio: servico,
      prestadorEsMei: empresa.mei,
    });

    // Dispara o processamento em background
    const contexto = {
      empresa,
      correlacion_formatada: correlacionFormatada,
      cnae_codigo: empresa.cnae,
      cnae_descripcion: empresa.cnae_descripcion,
      cnaes_secundarios: empresa.cnaes_secundarios,
      valor,
      cidade,
      uf,
      busca_formatada: buscaFormatada,
      clasificacion_fiscal: clasificacionFiscal,
      confianza_ocr: resultadoOcr?.confianza,
      campos_divergentes_ocr: resultadoOcr?.campos_divergentes,
      erros_ocr: resultadoOcr?.erros,
    };

    // Processa em background (não bloquea a resposta)
    c.executionCtx.waitUntil(
      (async () => {
        try {
          await actualizarEtapa('Gerando relatório completo...', 80);
          const relatorio = await generarAnalisis(contexto, config, env.OPENROUTER_API_KEY || '');

          // Normaliza encoding (corrige caracteres corrompidos)
          const relatorioNormalizado = normalizarEncoding(relatorio);

          // Codifica em Base64 para proteger contra corrupção do Durable Object
          const relatorioBase64 = codificarBase64(relatorioNormalizado);

          // Guarda em D1
          if (env.DB) {
            await salvarAnalise(env.DB, {
              cnpj: cnpjLimpio,
              servico,
              valor,
              cidade,
              uf,
              resultado: relatorioNormalizado,
            });
          }

          await doObj.fetch(`https://tarea/${id}/actualizar`, {
            method: 'POST',
            body: JSON.stringify({ status: 'concluido', progreso: 100, etapa_actual: 'Análise concluída.', inicio_em: inicioEm, relatorio_completo: relatorioBase64 }),
          });
        } catch (e) {
          await doObj.fetch(`https://tarea/${id}/actualizar`, {
            method: 'POST',
            body: JSON.stringify({ status: 'error', error: e instanceof Error ? e.message : 'Error desconocido' }),
          });
        }
      })()
    );

    return c.json({
      status: 'procesando',
      resumo: '',
      dados_extraidos: { task_id: taskId, cnpj: cnpjLimpio, servico, cidade },
    });
  } catch (e) {
    return c.json({ status: 'error', error: `Error interno: ${e instanceof Error ? e.message : 'desconocido'}` });
  }
});

// Status de an+�lisis
app.get('/api/analisar/status/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const id = c.env.DB ? `${taskId}` : taskId;

  try {
    const doId = c.env.TAREA_ANALISIS.idFromName(id);
    const doObj = c.env.TAREA_ANALISIS.get(doId);
    const res = await doObj.fetch(`https://tarea/${id}/status`);
    const tarea = await res.json() as any;

    // Decodifica el relatório de Base64 (protegido contra corrupción del DO)
    if (tarea.relatorio_completo) {
      tarea.relatorio_completo = decodificarBase64(tarea.relatorio_completo);
    }
    if (tarea.etapa_actual) {
      tarea.etapa_actual = normalizarEncoding(tarea.etapa_actual);
    }

    return c.json(tarea);
  } catch {
    return c.json({ status: 'error', error: 'Tarea no encontrada.' }, 404);
  }
});

// Extraer datos de archivo (solo OCR)
app.post('/api/extrair', async (c) => {
  const env = c.env;
  const config = getConfig(env);

  try {
    const form = await c.req.formData();
    const archivo = form.get('archivo');

    if (!archivo || !(archivo instanceof File)) {
      return c.json({ status: 'error', error: 'Ning+�n archivo enviado.' }, 400);
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (bytes.length > config.maxFileSizeMb * 1024 * 1024) {
      return c.json({ status: 'error', error: `Archivo muy grande. M+�ximo: ${config.maxFileSizeMb}MB` }, 413);
    }

    const extension = archivo.name.includes('.')
      ? archivo.name.split('.').pop()!.toLowerCase()
      : 'png';
    if (!['png', 'jpg', 'jpeg', 'pdf'].includes(extension)) {
      return c.json({ status: 'error', error: 'Formato não suportado. Envie PNG, JPG ou PDF.' }, 415);
    }

    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const base64 = btoa(binary);

    let textoPdf: string | undefined;
    if (extension === 'pdf') {
      const { extrairTextoPdf } = await import('./pdf');
      textoPdf = await extrairTextoPdf(bytes);
    }
    const resultado = await extraerDatosNfse(base64, extension, config, env.OPENROUTER_API_KEY || '', textoPdf);
    return c.json({
      status: 'sucesso',
      requer_conferencia_humana: true,
      dados: resultado.dados,
      confianza: resultado.confianza,
      campos_divergentes: resultado.campos_divergentes,
      erros: resultado.erros,
    });
  } catch (e) {
    return c.json({ status: 'error', error: `Error interno: ${e instanceof Error ? e.message : 'desconocido'}` });
  }
});

// Hist+�rico
app.get('/api/historico', async (c) => {
  if (!c.env.DB) return c.json({ status: 'sucesso', analises: [] });
  const limite = parseInt(c.req.query('limite') || '20', 10);
  const analises = await listarAnalises(c.env.DB, limite);
  return c.json({
    status: 'sucesso',
    analises: analises.map((a) => ({
      id: a.id,
      cnpj: a.cnpj,
      servico: a.servico,
      valor: a.valor,
      cidade: a.cidade,
      uf: a.uf,
      criado_em: a.criado_em,
    })),
  });
});

// Detalle de an+�lisis
app.get('/api/historico/:analiseId', async (c) => {
  if (!c.env.DB) return c.json({ status: 'error', error: 'Base de datos no configurada' }, 500);
  const analiseId = parseInt(c.req.param('analiseId'), 10);
  const analise = await buscarAnalisePorId(c.env.DB, analiseId);
  if (!analise) return c.json({ status: 'error', error: 'An+�lisis no encontrada.' }, 404);
  return c.json({ status: 'sucesso', analise });
});

// Geranet
app.post('/api/geranet/consultar-notas', async (c) => {
  const body = await c.req.json();
  const resultado = await consultarNotas(body, c.env);
  return c.json(resultado);
});

// Diagn+�stico
app.get('/api/diagnostico', (c) => {
  const env = c.env;
  const apis: Record<string, { nombre: string; status: string; detalle: string }> = {
    backend: { nombre: 'Backend Wiserule', status: 'online', detalle: 'Servidor corriendo' },
    openrouter: {
      nombre: 'OpenRouter (LLM)',
      status: env.OPENROUTER_API_KEY ? 'online' : 'no_configurada',
      detalle: env.OPENROUTER_API_KEY ? 'Configurada' : 'OPENROUTER_API_KEY no configurada',
    },
    minhareceita: { nombre: 'MinhaReceita (CNPJ)', status: 'online', detalle: 'API p+�blica' },
    tavily: {
      nombre: 'Tavily (B+�squeda)',
      status: env.TAVILY_API_KEY ? 'online' : 'no_configurada',
      detalle: env.TAVILY_API_KEY ? 'Configurada' : 'TAVILY_API_KEY no configurada',
    },
    geranet: {
      nombre: 'Geranet (NFSe)',
      status: env.GERANET_API_KEY ? 'online' : 'no_configurada',
      detalle: env.GERANET_API_KEY ? 'Configurada' : 'GERANET_API_KEY no configurada',
    },
    d1: {
      nombre: 'Cloudflare D1 (Base)',
      status: env.DB ? 'online' : 'no_configurada',
      detalle: env.DB ? 'Conectado' : 'D1 no configurado',
    },
  };

  const resumen = { total: 0, online: 0, offline: 0, error: 0, no_configurada: 0 };
  for (const api of Object.values(apis)) {
    resumen.total++;
    if (api.status === 'online') resumen.online++;
    else if (api.status === 'no_configurada') resumen.no_configurada++;
    else if (api.status === 'error') resumen.error++;
    else resumen.offline++;
  }

  return c.json({
    timestamp: new Date().toISOString(),
    app: env.APP_NAME || 'Wiserule',
    apis,
    resumen,
  });
});

export default app;
// Trigger redeploy to pick up secrets
