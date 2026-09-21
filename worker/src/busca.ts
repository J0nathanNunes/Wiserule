/**
 * Búsqueda online usando Tavily.
 * Equivalente a backend/busca_online.py en Python.
 */

import { Env } from './config';

export interface ResultadoBusca {
  title: string;
  url: string;
  content: string;
}

const DOMINIOS_CONFIABLES = [
  'gov.br', 'receita.fazenda.gov.br', 'confaz.fazenda.gov.br', 'planalto.gov.br',
  'camara.leg.br', 'senado.leg.br', 'ibge.gov.br', 'concla.ibge.gov.br',
  'cff.svrs.rs.gov.br', 'portaltributario.com.br', 'guiatributario.net',
  'legisweb.com.br', 'lefisc.com.br', 'normas.leg.br', 'sifisco.com.br',
  'fiscosoft.com.br', 'iob.com.br', 'sage.com.br', 'crc.org.br', 'crcsp.org.br',
  'cfc.org.br', 'crcms.org.br', 'sescon.org.br', 'febracis.org.br',
  'contabeis.com.br', 'conjur.com.br', 'migalhas.com.br', 'jota.info',
  'consultorjuridico.com.br', 'valor.globo.com', 'economia.uol.com.br',
  'g1.globo.com/economia', 'infomoney.com.br', 'investnews.com.br',
  'campogrande.ms.gov.br', 'diariooficial.ms.gov.br', 'leismunicipais.com.br',
];

const DOMINIOS_BLOQUEADOS = [
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'linkedin.com',
  'tiktok.com', 'youtube.com', 'pinterest.com', 'blogspot.com', 'wordpress.com',
  'wixsite.com',
];

function dominioConfiable(url: string): boolean {
  if (!url) return false;
  const urlLower = url.toLowerCase();

  for (const bloqueado of DOMINIOS_BLOQUEADOS) {
    if (urlLower.includes(bloqueado)) return false;
  }

  for (const confiable of DOMINIOS_CONFIABLES) {
    if (urlLower.includes(confiable)) return true;
  }

  return urlLower.endsWith('.gov.br') || urlLower.endsWith('.org.br');
}

function filtrarResultadosConfiable(resultados: ResultadoBusca[]): ResultadoBusca[] {
  const confiables = resultados.filter((r) => dominioConfiable(r.url));
  const noConfiables = resultados.filter((r) => !dominioConfiable(r.url));

  const final = confiables.slice(0, 3);
  if (final.length < 3 && noConfiables.length > 0) {
    final.push(noConfiables[0]);
  }
  return final;
}

export async function buscarOnline(pergunta: string, env: Env): Promise<ResultadoBusca[]> {
  if (env.TAVILY_API_KEY) {
    return buscarTavily(pergunta, env.TAVILY_API_KEY);
  }
  return [];
}

async function buscarTavily(pergunta: string, apiKey: string): Promise<ResultadoBusca[]> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: pergunta,
        search_depth: 'advanced',
        max_results: 5,
        include_raw_content: true,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const resultados: ResultadoBusca[] = (data.results || []).map((item: Record<string, unknown>) => ({
      title: item.title || '',
      url: item.url || '',
      content: item.raw_content || item.content || '',
    }));

    return filtrarResultadosConfiable(resultados);
  } catch {
    return [];
  }
}

export function formatearBuscaParaLlm(resultados: ResultadoBusca[]): string {
  if (!resultados || resultados.length === 0) return 'Ningún resultado encontrado.';

  const partes: string[] = [];
  resultados.forEach((r, i) => {
    partes.push(`Fuente ${i + 1}: ${r.title}`);
    if (r.content) {
      const contenido = r.content.length > 500 ? r.content.slice(0, 500) + '...' : r.content;
      partes.push(`Contenido: ${contenido}`);
    }
    partes.push('');
  });

  return partes.join('\n');
}