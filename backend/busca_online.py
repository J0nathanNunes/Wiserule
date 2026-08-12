"""Módulo de busca online usando Tavily (com fallback Brave Search)."""

import requests
from tavily import TavilyClient
from config import settings
from models import ResultadoBusca


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

        return resultados

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

        return resultados

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
    """Formata os resultados de busca para incluir no prompt do LLM."""
    if not resultados:
        return "Nenhum resultado encontrado."

    partes = []
    for i, r in enumerate(resultados, 1):
        partes.append(f"Fonte {i}: {r.title}")
        partes.append(f"URL: {r.url}")
        if r.content:
            # Limita o conteúdo exibido
            conteudo = r.content[:500] + "..." if len(r.content) > 500 else r.content
            partes.append(f"Conteúdo: {conteudo}")
        partes.append("")

    return "\n".join(partes)