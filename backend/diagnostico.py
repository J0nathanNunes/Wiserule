"""Endpoint de diagnóstico para testar APIs individualmente."""

import logging
import requests
import traceback
import time
import sys
from datetime import datetime
from fastapi import APIRouter
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _test_api(nome: str, chave: str | None, fazer_request, timeout: int = 10) -> dict:
    """Helper para testar uma API e retornar resultado padronizado com latência."""
    resultado = {
        "nome": nome,
        "status": "nao_configurada",
        "detalhe": "",
        "latencia_ms": None,
    }
    if not chave:
        resultado["detalhe"] = f"{nome.split('(')[0].strip()} não configurada no .env"
        return resultado

    inicio = time.monotonic()
    try:
        resp = fazer_request()
        latencia = round((time.monotonic() - inicio) * 1000)
        resultado["latencia_ms"] = latencia

        # Verifica se houve exceção (a callback pode levantar)
        if isinstance(resp, tuple):
            status_code, body = resp
        else:
            status_code = resp.status_code
            body = resp.text[:200]

        if status_code and status_code < 500:
            resultado["status"] = "online"
            resultado["detalhe"] = f"HTTP {status_code} · {latencia}ms"
        else:
            resultado["status"] = "erro"
            resultado["detalhe"] = f"HTTP {status_code}: {body}"
    except Exception as e:
        latencia = round((time.monotonic() - inicio) * 1000)
        resultado["latencia_ms"] = latencia
        resultado["status"] = "offline"
        resultado["detalhe"] = f"Falha após {latencia}ms: {str(e)[:200]}"

    return resultado


@router.get("/diagnostico")
async def diagnostico_apis():
    """
    Testa cada API individualmente e retorna resultado detalhado com latência.
    """
    resultados = {
        "timestamp": datetime.now().isoformat(),
        "app": settings.APP_NAME,
        "debug": settings.DEBUG,
        "python": sys.version.split()[0],
        "apis": {},
        "resumo": {"total": 0, "online": 0, "offline": 0, "erro": 0, "nao_configurada": 0},
    }

    apis = resultados["apis"]
    resumo = resultados["resumo"]

    # 1. Backend (ele mesmo)
    apis["backend"] = {
        "nome": "Backend Wiserule",
        "status": "online",
        "detalhe": "Servidor rodando",
        "latencia_ms": 0,
    }
    resumo["total"] += 1
    resumo["online"] += 1

    # 2. OpenRouter
    resumo["total"] += 1
    apis["openrouter"] = _test_api(
        "OpenRouter (LLM)",
        settings.OPENROUTER_API_KEY,
        lambda: requests.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            timeout=10,
        ),
    )
    _add_status(resumo, apis["openrouter"]["status"])

    # 3. MinhaReceita
    resumo["total"] += 1
    apis["minhareceita"] = _test_api(
        "MinhaReceita (CNPJ)",
        "configurada",  # API pública
        lambda: requests.get("https://minhareceita.org/00000000000191", timeout=10),
    )
    _add_status(resumo, apis["minhareceita"]["status"])

    # 4. Supabase
    resumo["total"] += 1
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        apis["supabase"] = {
            "nome": "Supabase (Banco)",
            "status": "nao_configurada",
            "detalhe": "SUPABASE_URL ou SUPABASE_KEY não configurados",
            "latencia_ms": None,
        }
        resumo["nao_configurada"] += 1
    else:
        inicio = time.monotonic()
        try:
            from supabase import create_client
            client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            client.table(settings.SUPABASE_TABLE_ANALISES).select("id").limit(1).execute()
            latencia = round((time.monotonic() - inicio) * 1000)
            apis["supabase"] = {
                "nome": "Supabase (Banco)",
                "status": "online",
                "detalhe": f"Conexão OK · {latencia}ms",
                "latencia_ms": latencia,
            }
            resumo["online"] += 1
        except Exception as e:
            latencia = round((time.monotonic() - inicio) * 1000)
            apis["supabase"] = {
                "nome": "Supabase (Banco)",
                "status": "offline",
                "detalhe": f"Falha após {latencia}ms: {str(e)[:200]}",
                "latencia_ms": latencia,
            }
            resumo["offline"] += 1

    # 5. Tavily
    resumo["total"] += 1
    if not settings.TAVILY_API_KEY:
        apis["tavily"] = {
            "nome": "Tavily (Busca)",
            "status": "nao_configurada",
            "detalhe": "TAVILY_API_KEY não configurada",
            "latencia_ms": None,
        }
        resumo["nao_configurada"] += 1
    else:
        inicio = time.monotonic()
        try:
            from tavily import TavilyClient
            client = TavilyClient(api_key=settings.TAVILY_API_KEY)
            client.search(query="teste", max_results=1)
            latencia = round((time.monotonic() - inicio) * 1000)
            apis["tavily"] = {
                "nome": "Tavily (Busca)",
                "status": "online",
                "detalhe": f"Busca de teste OK · {latencia}ms",
                "latencia_ms": latencia,
            }
            resumo["online"] += 1
        except Exception as e:
            latencia = round((time.monotonic() - inicio) * 1000)
            apis["tavily"] = {
                "nome": "Tavily (Busca)",
                "status": "offline",
                "detalhe": f"Falha após {latencia}ms: {str(e)[:200]}",
                "latencia_ms": latencia,
            }
            resumo["offline"] += 1

    # 6. Geranet
    resumo["total"] += 1
    apis["geranet"] = _test_api(
        "Geranet (NFSe)",
        settings.GERANET_API_KEY,
        lambda: requests.get(
            "https://nfe.geranet.net/api/v1/",
            headers={"Authorization": f"Bearer {settings.GERANET_API_KEY}"},
            timeout=10,
        ),
    )
    _add_status(resumo, apis["geranet"]["status"])

    # 7. Railway (self)
    resumo["total"] += 1
    apis["railway"] = _test_api(
        "Railway (self)",
        "configurada",
        lambda: requests.get("https://wiserule-production.up.railway.app/health", timeout=10),
    )
    _add_status(resumo, apis["railway"]["status"])

    # Adiciona metadados de uptime
    resultados["resumo"] = resumo
    return resultados


def _add_status(resumo: dict, status: str):
    if status == "online":
        resumo["online"] += 1
    elif status in ("offline", "erro"):
        resumo["offline"] += 1
    elif status == "nao_configurada":
        resumo["nao_configurada"] += 1