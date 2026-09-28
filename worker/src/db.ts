/**
 * Capa de base de datos D1 (SQLite) para Wiserule.
 * Equivalente a backend/database.py en Python.
 */

export interface Analise {
  id: number;
  cnpj: string;
  servico: string;
  valor: number;
  cidade: string;
  uf: string;
  resultado_json: string;
  criado_em: string;
}

export async function salvarAnalise(
  db: D1Database,
  params: { cnpj: string; servico: string; valor: number; cidade: string; uf: string; resultado: string },
): Promise<number> {
  try {
    const res = await db
      .prepare(
        `INSERT INTO analises (cnpj, servico, valor, cidade, uf, resultado_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(params.cnpj, params.servico, params.valor, params.cidade, params.uf, params.resultado)
      .run();

    return res.meta?.last_row_id || 0;
  } catch (e) {
    console.error('[DB] Erro ao salvar análise:', e);
    return 0;
  }
}

// --- Cache de consultas ao emissor (Geranet) por CNPJ ---

export interface CacheEmissor {
  resposta: string;
  criado_em: string;
}

/** TTL do cache do emissor em segundos (15 minutos). */
export const TTL_CACHE_EMISSOR_SEGUNDOS = 15 * 60;

/** Busca a resposta do emissor em cache para o CNPJ, se ainda válida. */
export async function obterCacheEmissor(
  db: D1Database,
  cnpj: string,
): Promise<string | null> {
  try {
    const res = await db
      .prepare(
        `SELECT resposta FROM cache_emissor_nfse
         WHERE cnpj = ? AND criado_em > datetime('now', '-${TTL_CACHE_EMISSOR_SEGUNDOS} seconds')
         ORDER BY criado_em DESC LIMIT 1`
      )
      .bind(cnpj)
      .first<{ resposta: string }>();
    return res?.resposta || null;
  } catch (e) {
    console.error('[DB] Erro ao ler cache do emissor:', e);
    return null;
  }
}

/** Salva (ou substitui) a resposta do emissor em cache para o CNPJ. */
export async function salvarCacheEmissor(
  db: D1Database,
  cnpj: string,
  resposta: string,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO cache_emissor_nfse (cnpj, resposta, criado_em)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(cnpj) DO UPDATE SET resposta = excluded.resposta, criado_em = datetime('now')`
      )
      .bind(cnpj, resposta)
      .run();
  } catch (e) {
    console.error('[DB] Erro ao salvar cache do emissor:', e);
  }
}

// --- Cache de referências IBPT por código LC116/NBS + UF ---

/** TTL do cache IBPT em segundos (24h — a tabela tem vigência semanal/mensal). */
export const TTL_CACHE_IBPT_SEGUNDOS = 24 * 60 * 60;

/** Busca a alíquota IBPT em cache para o código+UF, se ainda válida. */
export async function obterCacheIbpt(
  db: D1Database,
  codigo: string,
  uf: string,
): Promise<string | null> {
  try {
    const res = await db
      .prepare(
        `SELECT resposta FROM cache_ibpt_aliquotas
         WHERE codigo = ? AND uf = ? AND criado_em > datetime('now', '-${TTL_CACHE_IBPT_SEGUNDOS} seconds')
         ORDER BY criado_em DESC LIMIT 1`
      )
      .bind(codigo, uf)
      .first<{ resposta: string }>();
    return res?.resposta || null;
  } catch (e) {
    console.error('[DB] Erro ao ler cache IBPT:', e);
    return null;
  }
}

/** Salva (ou substitui) a alíquota IBPT em cache para o código+UF. */
export async function salvarCacheIbpt(
  db: D1Database,
  codigo: string,
  uf: string,
  resposta: string,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO cache_ibpt_aliquotas (codigo, uf, resposta, criado_em)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(codigo, uf) DO UPDATE SET resposta = excluded.resposta, criado_em = datetime('now')`
      )
      .bind(codigo, uf, resposta)
      .run();
  } catch (e) {
    console.error('[DB] Erro ao salvar cache IBPT:', e);
  }
}

export async function listarAnalises(db: D1Database, limite = 20): Promise<Analise[]> {
  try {
    const res = await db
      .prepare(
        `SELECT id, cnpj, servico, valor, cidade, uf, resultado_json, criado_em
         FROM analises
         ORDER BY criado_em DESC
         LIMIT ?`
      )
      .bind(limite)
      .all();

    return (res.results || []).map((row) => ({
      id: row.id as number,
      cnpj: (row.cnpj as string) || '',
      servico: (row.servico as string) || '',
      valor: (row.valor as number) || 0,
      cidade: (row.cidade as string) || '',
      uf: (row.uf as string) || 'MS',
      resultado_json: (row.resultado_json as string) || '',
      criado_em: (row.criado_em as string) || '',
    }));
  } catch (e) {
    console.error('[DB] Erro ao listar análises:', e);
    return [];
  }
}

export async function buscarAnalisePorId(db: D1Database, analiseId: number): Promise<Analise | null> {
  try {
    const res = await db
      .prepare(
        `SELECT id, cnpj, servico, valor, cidade, uf, resultado_json, criado_em
         FROM analises
         WHERE id = ?`
      )
      .bind(analiseId)
      .first();

    if (!res) return null;

    return {
      id: res.id as number,
      cnpj: (res.cnpj as string) || '',
      servico: (res.servico as string) || '',
      valor: (res.valor as number) || 0,
      cidade: (res.cidade as string) || '',
      uf: (res.uf as string) || 'MS',
      resultado_json: (res.resultado_json as string) || '',
      criado_em: (res.criado_em as string) || '',
    };
  } catch (e) {
    console.error('[DB] Erro ao buscar análise:', e);
    return null;
  }
}