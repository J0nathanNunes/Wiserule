/**
 * Integração com a API De Olho no Imposto (DONI/IBPT).
 *
 * Consulta a alíquota de referência (nacional/estadual/municipal) do serviço
 * pelo código LC 116/NBS e UF. A resposta é uma REFERÊNCIA com fonte e
 * vigência — nunca a lei municipal oficial. O relatório deve citar a fonte
 * e manter a pendência de confirmação na legislação municipal.
 *
 * Multi-empresa: o token é por CNPJ cadastrado no IBPT. A resolução segue
 * o mesmo padrão dos certificados Geranet:
 *  1. IBPT_TOKENS_JSON  → {"cnpj":"token", ...}
 *  2. IBPT_TOKEN_{CNPJ} → variável individual
 *  3. IBPT_TOKEN (+ IBPT_CNPJ) → token único legado
 *
 * Cache D1 por código+UF (TTL 24h): a tabela IBPT tem vigência semanal/
 * mensal, então 24h é seguro e evita reconsultas na mesma análise.
 */

import { Config, Env } from './config';
import { obterCacheIbpt, salvarCacheIbpt } from './db';

export interface AliquotaIbpt {
  codigo: string;
  uf: string;
  descricao: string;
  tipo: string;
  nacional: number;
  estadual: number;
  municipal: number;
  importado: number;
  vigencia_inicio: string;
  vigencia_fim: string;
  versao: string;
  fonte: string;
}

export interface ResultadoIbpt {
  status: 'sucesso' | 'sem_token' | 'erro' | 'indisponivel';
  aliquota?: AliquotaIbpt;
  error?: string;
}

function resolverToken(env: Env, cnpj: string): string | null {
  // 1. JSON multi-empresa (IBPT_TOKENS_JSON)
  if (env.IBPT_TOKENS_JSON) {
    try {
      const tokens = JSON.parse(env.IBPT_TOKENS_JSON) as Record<string, string>;
      if (tokens[cnpj]) return tokens[cnpj];
    } catch {
      // JSON inválido: segue para os fallbacks
    }
  }

  // 2. Variável individual IBPT_TOKEN_{CNPJ}
  const varName = `IBPT_TOKEN_${cnpj}`;
  const individual = (env as unknown as Record<string, string | undefined>)[varName];
  if (individual) return individual;

  // 3. Token único legado (só se o CNPJ cadastrado coincidir, quando informado)
  if (env.IBPT_TOKEN && (!env.IBPT_CNPJ || env.IBPT_CNPJ.replace(/\D/g, '') === cnpj)) {
    return env.IBPT_TOKEN;
  }

  return null;
}

/**
 * Consulta a alíquota de referência do serviço. Nunca lança: falhas
 * retornam status de erro e a análise segue sem a referência.
 */
export async function consultarAliquotaServico(
  cnpj: string,
  codigoLc116OuNbs: string,
  uf: string,
  descricao: string,
  valor: number,
  config: Config,
  env: Env,
): Promise<ResultadoIbpt> {
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  const codigoLimpo = (codigoLc116OuNbs || '').replace(/\D/g, '');
  const ufLimpa = (uf || '').trim().toUpperCase();

  if (!cnpjLimpo || cnpjLimpo.length !== 14) {
    return { status: 'sem_token', error: 'CNPJ do prestador ausente ou inválido para consulta IBPT.' };
  }
  if (!codigoLimpo) {
    return { status: 'indisponivel', error: 'Sem código LC 116/NBS para consultar a referência IBPT.' };
  }
  if (!ufLimpa || ufLimpa.length !== 2) {
    return { status: 'indisponivel', error: 'Sem UF para consultar a referência IBPT.' };
  }

  const token = resolverToken(env, cnpjLimpo);
  if (!token) {
    return { status: 'sem_token', error: `Nenhum token IBPT cadastrado para o CNPJ ${cnpjLimpo}.` };
  }

  // Cache D1 (TTL 24h) por código+UF.
  if (env.DB) {
    const cacheado = await obterCacheIbpt(env.DB, codigoLimpo, ufLimpa);
    if (cacheado) {
      try {
        return { status: 'sucesso', aliquota: JSON.parse(cacheado) as AliquotaIbpt };
      } catch {
        // Cache corrompido: consulta fresca.
      }
    }
  }

  const url = new URL(`${config.ibptBaseUrl}/servicos`);
  url.searchParams.set('token', token);
  url.searchParams.set('cnpj', cnpjLimpo);
  url.searchParams.set('codigo', codigoLimpo);
  url.searchParams.set('uf', ufLimpa);
  if (descricao) url.searchParams.set('descricao', descricao.slice(0, 200));
  if (valor > 0) url.searchParams.set('valor', String(valor));

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return { status: 'erro', error: `Token IBPT inválido para o CNPJ ${cnpjLimpo} (HTTP ${res.status}).` };
    }
    if (res.status === 404) {
      return { status: 'indisponivel', error: 'Código de serviço não encontrado na tabela IBPT.' };
    }
    if (!res.ok) {
      return { status: 'erro', error: `IBPT retornou HTTP ${res.status}.` };
    }

    const dados = await res.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(dados) || dados.length === 0) {
      return { status: 'indisponivel', error: 'IBPT não retornou alíquota para este código/UF.' };
    }

    const item = dados[0];
    const aliquota: AliquotaIbpt = {
      codigo: String(item.Codigo || codigoLimpo),
      uf: String(item.UF || ufLimpa),
      descricao: String(item.Descricao || ''),
      tipo: String(item.Tipo || ''),
      nacional: Number(item.Nacional) || 0,
      estadual: Number(item.Estadual) || 0,
      municipal: Number(item.Municipal) || 0,
      importado: Number(item.Importado) || 0,
      vigencia_inicio: String(item.VigenciaInicio || ''),
      vigencia_fim: String(item.VigenciaFim || ''),
      versao: String(item.Versao || ''),
      fonte: String(item.Fonte || 'IBPT'),
    };

    // Salva em cache para as próximas análises do mesmo código+UF.
    if (env.DB) {
      await salvarCacheIbpt(env.DB, codigoLimpo, ufLimpa, JSON.stringify(aliquota));
    }

    return { status: 'sucesso', aliquota };
  } catch (e) {
    return { status: 'erro', error: `Erro na consulta IBPT: ${e instanceof Error ? e.message.slice(0, 150) : 'desconhecido'}` };
  }
}

/** Formata a referência IBPT para o contexto do LLM. */
export function formatarIbptParaLlm(resultado: ResultadoIbpt): string {
  if (resultado.status !== 'sucesso' || !resultado.aliquota) {
    if (resultado.status === 'sem_token') {
      return 'Referência IBPT: indisponível (sem token cadastrado para este CNPJ). Informe a pendência de alíquota municipal como hoje.';
    }
    return 'Referência IBPT: indisponível. Informe a pendência de alíquota municipal como hoje.';
  }
  const a = resultado.aliquota;
  return [
    'Referência IBPT (tabela de alíquotas de referência, NÃO é a lei municipal):',
    `- Código consultado: ${a.codigo} (${a.tipo || 'LC116/NBS'}) · UF: ${a.uf}`,
    `- Alíquota municipal (ISS): ${a.municipal}%`,
    `- Alíquota nacional: ${a.nacional}% · estadual: ${a.estadual}% · importado: ${a.importado}%`,
    `- Descrição: ${a.descricao || '—'}`,
    `- Versão da tabela: ${a.versao || '—'} · vigência: ${a.vigencia_inicio || '—'} a ${a.vigencia_fim || '—'} · fonte: ${a.fonte}`,
    'USE ESTA REFERÊNCIA ASSIM:',
    '- Cite a alíquota municipal como referência com fonte e vigência (ex.: "referência IBPT: X% (tabela Y, vigente até Z)").',
    '- Se a NFS-e declarar alíquota de ISS diferente da referência, destaque a divergência como observação (possível benefício municipal, imunidade ou erro na nota). Não conclua erro automaticamente.',
    '- Mantenha a recomendação de confirmar a alíquota oficial na legislação municipal.',
    '- Use os percentuais para calcular a carga tributária aproximada (Lei 12.741/2012) quando relevante.',
  ].join('\n');
}
