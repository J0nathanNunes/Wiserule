"""Módulo de busca online usando Tavily (com fallback Brave Search)."""

import re
import requests
from tavily import TavilyClient
from config import settings
from models import ResultadoBusca

# Domínios confiáveis para consultas contábeis e tributárias
DOMINIOS_CONFIAVEIS = [
    # Oficiais governamentais
    "gov.br",
    "receita.fazenda.gov.br",
    "confaz.fazenda.gov.br",
    "planalto.gov.br",
    "camara.leg.br",
    "senado.leg.br",
    "ibge.gov.br",
    "concla.ibge.gov.br",
    "cff.svrs.rs.gov.br",
    # Portais tributários
    "portaltributario.com.br",
    "guiatributario.net",
    "legisweb.com.br",
    "lefisc.com.br",
    "normas.leg.br",
    "sifisco.com.br",
    "fiscosoft.com.br",
    "iob.com.br",
    "sage.com.br",
    # Conselhos e associações
    "crc.org.br",
    "crcsp.org.br",
    "cfc.org.br",
    "crcms.org.br",
    "sescon.org.br",
    "febracis.org.br",
    # Fóruns contábeis confiáveis
    "contabeis.com.br",
    "conjur.com.br",
    "migalhas.com.br",
    "jota.info",
    "consultorjuridico.com.br",
    # Notícias econômicas (relevantes)
    "valor.globo.com",
    "economia.uol.com.br",
    "g1.globo.com/economia",
    "infomoney.com.br",
    "investnews.com.br",
    # Municipais (leis)
    "campogrande.ms.gov.br",
    "diariooficial.ms.gov.br",
    "leismunicipais.com.br",
]

DOMINIOS_BLOQUEADOS = [
    "instagram.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "tiktok.com",
    "youtube.com",
    "pinterest.com",
    "blogspot.com",
    "wordpress.com",
    "wixsite.com",
]


def _dominio_confiavel(url: str) -> bool:
    """Verifica se a URL é de um domínio confiável."""
    if not url:
        return False
    url_lower = url.lower()

    # Bloqueia domínios não confiáveis primeiro
    for bloqueado in DOMINIOS_BLOQUEADOS:
        if bloqueado in url_lower:
            return False

    # Verifica se é confiável
    for confiavel in DOMINIOS_CONFIAVEIS:
        if confiavel in url_lower:
            return True

    # Se não está em nenhuma lista, permite com ressalva (o LLM vai filtrar)
    # Mas dá preferência para .gov.br, .org.br, .com.br relevantes
    if url_lower.endswith(".gov.br") or url_lower.endswith(".org.br"):
        return True

    return False


def _filtrar_resultados_confiaveis(resultados: list[ResultadoBusca]) -> list[ResultadoBusca]:
    """Filtra e prioriza resultados de fontes confiáveis."""
    confiaveis = []
    nao_confiaveis = []

    for r in resultados:
        if _dominio_confiavel(r.url):
            confiaveis.append(r)
        else:
            nao_confiaveis.append(r)

    # Retorna até 3 confiáveis + 1 não confiável (se houver)
    final = confiaveis[:3]
    if len(final) < 3 and nao_confiaveis:
        final.append(nao_confiaveis[0])

    return final


def buscar_online(pergunta: str) -> list[ResultadoBusca]:
    """
    Realiza busca online sobre o tema usando Tavily.

    Args:
        pergunta: Texto da pergunta/consulta.

    Returns:
        Lista de ResultadoBusca com até MAX_RESULTADOS_BUSCA itens.
    """
    if settings.TAVILY_API_KEY:
        return _buscar_tavily(pergunta)
    elif settings.BRAVE_API_KEY:
        return _buscar_brave(pergunta)
    return []


def _buscar_tavily(pergunta: str) -> list[ResultadoBusca]:
    """Busca usando Tavily (principal)."""
    try:
        client = TavilyClient(api_key=settings.TAVILY_API_KEY)
        response = client.search(
            query=pergunta,
            search_depth="advanced",
            max_results=settings.MAX_RESULTADOS_BUSCA,
            include_raw_content=True,
        )

        resultados = []
        for item in response.get("results", []):
            resultados.append(ResultadoBusca(
                title=item.get("title", ""),
                url=item.get("url", ""),
                content=item.get("raw_content") or item.get("content", ""),
            ))

        return _filtrar_resultados_confiaveis(resultados)

    except Exception:
        # Fallback para Brave se Tavily falhar
        if settings.BRAVE_API_KEY:
            return _buscar_brave(pergunta)
        return []


def _buscar_brave(pergunta: str) -> list[ResultadoBusca]:
    """Fallback de busca usando Brave Search API."""
    try:
        url = "https://api.search.brave.com/res/v1/web/search"
        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": settings.BRAVE_API_KEY,
        }
        params = {
            "q": pergunta,
            "count": settings.MAX_RESULTADOS_BUSCA,
        }

        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        resultados = []
        for item in data.get("web", {}).get("results", []):
            # Brave retorna apenas snippets, tenta extrair conteúdo completo
            conteudo = _extrair_conteudo_pagina(item.get("url", ""))
            resultados.append(ResultadoBusca(
                title=item.get("title", ""),
                url=item.get("url", ""),
                content=conteudo or item.get("description", ""),
            ))

        return _filtrar_resultados_confiaveis(resultados)

    except requests.exceptions.RequestException:
        return []


def _extrair_conteudo_pagina(url: str) -> str:
    """Tenta extrair o conteúdo textual de uma página."""
    try:
        from bs4 import BeautifulSoup
        response = requests.get(url, timeout=5, headers={
            "User-Agent": "Mozilla/5.0 (compatible; AgenteNFSe/1.0)"
        })
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Remove scripts, styles, navs
        for tag in soup(["script", "style", "nav", "header", "footer"]):
            tag.decompose()

        texto = soup.get_text(separator=" ", strip=True)
        # Limita a 2000 caracteres
        return texto[:2000]

    except Exception:
        return ""


def formatar_busca_para_llm(resultados: list[ResultadoBusca]) -> str:
    """Formata os resultados de busca para incluir no prompt do LLM (sem URLs)."""
    if not resultados:
        return "Nenhum resultado encontrado."

    partes = []
    for i, r in enumerate(resultados, 1):
        partes.append(f"Fonte {i}: {r.title}")
        if r.content:
            conteudo = r.content[:500] + "..." if len(r.content) > 500 else r.content
            partes.append(f"Conteúdo: {conteudo}")
        partes.append("")

    return "\n".join(partes)