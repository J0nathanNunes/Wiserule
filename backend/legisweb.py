"""Módulo de correlação de serviços via LegisWeb API."""

import requests
from config import settings
from models import CorrelacaoServico


def correlacionar_servico(
    descricao: str,
    cidade: str = "",
    uf: str = "MS"
) -> CorrelacaoServico:
    """
    Correlaciona um serviço usando a API LegisWeb.

    Args:
        descricao: Descrição do serviço (ex.: "desenvolvimento de software").
        cidade: Nome do município (opcional, para detalhes municipais).
        uf: Unidade federativa (padrão MS).

    Returns:
        CorrelacaoServico com dados preenchidos.
    """
    if not settings.LEGISWEB_TOKEN or not settings.LEGISWEB_CODIGO_CLIENTE:
        return CorrelacaoServico()

    params = {
        "t": settings.LEGISWEB_TOKEN,
        "c": settings.LEGISWEB_CODIGO_CLIENTE,
        "tipo-busca": 4,  # busca por descrição
        "descricao": descricao,
    }

    if cidade:
        params["cidade"] = cidade
    if uf:
        params["uf"] = uf

    try:
        response = requests.get(
            settings.LEGISWEB_BASE_URL,
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

        if not data:
            return CorrelacaoServico()

        correlacao = CorrelacaoServico()

        # Extrai dados da resposta (formato pode variar conforme a API)
        if "atividade_servico" in data:
            correlacao.lc116_codigo = data["atividade_servico"].get("codigo", "")
            correlacao.lc116_descricao = data["atividade_servico"].get("descricao", "")

        if "correlacoes" in data:
            correlacao.nbs = data["correlacoes"].get("nbs", [])
            correlacao.cnae = data["correlacoes"].get("cnae", [])
            correlacao.csn = data["correlacoes"].get("csn", [])

        if "detalhes_municipais" in data:
            correlacao.detalhes_municipais = data["detalhes_municipais"]

        return correlacao

    except requests.exceptions.RequestException:
        return CorrelacaoServico()


def formatar_correlacao_para_llm(correlacao: CorrelacaoServico) -> str:
    """Formata os dados de correlação para incluir no prompt do LLM."""
    partes = []

    if correlacao.lc116_codigo:
        partes.append(f"LC 116/2003: {correlacao.lc116_codigo} - {correlacao.lc116_descricao}")

    if correlacao.nbs:
        nbs_str = ", ".join([str(n.get("codigo", n)) for n in correlacao.nbs])
        partes.append(f"NBS: {nbs_str}")

    if correlacao.cnae:
        cnae_str = ", ".join([str(c.get("codigo", c)) for c in correlacao.cnae])
        partes.append(f"CNAE: {cnae_str}")

    if correlacao.csn:
        csn_str = ", ".join([str(c.get("codigo", c)) for c in correlacao.csn])
        partes.append(f"CSN: {csn_str}")

    if correlacao.detalhes_municipais:
        for det in correlacao.detalhes_municipais:
            cidade = det.get("cidade", "Município")
            base_legal = det.get("desc_base_legal", "Não informada")
            descricao = det.get("descricao", "")
            partes.append(f"{cidade}: {base_legal} - {descricao}")

    return "\n".join(partes) if partes else "Correlação não encontrada."