"""Módulo de integração com a API gratuita de Tabelas IBS e CBS.

Fonte: Portal da Conformidade Fácil (CFF)
Endpoint: https://cff.svrs.rs.gov.br/api/v1/consultas/classTrib
Autenticação: Certificado digital ICP-Brasil (fase atual)
"""

import logging
import requests
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# URLs oficiais
CFF_BASE_URL = "https://cff.svrs.rs.gov.br/api/v1"
CFF_CLASSTRIB_ENDPOINT = f"{CFF_BASE_URL}/consultas/classTrib"


def consultar_class_trib(cst: str = "", nome_cst: str = "", usar_certificado: bool = False) -> dict:
    """
    Consulta a tabela CST/cClassTrib na API do Portal da Conformidade Fácil.

    Args:
        cst: Código CST (opcional, filtra por código).
        nome_cst: Nome do CST (opcional, filtra por nome).
        usar_certificado: Se True, tenta usar certificado digital ICP-Brasil
                          (requer certificado instalado; por padrão tenta sem).

    Returns:
        Dicionário com os dados retornados pela API.
    """
    try:
        params = {}
        if cst:
            params["cst"] = cst
        if nome_cst:
            params["NomeCst"] = nome_cst

        # Nota: A API exige autenticação mútua com certificado digital ICP-Brasil.
        # Sem o certificado configurado no ambiente, a chamada pode falhar com 401/403.
        # Por isso tratamos o erro com fallback informativo.

        if usar_certificado:
            # Exemplo de como usar certificado (requer arquivos .pem/.key no servidor)
            cert = (getattr(settings, "CFF_CERT_FILE", ""), getattr(settings, "CFF_KEY_FILE", ""))
            if all(cert):
                response = requests.get(
                    CFF_CLASSTRIB_ENDPOINT,
                    params=params,
                    cert=cert,
                    timeout=15,
                )
                response.raise_for_status()
                return response.json()

        # Tentativa sem certificado (algumas rotas podem ser públicas)
        response = requests.get(CFF_CLASSTRIB_ENDPOINT, params=params, timeout=15)
        response.raise_for_status()
        return response.json()

    except requests.exceptions.RequestException as e:
        logger.warning(f"[IBS/CBS] API indisponível ou requer certificado: {e}")
        return {
            "status": "indisponivel",
            "detalhe": (
                "API do Portal da Conformidade Fácil requer certificado digital ICP-Brasil. "
                "Tabelas IBS/CBS não carregadas automaticamente."
            ),
        }


def formatar_info_ibs_cbs(dados: dict) -> str:
    """
    Formata a resposta da API para incluir no prompt do LLM.

    Args:
        dados: Resposta da API classTrib.

    Returns:
        Texto formatado para o contexto do LLM.
    """
    if not dados or dados.get("status") == "indisponivel":
        return (
            "Dados de IBS/CBS (reforma tributária) não carregados automaticamente. "
            "Observações gerais para orientação:\n"
            "- IBS (Imposto sobre Bens e Serviços): criado pela EC 132/2023, "
            "substituirá ICMS e ISS a partir de 2026-2033 (transição).\n"
            "- CBS (Contribuição sobre Bens e Serviços): substituirá PIS e COFINS.\n"
            "- cClassTrib: código de classificação tributária usado nas NF-e/NFSe "
            "para identificação da legislação IBS/CBS aplicável.\n"
            "- CST: Código de Situação Tributária.\n"
            "- Em 2026, as notas fiscais passam a exigir destaque de IBS e CBS "
            "(0,1% e 0,9% nas fases iniciais de teste)."
        )

    linhas = ["Dados da API IBS/CBS (Portal da Conformidade Fácil):"]
    if isinstance(dados, list):
        for item in dados[:10]:
            if isinstance(item, dict):
                linhas.append(
                    f"- CST: {item.get('cst', '')} | Nome: {item.get('nomeCst', '')} "
                    f"| cClassTrib: {item.get('cClassTrib', item.get('classtrib', ''))}"
                )
    elif isinstance(dados, dict):
        for chave, valor in dados.items():
            linhas.append(f"- {chave}: {valor}")

    return "\n".join(linhas) if len(linhas) > 1 else "Dados IBS/CBS: indisponíveis."