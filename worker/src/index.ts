/**
 * API principal del Worker Wiserule.
 * Equivalente a backend/main.py en Python.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getConfig, Env } from './config';
import { consultarCnpj, consultarCnpjFallback, emptyEmpresa } from './cnpj';
import { extraerDatosNfse, extraerDatosTexto, generarAnalisis } from './llm';
import { buscarOnline, formatearBuscaParaLlm } from './busca';
import { correlacionarPorCnae, formatearCorrelacionParaLlm } from './correlacao';
import { formatearClasificacionParaLlm } from './classificacao';
import { salvarAnalise, listarAnalises, buscarAnalisePorId } from './db';
import { consultarNotas } from './geranet';
import { TareaAnalisis, generarTaskId } from './tarefas';

export { TareaAnalisis };

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

// Análisis de NFSe
app.post('/api/analisar', async (c) => {
  const env = c.env;
  const config = getConfig(env);

  try {
    const form = await c.req.formData();
    const cnpjForm = form.get('cnpj')?.toString() || '';
    const servicoForm = form.get('servico')?.toString() || '';
    const valorForm = form.get('valor')?.toString() || '';
    const cidadeForm = form.get('cidade')?.toString() || '';
    const ufForm = form.get('uf')?.toString() || 'MS';
    const mensajeForm = form.get('mensaje')?.toString() || '';
    const cnpjTomador = form.get('cnpj_tomador')?.toString() || '';
    const archivo = form.get('archivo');

    // --- FASE 1: Extraer datos ---
    let datosExtraidos: Record<string, unknown> = {};
    let resultadoOcr: ReturnType<typeof extraerDatosNfse> | null = null;

    if (archivo && archivo instanceof File) {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      if (bytes.length > config.maxFileSizeMb * 1024 * 1024) {
        return c.json({ status: 'error', error: `Archivo muy grande. Máximo: ${config.maxFileSizeMb}MB` }, 413);
      }

      const extension = archivo.name.includes('.')
        ? archivo.name.split('.').pop()!.toLowerCase()
        : 'png';

      // Convierte a base64
      let binary = '';
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      const base64 = btoa(binary);

      resultadoOcr = await extraerDatosNfse(base64, extension, config, env.OPENROUTER_API_KEY || '');
      datosExtraidos = resultadoOcr.dados as unknown as Record<string, unknown>;
    } else if (mensajeForm && !cnpjForm && !servicoForm && !valorForm && !cidadeForm) {
      const datos = await extraerDatosTexto(mensajeForm, config, env.OPENROUTER_API_KEY || '');
      datosExtraidos = datos as unknown as Record<string, unknown>;
    }

    // Mezcla datos
    const cnpj = cnpjForm || String(datosExtraidos.cnpj || '');
    const servico = servicoForm || String(datosExtraidos.servico || '');
    const valor = valorForm ? parseFloat(valorForm.replace(',', '.')) : Number(datosExtraidos.valor || 0);
    const cidade = cidadeForm || String(datosExtraidos.cidade || '');
    const uf = ufForm || String(datosExtraidos.uf || 'MS');

    if (!cnpj || !servico || !cidade) {
      return c.json({ status: 'error', error: 'Datos insuficientes. Informa CNPJ, servicio y ciudad.' });
    }

    const cnpjLimpio = cnpj.replace(/\D/g, '');

    // --- FASE 2: Consultas paralelas ---
    const empresa = await consultarCnpj(cnpjLimpio, config.minhaReceitaUrl);
    if (!empresa.razon_social && empresa.situacion.startsWith('Erro')) {
      const fallback = await consultarCnpjFallback(cnpjLimpio);
      if (fallback.razon_social) {
        Object.assign(empresa, fallback);
      }
    }

    const correlacion = correlacionarPorCnae(empresa.cnae, servico);
    const correlacionFormatada = formatearCorrelacionParaLlm(correlacion);

    // --- FASE 3: Búsqueda online ---
    const cnaeStr = empresa.cnae || servico;
    const pregunta = `${cnaeStr} ${servico} retención ISS ${cidade} ${uf} LC 116 legislación`;
    const resultadosBusca = await buscarOnline(pregunta, env);
    const buscaFormatada = formatearBuscaParaLlm(resultadosBusca);

    // --- FASE 4: Clasificación fiscal ---
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

    // --- FASE 5: Generar análisis (en background via Durable Object) ---
    const taskId = generarTaskId();
    const id = c.env.DB ? `${taskId}` : taskId;

    // Crea el Durable Object
    const doId = c.env.TAREA_ANALISIS.idFromName(id);
    const doObj = c.env.TAREA_ANALISIS.get(doId);
    await doObj.fetch(`https://tarea/${id}/inicializar`, {
      method: 'POST',
      body: JSON.stringify({ id: taskId }),
    });

    // Dispara el procesamiento en background
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
    };

    // Procesa en background (no bloquea la respuesta)
    c.executionCtx.waitUntil(
      (async () => {
        try {
          await doObj.fetch(`https://tarea/${id}/actualizar`, {
            method: 'POST',
            body: JSON.stringify({ status: 'procesando', progreso: 60, etapa_actual: 'Generando informe completo...' }),
          });

          const relatorio = await generarAnalisis(contexto, config, env.OPENROUTER_API_KEY || '');

          // Guarda en D1
          if (env.DB) {
            await salvarAnalise(env.DB, {
              cnpj: cnpjLimpio,
              servico,
              valor,
              cidade,
              uf,
              resultado: relatorio,
            });
          }

          await doObj.fetch(`https://tarea/${id}/actualizar`, {
            method: 'POST',
            body: JSON.stringify({ status: 'concluido', progreso: 100, etapa_actual: 'Análisis concluida.', relatorio_completo: relatorio }),
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

// Status de análisis
app.get('/api/analisar/status/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const id = c.env.DB ? `${taskId}` : taskId;

  try {
    const doId = c.env.TAREA_ANALISIS.idFromName(id);
    const doObj = c.env.TAREA_ANALISIS.get(doId);
    const res = await doObj.fetch(`https://tarea/${id}/status`);
    const tarea = await res.json();
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
      return c.json({ status: 'error', error: 'Ningún archivo enviado.' }, 400);
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (bytes.length > config.maxFileSizeMb * 1024 * 1024) {
      return c.json({ status: 'error', error: `Archivo muy grande. Máximo: ${config.maxFileSizeMb}MB` }, 413);
    }

    const extension = archivo.name.includes('.')
      ? archivo.name.split('.').pop()!.toLowerCase()
      : 'png';

    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const base64 = btoa(binary);

    const resultado = await extraerDatosNfse(base64, extension, config, env.OPENROUTER_API_KEY || '');
    return c.json({ status: 'sucesso', dados: resultado.dados, confianza: resultado.confianza, campos_divergentes: resultado.campos_divergentes });
  } catch (e) {
    return c.json({ status: 'error', error: `Error interno: ${e instanceof Error ? e.message : 'desconocido'}` });
  }
});

// Histórico
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

// Detalle de análisis
app.get('/api/historico/:analiseId', async (c) => {
  if (!c.env.DB) return c.json({ status: 'error', error: 'Base de datos no configurada' }, 500);
  const analiseId = parseInt(c.req.param('analiseId'), 10);
  const analise = await buscarAnalisePorId(c.env.DB, analiseId);
  if (!analise) return c.json({ status: 'error', error: 'Análisis no encontrada.' }, 404);
  return c.json({ status: 'sucesso', analise });
});

// Geranet
app.post('/api/geranet/consultar-notas', async (c) => {
  const body = await c.req.json();
  const resultado = await consultarNotas(body, c.env);
  return c.json(resultado);
});

// Diagnóstico
app.get('/api/diagnostico', (c) => {
  const env = c.env;
  const apis: Record<string, { nombre: string; status: string; detalle: string }> = {
    backend: { nombre: 'Backend Wiserule', status: 'online', detalle: 'Servidor corriendo' },
    openrouter: {
      nombre: 'OpenRouter (LLM)',
      status: env.OPENROUTER_API_KEY ? 'online' : 'no_configurada',
      detalle: env.OPENROUTER_API_KEY ? 'Configurada' : 'OPENROUTER_API_KEY no configurada',
    },
    minhareceita: { nombre: 'MinhaReceita (CNPJ)', status: 'online', detalle: 'API pública' },
    tavily: {
      nombre: 'Tavily (Búsqueda)',
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
 