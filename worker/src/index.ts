/**
 * API principal del Worker Wiserule.
 * Equivalente a backend/main.py en Python.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getConfig, Env } from './config';
import { consultarCnpj, consultarCnpjFallback, emptyEmpresa } from './cnpj';
import { extraerDatosNfse, extraerDatosTexto, generarAnalisis, responderChatFiscal } from './llm';
import { codificarBase64, decodificarBase64 } from './encoding';
import { buscarOnline, formatearBuscaParaLlm } from './busca';
import { correlacionarPorCnae, formatarCorrelacaoParaLlm } from './correlacao';
import { formatearClasificacionParaLlm } from './classificacao';
import { salvarAnalise, listarAnalises, buscarAnalisePorId } from './db';
import { consultarNotas } from './geranet';
import { TareaAnalisis, generarTaskId } from './tarefas';
import { validarCnpj, validarUf } from './validacoes';
import {
  buscarUsuarioDaSessao,
  compararSegredo,
  criarCredencialSenha,
  criarSessao,
  DURACAO_SESSAO_SEGUNDOS,
  hashToken,
  invalidarSessao,
  NOME_COOKIE_SESSAO,
  UsuarioAutenticado,
  validarEmail,
  validarSenha,
  verificarSenha,
} from './auth';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

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


const app = new Hono<{ Bindings: Env; Variables: { usuario: UsuarioAutenticado } }>();

// CORS
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const config = getConfig(c.env);
      if (config.corsOrigins.includes(origin)) return origin;
      return config.corsOrigins[0];
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

const opcoesCookieSessao = {
  httpOnly: true as const,
  secure: true,
  sameSite: 'None' as const,
  path: '/',
  maxAge: DURACAO_SESSAO_SEGUNDOS,
};

function idNovoUsuario(): string {
  return crypto.randomUUID();
}

// Apenas autenticação, saúde e inicialização controlada são públicas.
app.use('/api/*', async (c, next) => {
  const caminho = new URL(c.req.url).pathname;
  const metodo = c.req.method.toUpperCase();
  const origem = c.req.header('Origin');
  if (
    caminho.startsWith('/api/auth/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo) &&
    (!origem || !getConfig(c.env).corsOrigins.includes(origem))
  ) {
    return c.json({ status: 'error', error: 'Origem da solicitação não autorizada.' }, 403);
  }
  if (
    caminho.startsWith('/api/auth/') ||
    caminho === '/api/health' ||
    caminho === '/api/health/detalhado'
  ) return next();

  if (!c.env.DB) return c.json({ status: 'error', error: 'O banco de dados não está configurado.' }, 503);

  const token = getCookie(c, NOME_COOKIE_SESSAO);
  const usuario = token ? await buscarUsuarioDaSessao(c.env.DB, token) : null;
  if (!usuario) {
    if (token) deleteCookie(c, NOME_COOKIE_SESSAO, { path: '/', secure: true, sameSite: 'None' });
    return c.json({ status: 'error', error: 'Sua sessão expirou. Entre novamente.' }, 401);
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) {
    if (!origem || !getConfig(c.env).corsOrigins.includes(origem)) {
      return c.json({ status: 'error', error: 'Origem da solicitação não autorizada.' }, 403);
    }
  }

  c.set('usuario', usuario);
  return next();
});

app.post('/api/auth/bootstrap', async (c) => {
  if (!c.env.DB) return c.json({ status: 'error', error: 'O banco de dados não está configurado.' }, 503);
  if (!c.env.AUTH_BOOTSTRAP_SECRET) return c.json({ status: 'error', error: 'A inicialização administrativa não está habilitada.' }, 503);

  const body = await c.req.json<{ nome?: string; email?: string; senha?: string; segredo?: string }>().catch(() => null);
  const ip = c.req.header('CF-Connecting-IP') || 'desconhecido';
  let tentativasBootstrap: { total: number } | null;
  try {
    tentativasBootstrap = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM tentativas_login
       WHERE email = ? AND tentada_em > datetime('now', '-15 minutes')`,
    ).bind(`bootstrap:${ip}`).first<{ total: number }>();
    if ((tentativasBootstrap?.total || 0) >= 5) {
      return c.json({ status: 'error', error: 'Limite de tentativas atingido. Aguarde 15 minutos.' }, 429);
    }
    await c.env.DB.prepare('INSERT INTO tentativas_login (email, ip) VALUES (?, ?)').bind(`bootstrap:${ip}`, ip).run();
    await c.env.DB.prepare("DELETE FROM tentativas_login WHERE tentada_em < datetime('now', '-1 day')").run();
  } catch (e) {
    console.error('[AUTH] Falha ao consultar limite de inicialização:', e);
    return c.json({ status: 'error', error: 'Falha no banco ao preparar a inicialização administrativa. Confirme a migração da tabela tentativas_login.' }, 503);
  }
  const nome = body?.nome?.trim() || '';
  const email = body?.email?.trim().toLowerCase() || '';
  const senha = body?.senha || '';
  if (!body || !compararSegredo(body.segredo || '', c.env.AUTH_BOOTSTRAP_SECRET)) {
    return c.json({ status: 'error', error: 'Não foi possível validar a inicialização.' }, 403);
  }
  if (nome.length < 2 || nome.length > 100 || !validarEmail(email) || !validarSenha(senha)) {
    return c.json({ status: 'error', error: 'Informe nome, e-mail válido e senha com pelo menos 12 caracteres.' }, 400);
  }

  let admins: { total: number } | null;
  try {
    admins = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM usuarios WHERE papel = 'admin'").first<{ total: number }>();
  } catch (e) {
    console.error('[AUTH] Falha ao consultar administradores:', e);
    return c.json({ status: 'error', error: 'Falha no banco ao verificar a conta administrativa. Confirme se a migração foi aplicada ao D1 vinculado ao Worker.' }, 503);
  }
  if ((admins?.total || 0) > 0) return c.json({ status: 'error', error: 'A conta administrativa inicial já foi criada.' }, 409);

  let credencial: Awaited<ReturnType<typeof criarCredencialSenha>>;
  try {
    credencial = await criarCredencialSenha(senha);
  } catch (e) {
    console.error('[AUTH] Falha ao gerar hash da senha:', e);
    return c.json({ status: 'error', error: 'O Worker não conseguiu gerar o hash da senha. Verifique a compatibilidade do ambiente criptográfico.' }, 500);
  }
  const id = idNovoUsuario();
  try {
    const resultado = await c.env.DB.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, senha_salt, papel, status)
       SELECT ?, ?, ?, ?, ?, 'admin', 'ativo'
       WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE papel = 'admin')`,
    ).bind(id, nome, email, credencial.hash, credencial.salt).run();
    if (!resultado.meta.changes) return c.json({ status: 'error', error: 'A conta administrativa inicial já foi criada.' }, 409);
  } catch (e) {
    console.error('[AUTH] Falha ao inserir primeiro administrador:', e);
    return c.json({ status: 'error', error: 'Não foi possível gravar a conta no D1. Verifique a tabela usuarios, os campos da migração e se o e-mail já está cadastrado.' }, 500);
  }

  let token: string;
  try {
    token = await criarSessao(c.env.DB, id);
  } catch (e) {
    console.error('[AUTH] Conta criada, mas houve falha ao abrir sessão:', e);
    return c.json({ status: 'sucesso', usuario: { id, nome, email, papel: 'admin', status: 'ativo' }, aviso: 'Conta criada. Entre novamente com e-mail e senha para abrir uma sessão.' }, 201);
  }
  setCookie(c, NOME_COOKIE_SESSAO, token, opcoesCookieSessao);
  return c.json({ status: 'sucesso', usuario: { id, nome, email, papel: 'admin', status: 'ativo' } }, 201);
});

app.get('/api/auth/configuracao', async (c) => {
  if (!c.env.DB) return c.json({ status: 'error', error: 'O banco de dados não está configurado.' }, 503);
  const admin = await c.env.DB.prepare("SELECT 1 AS configurado FROM usuarios WHERE papel = 'admin' LIMIT 1").first();
  return c.json({ status: 'sucesso', inicializacaoDisponivel: !admin && Boolean(c.env.AUTH_BOOTSTRAP_SECRET) });
});

app.post('/api/auth/cadastro', async (c) => {
  if (!c.env.DB) return c.json({ status: 'error', error: 'O banco de dados não está configurado.' }, 503);
  const body = await c.req.json<{ nome?: string; email?: string; senha?: string }>().catch(() => null);
  const nome = body?.nome?.trim() || '';
  const email = body?.email?.trim().toLowerCase() || '';
  const senha = body?.senha || '';
  if (!body || nome.length < 2 || nome.length > 100 || !validarEmail(email) || !validarSenha(senha)) {
    return c.json({ status: 'error', error: 'Informe nome, e-mail válido e senha com pelo menos 12 caracteres.' }, 400);
  }
  const ip = c.req.header('CF-Connecting-IP') || 'desconhecido';
  const cadastrosRecentes = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM tentativas_login
     WHERE email = ? AND tentada_em > datetime('now', '-1 hour')`,
  ).bind(`cadastro:${ip}`).first<{ total: number }>();
  if ((cadastrosRecentes?.total || 0) >= 5) {
    return c.json({ status: 'error', error: 'Limite de cadastros atingido. Tente novamente em uma hora.' }, 429);
  }
  await c.env.DB.prepare('INSERT INTO tentativas_login (email, ip) VALUES (?, ?)').bind(`cadastro:${ip}`, ip).run();
  await c.env.DB.prepare("DELETE FROM tentativas_login WHERE tentada_em < datetime('now', '-1 day')").run();
  const credencial = await criarCredencialSenha(senha);
  try {
    await c.env.DB.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, senha_salt, papel, status)
       VALUES (?, ?, ?, ?, ?, 'usuario', 'pendente')`,
    ).bind(idNovoUsuario(), nome, email, credencial.hash, credencial.salt).run();
  } catch {
    return c.json({ status: 'error', error: 'Já existe um cadastro com este e-mail.' }, 409);
  }
  return c.json({ status: 'pendente', mensagem: 'Cadastro recebido. O acesso será liberado após aprovação por um administrador.' }, 201);
});

app.post('/api/auth/login', async (c) => {
  if (!c.env.DB) return c.json({ status: 'error', error: 'O banco de dados não está configurado.' }, 503);
  const body = await c.req.json<{ email?: string; senha?: string }>().catch(() => null);
  const email = body?.email?.trim().toLowerCase() || '';
  const senha = body?.senha || '';
  if (!email || !senha || email.length > 254 || senha.length > 128) {
    return c.json({ status: 'error', error: 'Informe e-mail e senha.' }, 400);
  }
  const ip = c.req.header('CF-Connecting-IP') || 'desconhecido';
  const tentativas = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM tentativas_login
     WHERE email = ? COLLATE NOCASE AND ip = ? AND tentada_em > datetime('now', '-15 minutes')`,
  ).bind(email, ip).first<{ total: number }>();
  if ((tentativas?.total || 0) >= 10) {
    return c.json({ status: 'error', error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, 429);
  }
  await c.env.DB.prepare('INSERT INTO tentativas_login (email, ip) VALUES (?, ?)').bind(email, ip).run();
  await c.env.DB.prepare("DELETE FROM tentativas_login WHERE tentada_em < datetime('now', '-1 day')").run();
  const usuario = await c.env.DB.prepare(
    'SELECT id, nome, email, senha_hash, senha_salt, papel, status FROM usuarios WHERE email = ? COLLATE NOCASE',
  ).bind(email).first<{ id: string; nome: string; email: string; senha_hash: string; senha_salt: string; papel: 'admin' | 'usuario'; status: 'pendente' | 'ativo' | 'recusado' }>();
  if (!usuario || !(await verificarSenha(senha, usuario.senha_hash, usuario.senha_salt))) {
    return c.json({ status: 'error', error: 'E-mail ou senha incorretos.' }, 401);
  }
  if (usuario.status !== 'ativo') {
    const mensagem = usuario.status === 'pendente'
      ? 'Seu cadastro ainda aguarda aprovação de um administrador.'
      : 'Este cadastro não foi aprovado. Entre em contato com um administrador.';
    return c.json({ status: 'pendente', error: mensagem }, 403);
  }
  await c.env.DB.prepare('DELETE FROM tentativas_login WHERE email = ? COLLATE NOCASE AND ip = ?').bind(email, ip).run();
  const tokenAnterior = getCookie(c, NOME_COOKIE_SESSAO);
  if (tokenAnterior) await invalidarSessao(c.env.DB, tokenAnterior);
  const token = await criarSessao(c.env.DB, usuario.id);
  setCookie(c, NOME_COOKIE_SESSAO, token, opcoesCookieSessao);
  return c.json({ status: 'sucesso', usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel, status: 'ativo' } });
});

app.get('/api/auth/sessao', async (c) => {
  if (!c.env.DB) return c.json({ status: 'error', usuario: null }, 503);
  const token = getCookie(c, NOME_COOKIE_SESSAO);
  const usuario = token ? await buscarUsuarioDaSessao(c.env.DB, token) : null;
  return c.json({ status: 'sucesso', usuario });
});

app.post('/api/auth/sair', async (c) => {
  if (c.env.DB) {
    const token = getCookie(c, NOME_COOKIE_SESSAO);
    if (token) await invalidarSessao(c.env.DB, token);
  }
  deleteCookie(c, NOME_COOKIE_SESSAO, { path: '/', secure: true, sameSite: 'None' });
  return c.json({ status: 'sucesso' });
});

app.get('/api/usuarios', async (c) => {
  if (c.get('usuario').papel !== 'admin') return c.json({ status: 'error', error: 'Apenas administradores podem gerenciar usuários.' }, 403);
  const usuarios = await c.env.DB.prepare(
    `SELECT id, nome, email, papel, status, criado_em, atualizado_em
     FROM usuarios ORDER BY CASE status WHEN 'pendente' THEN 0 WHEN 'ativo' THEN 1 ELSE 2 END, criado_em DESC`,
  ).all();
  return c.json({ status: 'sucesso', usuarios: usuarios.results || [] });
});

app.patch('/api/usuarios/:id', async (c) => {
  const administrador = c.get('usuario');
  if (administrador.papel !== 'admin') return c.json({ status: 'error', error: 'Apenas administradores podem gerenciar usuários.' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string; papel?: string }>().catch(() => null);
  if (!body || !['ativo', 'recusado'].includes(body.status || '') || !['usuario', 'admin'].includes(body.papel || 'usuario')) {
    return c.json({ status: 'error', error: 'Ação de gerenciamento inválida.' }, 400);
  }
  if (id === administrador.id && (body.status !== 'ativo' || body.papel === 'usuario')) {
    return c.json({ status: 'error', error: 'Não é possível remover o próprio acesso administrativo.' }, 400);
  }
  const atual = await c.env.DB.prepare('SELECT papel, status FROM usuarios WHERE id = ?').bind(id).first<{ papel: string; status: string }>();
  if (atual?.papel === 'admin' && atual.status === 'ativo' && (body.status !== 'ativo' || body.papel !== 'admin')) {
    const outrosAdmins = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM usuarios WHERE papel = 'admin' AND status = 'ativo' AND id <> ?",
    ).bind(id).first<{ total: number }>();
    if ((outrosAdmins?.total || 0) === 0) {
      return c.json({ status: 'error', error: 'Mantenha pelo menos um administrador ativo no sistema.' }, 400);
    }
  }
  const resultado = await c.env.DB.prepare(
    `UPDATE usuarios SET status = ?, papel = ?, atualizado_em = datetime('now') WHERE id = ?`,
  ).bind(body.status, body.papel, id).run();
  if (!resultado.meta.changes) return c.json({ status: 'error', error: 'Usuário não encontrado.' }, 404);
  if (body.status !== 'ativo') {
    await c.env.DB.prepare('DELETE FROM sessoes_usuario WHERE usuario_id = ?').bind(id).run();
  }
  return c.json({ status: 'sucesso' });
});

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

// Conversa fiscal, independente do fluxo de análise de NFSe.
app.post('/api/chat', async (c) => {
  const apiKey = c.env.OPENROUTER_API_KEY || '';
  if (!apiKey) {
    return c.json({ status: 'error', error: 'O assistente fiscal não está configurado no momento.' }, 503);
  }

  try {
    const body = await c.req.json<{ mensagens?: unknown }>();
    if (!Array.isArray(body.mensagens) || body.mensagens.length === 0 || body.mensagens.length > 12) {
      return c.json({ status: 'error', error: 'Envie uma conversa com até 12 mensagens.' }, 400);
    }

    const mensagens: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let totalCaracteres = 0;
    for (const item of body.mensagens) {
      if (!item || typeof item !== 'object') {
        return c.json({ status: 'error', error: 'Formato de mensagem inválido.' }, 400);
      }
      const mensagem = item as { role?: unknown; content?: unknown };
      if ((mensagem.role !== 'user' && mensagem.role !== 'assistant') || typeof mensagem.content !== 'string') {
        return c.json({ status: 'error', error: 'Formato de mensagem inválido.' }, 400);
      }
      const content = mensagem.content.trim();
      if (!content || content.length > 4000) {
        return c.json({ status: 'error', error: 'Cada mensagem deve ter entre 1 e 4.000 caracteres.' }, 400);
      }
      totalCaracteres += content.length;
      mensagens.push({ role: mensagem.role, content });
    }

    if (totalCaracteres > 10000 || mensagens[mensagens.length - 1].role !== 'user') {
      return c.json({ status: 'error', error: 'A conversa é longa demais ou não termina com uma pergunta do usuário.' }, 400);
    }

    const resultado = await responderChatFiscal(mensagens, getConfig(c.env), apiKey);
    if (!resultado.ok || !resultado.resposta) {
      console.error('[CHAT] Falha ao gerar resposta fiscal:', resultado.error);
      return c.json({ status: 'error', error: 'Não foi possível responder agora. Tente novamente em instantes.' }, 502);
    }

    return c.json({ status: 'sucesso', resposta: resultado.resposta });
  } catch (e) {
    console.error('[CHAT] Erro na conversa fiscal:', e);
    return c.json({ status: 'error', error: 'Não foi possível processar a mensagem.' }, 400);
  }
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
    const cnpjTomadorForm = form.get('cnpj_tomador')?.toString() || '';
    const codigoServicoForm = form.get('codigo_servico_nfse')?.toString() || '';
    const itemListaLc116Form = form.get('item_lista_lc116')?.toString() || '';
    const valorForm = form.get('valor')?.toString() || '';
    const valorLiquidoForm = form.get('valor_liquido')?.toString() || '';
    const issRetencaoForm = form.get('iss_retencao')?.toString() || '';
    const numeroNfseForm = form.get('numero_nfse')?.toString() || '';
    const dataEmissaoForm = form.get('data_emissao')?.toString() || '';
    const simplesNacionalNfseForm = form.get('simples_nacional_nfse')?.toString() || '';
    const meiNfseForm = form.get('mei_nfse')?.toString() === 'true';
    const cidadeForm = form.get('cidade')?.toString() || '';
    const ufForm = form.get('uf')?.toString() || '';
    const mensajeForm = form.get('mensaje')?.toString() || '';
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
          cnpj_tomador: cnpjTomadorForm,
          servico: servicoForm,
          servico_descricao: servicoDescricaoForm,
          codigo_servico_nfse: codigoServicoForm,
          item_lista_lc116: itemListaLc116Form,
          valor: parseValorMonetario(valorForm),
          valor_liquido: valorLiquidoForm ? parseValorMonetario(valorLiquidoForm) : undefined,
          iss_retencao: issRetencaoForm,
          numero_nfse: numeroNfseForm,
          data_emissao: dataEmissaoForm,
          simples_nacional_nfse: simplesNacionalNfseForm,
          mei_nfse: meiNfseForm,
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

        // O LLM multimodal do OpenRouter faz o OCR de imagens e PDFs digitalizados.
        resultadoOcr = await extraerDatosNfse(base64, extension, config, env.OPENROUTER_API_KEY || '', textoPdfExtraido);
        if (!env.OPENROUTER_API_KEY && !textoPdfExtraido?.trim()) {
          return c.json({
            status: 'error',
            error: 'A extração não encontrou texto no documento. Configure a chave OpenRouter para habilitar OCR de imagens e PDFs digitalizados.',
            erros_ocr: resultadoOcr.erros,
          }, 422);
        }
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
    const cnpjTomador = cnpjTomadorForm || String(datosExtraidos.cnpj_tomador || '');
    const codigoServicoNfse = codigoServicoForm || String(datosExtraidos.codigo_servico_nfse || '');
    const itemListaLc116 = itemListaLc116Form || String(datosExtraidos.item_lista_lc116 || '');
    const valorLiquido = valorLiquidoForm ? parseValorMonetario(valorLiquidoForm) : typeof datosExtraidos.valor_liquido === 'number' ? datosExtraidos.valor_liquido : undefined;
    const retencaoIssNfse = issRetencaoForm || String(datosExtraidos.iss_retencao || '');
    const numeroNfse = numeroNfseForm || String(datosExtraidos.numero_nfse || '');
    const dataEmissao = dataEmissaoForm || String(datosExtraidos.data_emissao || '');
    const simplesNacionalNfse = simplesNacionalNfseForm || String(datosExtraidos.simples_nacional_nfse || '');
    const meiNfse = meiNfseForm || datosExtraidos.mei_nfse === true;

    const divergenciasCriticas = resultadoOcr?.campos_divergentes.filter((campo) => {
      if (campo === 'cnpj') return !cnpjForm;
      if (campo === 'servico') return !servicoForm;
      if (campo === 'valor') return !valorForm;
      if (campo === 'cidade') return !cidadeForm;
      if (campo === 'uf') return !form.get('uf');
      return false;
    }) || [];

    if (archivo instanceof File && dadosConfirmados) {
      const camposInvalidos = [cnpjTomador && !validarCnpj(cnpjTomador), valorLiquido !== undefined && valorLiquido < 0]
        .some(Boolean);
      if (camposInvalidos) {
        return c.json({ status: 'error', error: 'Os dados fiscais complementares incluem CNPJ do tomador inválido ou valor líquido negativo. Confira a NFSe.' }, 422);
      }
    }

    // Anexo nunca inicia análise diretamente: exige leitura/revisão confirmada pelo usuário.
    if (archivo instanceof File && !dadosConfirmados) {
      return c.json({
        status: 'revisao_necessaria',
        mensagem: 'Confira os dados extraídos no documento original antes de iniciar a análise fiscal.',
        dados_extraidos: datosExtraidos,
        confiança_ocr: resultadoOcr?.confianza || 0,
        candidatos_ocr: resultadoOcr?.candidatos || {},
        candidatos: resultadoOcr?.candidatos || {},
        texto_ocr: resultadoOcr?.texto_ocr || '',
        metodo_ocr: resultadoOcr?.metodo || '',
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
    if (!empresa.razao_social && empresa.situacao && empresa.situacao.startsWith('Erro')) {
      const fallback = await consultarCnpjFallback(cnpjLimpio);
      if (fallback.razao_social) {
        Object.assign(empresa, fallback);
      }
    }
    const correlacion = correlacionarPorCnae(empresa.cnae_codigo, `${servico} ${codigoServicoNfse}`.trim());
    const correlacionFormatada = formatarCorrelacaoParaLlm(correlacion);

    // --- FASE 3: Búsqueda online ---
    await actualizarEtapa('Consultando legislação aplicable...', 40);
    const cnaeStr = empresa.cnae || servico;
    const pregunta = `${cnaeStr} ${servico} retenção ISS ${cidade} ${uf} LC 116 legislação`;
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
      cnaeServicio: empresa.cnae_codigo || empresa.cnae,
      descripcionServicio: `${servico} ${servicoDescricao}`.trim(),
      // A situação declarada na nota é evidência documental, não status cadastral.
      // Para regras automáticas de retenção/cota use o dado cadastral consultado;
      // a declaração da NFSe continua separada no contexto do relatório.
      prestadorEsMei: empresa.mei,
    });

    // Dispara o processamento em background
    const contexto = {
      empresa,
      nfse: {
        numero: numeroNfse,
        data_emissao: dataEmissao,
        cnpj_prestador: cnpjLimpio,
        cnpj_tomador: cnpjTomador,
        codigo_servico: codigoServicoNfse,
        item_lista_lc116: itemListaLc116,
        descricao_servico: servico,
        detalhamento_servico: servicoDescricao,
        valor_bruto: valor,
        valor_liquido: valorLiquido,
        iss_retencao_declarada: retencaoIssNfse,
        simples_nacional_declarado: simplesNacionalNfse,
        mei_declarado: meiNfse,
      },
      correlacion_formatada: correlacionFormatada,
      cnae_codigo: empresa.cnae_codigo,
      cnae_descricao: empresa.cnae_descricao,
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
    if (!arquivoCorrespondeExtensao(bytes, extension)) {
      return c.json({ status: 'error', error: 'O conteúdo do arquivo não corresponde à extensão informada.' }, 415);
    }

    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const base64 = btoa(binary);

    let textoPdf: string | undefined;
    if (extension === 'pdf') {
      try {
        const { extrairTextoPdf } = await import('./pdf');
        textoPdf = await extrairTextoPdf(bytes);
      } catch (e) {
        console.error('[PDF] Erro ao extrair texto no endpoint OCR:', e);
      }
    }
    if (!textoPdf?.trim() && !env.OPENROUTER_API_KEY) {
      return c.json({ status: 'error', error: 'Não foi possível extrair texto do documento e o OCR multimodal não está configurado. Configure a chave OpenRouter.' }, 422);
    }
    const resultado = await extraerDatosNfse(base64, extension, config, env.OPENROUTER_API_KEY || '', textoPdf);
    return c.json({
      status: 'sucesso',
      requer_conferencia_humana: true,
      dados: resultado.dados,
      confianza: resultado.confianza,
      campos_divergentes: resultado.campos_divergentes,
      erros: resultado.erros,
      candidatos: resultado.candidatos,
      texto_ocr: resultado.texto_ocr || '',
      metodo_ocr: resultado.metodo,
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
