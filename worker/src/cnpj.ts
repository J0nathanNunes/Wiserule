/**
 * Consulta de CNPJ via MinhaReceita.org com fallback BrasilAPI.
 * Equivalente a backend/cnpj.py en Python.
 */

export interface EmpresaData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao: string;
  cnae: string;
  cnae_codigo: string;
  cnae_descricao: string;
  cnaes_secundarios: Array<{ codigo: string; descricao: string }>;
  natureza_juridica: string;
  porte: string;
  capital_social: number;
  data_inicio_atividade: string | null;
  endereco: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string | null;
  email: string | null;
  matriz_filial: string;
  simples_nacional: boolean;
  mei: boolean;
  data_opcao_simples: string | null;
  data_exclusao_simples: string | null;
  data_opcao_mei: string | null;
  data_exclusao_mei: string | null;
  qsa: unknown[];
}

export function emptyEmpresa(cnpj: string, situacao = ''): EmpresaData {
  return {
    cnpj,
    razao_social: '',
    nome_fantasia: '',
    situacao,
    cnae: '',
    cnae_codigo: '',
    cnae_descricao: '',
    cnaes_secundarios: [],
    natureza_juridica: '',
    porte: '',
    capital_social: 0,
    data_inicio_atividade: null,
    endereco: '',
    municipio: '',
    uf: '',
    cep: '',
    telefone: null,
    email: null,
    matriz_filial: '',
    simples_nacional: false,
    mei: false,
    data_opcao_simples: null,
    data_exclusao_simples: null,
    data_opcao_mei: null,
    data_exclusao_mei: null,
    qsa: [],
  };
}

export async function consultarCnpj(cnpj: string, minhaReceitaUrl: string): Promise<EmpresaData> {
  const url = `${minhaReceitaUrl}/${cnpj}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Wiserule/1.0' } });
    if (!res.ok) return emptyEmpresa(cnpj, `Erro: HTTP ${res.status}`);

    const data = await res.json() as Record<string, any>;
    if (!data || !data.cnpj) return emptyEmpresa(cnpj);

    return {
      cnpj,
      razao_social: data.razao_social || '',
      nome_fantasia: data.nome_fantasia || '',
      situacao: data.descricao_situacao_cadastral || '',
      cnae: data.cnae_fiscal_descricao || '',
      cnae_codigo: String(data.cnae_fiscal || ''),
      cnae_descricao: data.cnae_fiscal_descricao || '',
      cnaes_secundarios: data.cnaes_secundarios || [],
      natureza_juridica: data.natureza_juridica || '',
      porte: data.porte || '',
      capital_social: data.capital_social || 0,
      data_inicio_atividade: data.data_inicio_atividade || null,
      endereco: `${data.logradouro || ''}, ${data.numero || ''} - ${data.bairro || ''}`.trim().replace(/,\s*-?\s*$/, ''),
      municipio: data.municipio || '',
      uf: data.uf || '',
      cep: data.cep || '',
      telefone: data.ddd_telefono_1 || data.ddd_telefone_1 || null,
      email: data.email || null,
      matriz_filial: data.descricao_identificador_matriz_filial || '',
      simples_nacional: data.opcao_pelo_simples === true,
      mei: data.opcao_pelo_mei === true,
      data_opcao_simples: data.data_opcao_pelo_simples || null,
      data_exclusao_simples: data.data_exclusao_do_simples || null,
      data_opcao_mei: data.data_opcao_pelo_mei || null,
      data_exclusao_mei: data.data_exclusao_do_mei || null,
      qsa: data.qsa || [],
    };
  } catch (e) {
    return emptyEmpresa(cnpj, `Erro: ${e instanceof Error ? e.message : 'desconocido'}`);
  }
}

export async function consultarCnpjFallback(cnpj: string): Promise<EmpresaData> {
  const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return emptyEmpresa(cnpj, 'Erro: falha en las dos APIs de CNPJ');

    const data = await res.json() as Record<string, any>;
    return {
      ...emptyEmpresa(cnpj),
      razao_social: data.razao_social || '',
      situacao: data.descricao_situacao_cadastral || '',
      cnae: data.cnae_fiscal_descricao || '',
      cnae_codigo: String(data.cnae_fiscal || ''),
      cnae_descricao: data.cnae_fiscal_descricao || '',
      natureza_juridica: data.natureza_juridica || '',
      porte: data.porte || '',
      simples_nacional: false,
      mei: false,
    };
  } catch {
    return emptyEmpresa(cnpj, 'Erro: falha en las dos APIs de CNPJ');
  }
}