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