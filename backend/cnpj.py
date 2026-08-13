"""Módulo de consulta CNPJ via MinhaReceita.org."""

import requests
from config import settings
from models import EmpresaData


def consultar_cnpj(cnpj: str) -> EmpresaData:
    """
    Consulta dados do CNPJ na API MinhaReceita.org.

    Args:
        cnpj: CNPJ com apenas números (14 dígitos).

    Returns:
        EmpresaData com dados preenchidos ou objeto vazio em caso de erro.
    """
    url = f"{settings.MINHA_RECEITA_URL}/{cnpj}"

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        if not data or not data.get("cnpj"):
            return EmpresaData(cnpj=cnpj)

        return EmpresaData(
            cnpj=cnpj,
            razao_social=data.get("razao_social", ""),
            nome_fantasia=data.get("nome_fantasia", ""),
            situacao=data.get("descricao_situacao_cadastral", ""),
            cnae=data.get("cnae_fiscal_descricao", ""),
            cnae_descricao=data.get("cnae_fiscal_descricao", ""),
            cnaes_secundarios=data.get("cnaes_secundarios", []),
            natureza_juridica=data.get("natureza_juridica", ""),
            porte=data.get("porte", ""),
            capital_social=data.get("capital_social", 0.0) or 0.0,
            data_inicio_atividade=data.get("data_inicio_atividade"),
            endereco=f"{data.get('logradouro', '')}, {data.get('numero', '')} - {data.get('bairro', '')}".strip(", "),
            municipio=data.get("municipio", ""),
            uf=data.get("uf", ""),
            cep=data.get("cep", ""),
            telefone=data.get("ddd_telefone_1", ""),
            email=data.get("email", ""),
            matriz_filial=data.get("descricao_identificador_matriz_filial", ""),
            simples_nacional=data.get("opcao_pelo_simples", False),
            mei=data.get("opcao_pelo_mei", False),
            data_opcao_simples=data.get("data_opcao_simples"),
            data_exclusao_simples=data.get("data_exclusao_simples"),
            qsa=data.get("qsa", []),
        )

    except requests.exceptions.Timeout:
        return EmpresaData(cnpj=cnpj, situacao="Erro: timeout na consulta")
    except requests.exceptions.RequestException as e:
        return EmpresaData(cnpj=cnpj, situacao=f"Erro: {str(e)}")


def consultar_cnpj_fallback(cnpj: str) -> EmpresaData:
    """
    Fallback usando BrasilAPI quando MinhaReceita estiver fora.

    Nota: BrasilAPI não retorna dados de Simples Nacional/MEI.
    """
    url = f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        return EmpresaData(
            cnpj=cnpj,
            razao_social=data.get("razao_social", ""),
            situacao=data.get("descricao_situacao_cadastral", ""),
            cnae=data.get("cnae_fiscal_descricao", ""),
            cnae_descricao=data.get("cnae_fiscal_descricao", ""),
            natureza_juridica=data.get("natureza_juridica", ""),
            porte=data.get("porte", ""),
            simples_nacional=False,
            mei=False,
        )

    except requests.exceptions.RequestException:
        return EmpresaData(cnpj=cnpj, situacao="Erro: falha nas duas APIs de CNPJ")