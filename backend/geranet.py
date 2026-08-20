"""Integração com a API Geranet para consulta e emissão de NFSe no padrão nacional."""

import base64
import logging
from typing import Optional
from pathlib import Path

import requests
from config import settings

logger = logging.getLogger(__name__)

GERANET_BASE_URL = "https://nfe.geranet.net/api/v1"


def arquivo_para_hexadecimal(caminho_arquivo: str) -> str:
    """
    Lê um certificado digital A1 (.pfx) e retorna seu conteúdo em hexadecimal.

    Args:
        caminho_arquivo: Caminho absoluto para o arquivo .pfx

    Returns:
        String hexadecimal do conteúdo do certificado
    """
    return Path(caminho_arquivo).read_bytes().hex()


def _obter_certificado_hex() -> str:
    """
    Obtém o certificado digital em hexadecimal automaticamente.

    Prioridade:
    1. GERANET_CERT_BASE64 (env) — útil no Railway
    2. GERANET_CERT_PATH (caminho do .pfx) — uso local

    Returns:
        String hexadecimal do certificado

    Raises:
        ValueError: Se nenhuma fonte estiver configurada
    """
    if settings.GERANET_CERT_BASE64:
        logger.info("Carregando certificado via GERANET_CERT_BASE64")
        return base64.b64decode(settings.GERANET_CERT_BASE64).hex()

    if settings.GERANET_CERT_PATH:
        caminho = settings.GERANET_CERT_PATH
        if not Path(caminho).exists():
            raise ValueError(f"Certificado não encontrado: {caminho}")
        logger.info("Carregando certificado de: %s", caminho)
        return Path(caminho).read_bytes().hex()

    raise ValueError(
        "Nenhum certificado configurado. Defina GERANET_CERT_BASE64 ou "
        "GERANET_CERT_PATH no .env"
    )


def _headers() -> dict:
    """Headers padrão para requisições à Geranet."""
    return {
        "Authorization": f"Bearer {settings.GERANET_API_KEY}",
        "Content-Type": "application/json",
    }


def consultar_notas(
    cnpj: str,
    inscricao_municipal: str,
    razao_social: str,
    municipio: str,
    certificado_digital: Optional[str] = None,
    senha_certificado: Optional[str] = None,
    ultimo_nsu: str = "0",
    chave_nfse: Optional[str] = None,
    timeout: int = 30,
) -> dict:
    """
    Consulta NFSe no portal nacional via Geranet.

    POST /api/v1/nfse/consultar-notas

    Args:
        cnpj: CNPJ do prestador (apenas números)
        inscricao_municipal: Inscrição municipal do prestador
        razao_social: Razão social do prestador
        municipio: Código IBGE do município (7 dígitos)
        certificado_digital: Conteúdo do certificado A1 em hexadecimal.
                            Se None, carrega automaticamente das configs.
        senha_certificado: Senha do certificado A1.
                          Se None, usa GERANET_CERT_PASSWORD do .env.
        ultimo_nsu: NSU para paginação (0 para começar)
        chave_nfse: Chave DF-e específica para consulta direta (opcional)
        timeout: Timeout em segundos

    Returns:
        Dict com a resposta completa da API

    Raises:
        ConnectionError: Se não conseguir conectar à API
        ValueError: Se a API retornar erro
    """
    if not settings.GERANET_API_KEY:
        raise ValueError("GERANET_API_KEY não configurada no .env")

    # Carrega certificado automaticamente se não fornecido
    hex_cert = certificado_digital if certificado_digital else _obter_certificado_hex()
    senha = senha_certificado if senha_certificado else settings.GERANET_CERT_PASSWORD

    if not senha:
        raise ValueError(
            "Senha do certificado não informada. Envie 'senha_certificado' ou "
            "configure GERANET_CERT_PASSWORD no .env"
        )

    payload = {
        "prestador": {
            "cnpj": cnpj,
            "inscricaoMunicipal": inscricao_municipal,
            "razaoSocial": razao_social,
            "municipio": municipio,
        },
        "certificadoDigital": hex_cert,
        "senhaCertificadoDigital": senha,
        "padraoNacional": "sim",
        "ultimoNsu": ultimo_nsu,
    }

    if chave_nfse:
        payload["chaveNfse"] = chave_nfse

    try:
        logger.info(
            "Consultando NFSe via Geranet: CNPJ=%s, Mun=%s, NSU=%s",
            cnpj, municipio, ultimo_nsu,
        )
        resp = requests.post(
            f"{GERANET_BASE_URL}/nfse/consultar-notas",
            headers=_headers(),
            json=payload,
            timeout=timeout,
        )
        logger.info("Geranet respondeu HTTP %s", resp.status_code)

        if resp.status_code == 422:
            erro = resp.json()
            detalhes = erro.get("detail", [])
            msgs = "; ".join(
                e.get("msg", str(e)) for e in (detalhes if isinstance(detalhes, list) else [detalhes])
            )
            raise ValueError(f"Dados inválidos: {msgs}")

        if resp.status_code == 401:
            raise ValueError("Credenciais Geranet inválidas (HTTP 401)")

        if resp.status_code == 402:
            raise ValueError("Saldo insuficiente na Geranet (HTTP 402)")

        if resp.status_code >= 400:
            raise ValueError(
                f"Geranet retornou HTTP {resp.status_code}: {resp.text[:300]}"
            )

        dados = resp.json()

        if dados.get("situacao") == "erro":
            raise ValueError(f"Geranet retornou erro: {dados.get('mensagem', 'sem mensagem')}")

        return dados

    except requests.Timeout:
        raise ConnectionError(f"Geranet não respondeu em {timeout}s (timeout)")
    except requests.ConnectionError as e:
        raise ConnectionError(f"Não foi possível conectar à Geranet: {str(e)[:200]}")
    except ValueError:
        raise
    except Exception as e:
        raise ConnectionError(f"Erro inesperado na consulta Geranet: {str(e)[:200]}")


def extrair_notas_mais_recentes(
    resposta: dict,
    limite: int = 10,
) -> list:
    """
    Extrai as notas mais recentes da resposta da Geranet.

    Args:
        resposta: Resposta completa da consultar_notas()
        limite: Número máximo de notas para retornar

    Returns:
        Lista de registros simplificados com dados principais
    """
    registros = resposta.get("registros", [])
    if not registros:
        return []

    # Ordena por data decrescente
    registros.sort(key=lambda r: r.get("data", ""), reverse=True)

    simplificadas = []
    for reg in registros[:limite]:
        dados_nota = reg.get("dadosNota", {})
        servico = dados_nota.get("servico", {})
        valores = servico.get("valores", {})
        tomador = dados_nota.get("tomador", {})

        simplificadas.append({
            "nsu": reg.get("nsu"),
            "numero_nota": reg.get("numeroNota"),
            "chave": reg.get("chaveDfe"),
            "codigo_verificacao": reg.get("codigoVerificacao"),
            "situacao": reg.get("descricaoSituacao"),
            "data_emissao": dados_nota.get("identificacao", {}).get("dataEmissao", reg.get("data")),
            "valor": valores.get("valorServicos", 0),
            "valor_liquido": valores.get("valorLiquidoNfse", 0),
            "tomador_nome": tomador.get("razaoSocial", ""),
            "tomador_cnpj": tomador.get("cpfCnpj", ""),
            "item_servico": servico.get("itemListaServico", ""),
            "discriminacao": servico.get("discriminacao", ""),
            "iss_retido": servico.get("tributacao", {}).get("issRetido", 0),
            "link": reg.get("link", ""),
            "tem_xml": bool(reg.get("xml")),
        })

    return simplificadas


def resumir_consulta(resposta: dict) -> dict:
    """
    Gera um resumo amigável da consulta para exibição ou contexto LLM.

    Args:
        resposta: Resposta completa da consultar_notas()

    Returns:
        Dict com resumo
    """
    registros = resposta.get("registros", [])
    notas = extrair_notas_mais_recentes(resposta, limite=20)

    total_valor = sum(n.get("valor", 0) or 0 for n in notas)
    notas_ano = [
        n for n in notas
        if n.get("data_emissao") and n["data_emissao"][:4] == "2026"
    ]
    total_ano = sum(n.get("valor", 0) or 0 for n in notas_ano)
    retidos = [n for n in notas if n.get("iss_retido") == 1]

    return {
        "quantidade_total": resposta.get("quantidadeDocumentos", len(registros)),
        "quantidade_retornada": len(registros),
        "ultimo_nsu": resposta.get("ultimoNsu"),
        "proximo_nsu_sugerido": resposta.get("proximoNsuSugerido"),
        "tem_mais": resposta.get("temMaisRegistrosProvavelmente") == "sim",
        "notas_analisadas": len(notas),
        "total_bruto": total_valor,
        "total_2026": total_ano,
        "notas_com_iss_retido": len(retidos),
        "primeira_nota": notas[0] if notas else None,
        "ultima_nota": notas[-1] if notas else None,
    }