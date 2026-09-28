/**
 * Cruzamento OCR + Emissor (Geranet).
 *
 * Quando o OCR tem divergências ou campos ilegíveis, consulta as notas
 * emitidas pelo prestador na Geranet e tenta casar a nota analisada com
 * uma nota real do emissor. O casamento usa pontuação por múltiplas
 * evidências (número, chave, valor, data, tomador) — nunca um campo só.
 *
 * Regras de precedência:
 * - Match forte (chave exata OU número+valor+data): sugestões marcadas
 *   como "confirmado no emissor" e divergências correspondentes resolvidas.
 * - Match fraco (valor+data ou número+valor): sugestões apenas candidatas,
 *   exibidas no modal de revisão para decisão humana.
 * - Nenhum match: fluxo segue como hoje (só OCR + revisão).
 */

import { Env } from './config';
import { consultarNotas, extraerNotasMasRecientes } from './geranet';

export interface DadosParaCruzamento {
  cnpj: string;
  numero_nfse?: string;
  chave_nfse?: string;
  valor?: number;
  data_emissao?: string;
  cnpj_tomador?: string;
}

export interface SugestaoEmissor {
  campo: string;
  valor: string;
  origem: 'emissor';
  confianca: 'forte' | 'fraca';
}

export interface ResultadoCruzamento {
  status: 'match_forte' | 'match_fraco' | 'sem_match' | 'indisponivel';
  nota?: Record<string, unknown>;
  sugestoes: SugestaoEmissor[];
  divergencias_resolvidas: string[];
  divergencias_novas: string[];
  mensagem?: string;
}

/** Normaliza data para comparação (aceita dd/mm/aaaa e aaaa-mm-dd). */
function normalizarData(data: string): string {
  const d = (data || '').trim();
  const br = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return d;
}

function soDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

function valorNumerico(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pontua a semelhança entre os dados do OCR e uma nota do emissor.
 * Retorna { pontos, maximo, criterios } — casamento exige >= 60% e
 * pelo menos 2 critérios fortes, ou chave de acesso exata.
 */
function pontuarNota(ocr: DadosParaCruzamento, nota: Record<string, unknown>): {
  pontos: number; maximo: number; criterios: string[];
} {
  let pontos = 0;
  let maximo = 0;
  const criterios: string[] = [];

  // Chave de acesso: critério máximo (única por nota).
  const chaveNota = soDigitos(nota.chave);
  if (ocr.chave_nfse) {
    maximo += 4;
    if (chaveNota && chaveNota === soDigitos(ocr.chave_nfse)) {
      pontos += 4;
      criterios.push('chave');
    }
  }

  // Número da nota.
  const numeroNota = soDigitos(nota.numero_nota);
  if (ocr.numero_nfse) {
    maximo += 3;
    if (numeroNota && numeroNota === soDigitos(ocr.numero_nfse)) {
      pontos += 3;
      criterios.push('numero');
    }
  }

  // Valor bruto (tolerância de 1 centavo).
  if (ocr.valor && ocr.valor > 0) {
    maximo += 3;
    const valorNota = valorNumerico(nota.valor);
    if (valorNota > 0 && Math.abs(valorNota - ocr.valor) <= 0.01) {
      pontos += 3;
      criterios.push('valor');
    }
  }

  // Data de emissão (exata ou ±1 dia).
  if (ocr.data_emissao) {
    maximo += 2;
    const dataOcr = normalizarData(ocr.data_emissao);
    const dataNota = normalizarData(String(nota.data_emision || ''));
    if (dataOcr && dataNota && dataOcr === dataNota) {
      pontos += 2;
      criterios.push('data');
    } else if (dataOcr && dataNota) {
      const t1 = Date.parse(dataOcr);
      const t2 = Date.parse(dataNota);
      if (Number.isFinite(t1) && Number.isFinite(t2) && Math.abs(t1 - t2) <= 24 * 60 * 60 * 1000) {
        pontos += 1;
        criterios.push('data±1');
      }
    }
  }

  // CNPJ do tomador.
  if (ocr.cnpj_tomador) {
    maximo += 2;
    const tomadorNota = soDigitos(nota.tomador_cnpj);
    if (tomadorNota && tomadorNota === soDigitos(ocr.cnpj_tomador)) {
      pontos += 2;
      criterios.push('tomador');
    }
  }

  return { pontos, maximo, criterios };
}

/** Campos que o emissor pode sugerir quando o OCR não os leu bem. */
function montarSugestoes(
  ocr: DadosParaCruzamento,
  nota: Record<string, unknown>,
  confianca: 'forte' | 'fraca',
): SugestaoEmissor[] {
  const sugestoes: SugestaoEmissor[] = [];
  const add = (campo: string, valor: unknown, ocrAtual: unknown) => {
    const v = String(valor ?? '').trim();
    if (!v) return;
    // Só sugere se o OCR não leu o campo ou leu diferente (divergência explícita).
    if (String(ocrAtual ?? '').trim() && String(ocrAtual).trim() === v) return;
    sugestoes.push({ campo, valor: v, origem: 'emissor', confianca });
  };

  add('numero_nfse', nota.numero_nota, ocr.numero_nfse);
  add('valor', valorNumerico(nota.valor) ? valorNumerico(nota.valor).toFixed(2) : '', ocr.valor ? ocr.valor.toFixed(2) : '');
  add('valor_liquido', valorNumerico(nota.valor_liquido) ? valorNumerico(nota.valor_liquido).toFixed(2) : '', '');
  add('data_emissao', nota.data_emision, ocr.data_emissao);
  add('cnpj_tomador', nota.tomador_cnpj, ocr.cnpj_tomador);
  add('codigo_servico_nfse', nota.item_servicio, '');
  const issRetido = Number(nota.iss_retido) === 1;
  add('iss_retencao', issRetido ? 'Retido' : 'Não retido', '');
  return sugestoes;
}

/**
 * Executa o cruzamento. Nunca lança: falhas retornam status 'indisponivel'
 * e o fluxo de análise segue normalmente (resiliência).
 */
export async function cruzarComEmissor(
  ocr: DadosParaCruzamento,
  env: Env,
): Promise<ResultadoCruzamento> {
  const vazio: ResultadoCruzamento = {
    status: 'indisponivel',
    sugestoes: [],
    divergencias_resolvidas: [],
    divergencias_novas: [],
  };
  if (!ocr.cnpj || ocr.cnpj.length !== 14) return vazio;
  if (!env.GERANET_API_KEY) return vazio;

  try {
    const consulta = await consultarNotas(
      {
        cnpj: ocr.cnpj,
        inscripcion_municipal: '',
        razon_social: '',
        municipio: '',
      },
      env,
    );
    if (consulta.status !== 'sucesso' || !consulta.datos) {
      return { ...vazio, mensagem: consulta.error };
    }

    const notas = extraerNotasMasRecientes(consulta.datos, 30);
    if (notas.length === 0) return { ...vazio, mensagem: 'Nenhuma nota emitida encontrada no emissor.' };

    // Melhor nota por pontuação.
    let melhor: { nota: Record<string, unknown>; pontos: number; maximo: number; criterios: string[] } | null = null;
    for (const nota of notas) {
      const p = pontuarNota(ocr, nota);
      if (!melhor || p.pontos > melhor.pontos) melhor = { nota, ...p };
    }
    if (!melhor || melhor.pontos === 0) {
      return { ...vazio, mensagem: 'Nenhuma nota do emissor corresponde aos dados lidos.' };
    }

    const chaveExata = melhor.criterios.includes('chave');
    const fortes = melhor.criterios.filter((c) => c === 'numero' || c === 'valor' || c === 'chave').length;
    const proporcao = melhor.maximo > 0 ? melhor.pontos / melhor.maximo : 0;

    // Match forte: chave exata, ou número+valor (+data) com boa proporção.
    if (chaveExata || (fortes >= 2 && proporcao >= 0.6)) {
      const confianca: 'forte' | 'fraca' = chaveExata || fortes >= 3 ? 'forte' : 'fraca';
      const sugestoes = montarSugestoes(ocr, melhor.nota, confianca);
      return {
        status: 'match_forte',
        nota: melhor.nota,
        sugestoes,
        divergencias_resolvidas: confianca === 'forte'
          ? sugestoes.filter((s) => s.confianca === 'forte').map((s) => s.campo)
          : [],
        divergencias_novas: [],
        mensagem: `Nota casada com o emissor (${melhor.criterios.join(', ')}).`,
      };
    }

    // Match fraco: só valor+data ou número+valor, proporção razoável.
    if (proporcao >= 0.4 && fortes >= 1) {
      return {
        status: 'match_fraco',
        nota: melhor.nota,
        sugestoes: montarSugestoes(ocr, melhor.nota, 'fraca'),
        divergencias_resolvidas: [],
        divergencias_novas: [],
        mensagem: `Possível correspondência no emissor (${melhor.criterios.join(', ')}); confirme os campos.`,
      };
    }

    return { ...vazio, mensagem: 'Correspondência fraca demais com as notas do emissor.' };
  } catch (e) {
    return { ...vazio, mensagem: e instanceof Error ? e.message.slice(0, 200) : 'Erro no cruzamento com o emissor.' };
  }
}

/** Decide se vale a pena consultar o emissor (gatilho condicional). */
export function deveCruzarComEmissor(
  camposDivergentes: string[],
  confiancaOcr: number,
  dados: DadosParaCruzamento,
): boolean {
  // Sem CNPJ válido não há como consultar.
  if (!dados.cnpj || dados.cnpj.length !== 14) return false;
  // OCR com confiança alta e sem divergências: não gasta consulta.
  if (confiancaOcr >= 0.9 && camposDivergentes.length === 0) return false;
  // Divergências ou confiança média/baixa: consulta.
  return camposDivergentes.length > 0 || confiancaOcr < 0.9;
}
