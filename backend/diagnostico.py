"""Endpoint de diagnóstico para testar APIs individualmente."""

import logging
import requests
import traceback
from datetime import datetime
from fastapi import APIRouter
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/diagnostico")
async def diagnostico_apis():
    """
    Testa cada API individualmente e retorna o resultado detalhado.
    Útil para depurar erros 502 e outros problemas de conexão.
    """
    resultados = {
        "timestamp": datetime.now().isoformat(),
        "app": settings.APP_NAME,
        "apis": {},
        "resumo": {"total": 0, "online": 0, "offline": 0, "nao_configurada": 0},
    }

    # 1. Backend (ele mesmo)
    resultados["apis"]["backend"] = {
        "nome": "Backend Wiserule",
        "status": "online",
        "detalhe": "Servidor rodando",
    }
    resultados["resumo"]["total"] += 1
    resultados["resumo"]["online"] += 1

    # 2. OpenRouter
    resultados["resumo"]["total"] += 1
    if not settings.OPENROUTER_API_KEY:
        resultados["apis"]["openrouter"] = {
            "nome": "OpenRouter (LLM)",
            "status": "nao_configurada",
            "detalhe": "OPENROUTER_API_KEY não configurada no .env",
        }
        resultados["resumo"]["nao_configurada"] += 1
    else:
        try:
            r = requests.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
                timeout=10,
            )
            if r.status_code == 200:
                resultados["apis"]["openrouter"] = {
                    "nome": "OpenRouter (LLM)",
                    "status": "online",
                    "detalhe": f"Respondeu com HTTP {r.status_code}",
                }
                resultados["resumo"]["online"] += 1
            else:
                resultados["apis"]["openrouter"] = {
                    "nome": "OpenRouter (LLM)",
                    "status": "erro",
                    "detalhe": f"HTTP {r.status_code}: {r.text[:200]}",
                }
                resultados["resumo"]["offline"] += 1
        except Exception as e:
            resultados["apis"]["openrouter"] = {
                "nome": "OpenRouter (LLM)",
                "status": "offline",
                "detalhe": f"Erro ao conectar: {str(e)[:200]}",
            }
            resultados["resumo"]["offline"] += 1

    # 3. MinhaReceita
    resultados["resumo"]["total"] += 1
    try:
        r = requests.get("https://minhareceita.org/00000000000191", timeout=10)
        if r.status_code == 200:
            resultados["apis"]["minhareceita"] = {
                "nome": "MinhaReceita (CNPJ)",
                "status": "online",
                "detalhe": f"Respondeu com HTTP {r.status_code}",
            }
            resultados["resumo"]["online"] += 1
        else:
            resultados["apis"]["minhareceita"] = {
                "nome": "MinhaReceita (CNPJ)",
                "status": "erro",
                "detalhe": f"HTTP {r.status_code}",
            }
            resultados["resumo"]["offline"] += 1
    except Exception as e:
        resultados["apis"]["minhareceita"] = {
            "nome": "MinhaReceita (CNPJ)",
            "status": "offline",
            "detalhe": f"Erro ao conectar: {str(e)[:200]}",
        }
        resultados["resumo"]["offline"] += 1

    # 4. Supabase
    resultados["resumo"]["total"] += 1
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        resultados["apis"]["supabase"] = {
            "nome": "Supabase (Banco)",
            "status": "nao_configurada",
            "detalhe": "SUPABASE_URL ou SUPABASE_KEY não configurados",
        }
        resultados["resumo"]["nao_configurada"] += 1
    else:
        try:
            from supabase import create_client
            client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            r = client.table(settings.SUPABASE_TABLE_ANALISES).select("id").limit(1).execute()
            resultados["apis"]["supabase"] = {
                "nome": "Supabase (Banco)",
                "status": "online",
                "detalhe": "Conexão OK, tabela analises acessível",
            }
            resultados["resumo"]["online"] += 1
        except Exception as e:
            resultados["apis"]["supabase"] = {
                "nome": "Supabase (Banco)",
                "status": "offline",
                "detalhe": f"Erro: {str(e)[:200]}",
            }
            resultados["resumo"]["offline"] += 1

    # 5. Tavily
    resultados["resumo"]["total"] += 1
    if not settings.TAVILY_API_KEY:
        resultados["apis"]["tavily"] = {
            "nome": "Tavily (Busca)",
            "status": "nao_configurada",
            "detalhe": "TAVILY_API_KEY não configurada",
        }
        resultados["resumo"]["nao_configurada"] += 1
    else:
        try:
            from tavily import TavilyClient
            client = TavilyClient(api_key=settings.TAVILY_API_KEY)
            r = client.search(query="teste", max_results=1)
            resultados["apis"]["tavily"] = {
                "nome": "Tavily (Busca)",
                "status": "online",
                "detalhe": "Busca de teste OK",
            }
            resultados["resumo"]["online"] += 1
        except Exception as e:
            resultados["apis"]["tavily"] = {
                "nome": "Tavily (Busca)",
                "status": "offline",
                "detalhe": f"Erro: {str(e)[:200]}",
            }
            resultados["resumo"]["offline"] += 1

    # 6. Geranet
    resultados["resumo"]["total"] += 1
    if not settings.GERANET_API_KEY:
        resultados["apis"]["geranet"] = {
            "nome": "Geranet (NFSe)",
            "status": "nao_configurada",
            "detalhe": "GERANET_API_KEY não configurada",
        }
        resultados["resumo"]["nao_configurada"] += 1
    else:
        try:
            r = requests.get(
                "https://nfe.geranet.net/api/v1/",
                headers={"Authorization": f"Bearer {settings.GERANET_API_KEY}"},
                timeout=10,
            )
            if r.status_code < 500:
                resultados["apis"]["geranet"] = {
                    "nome": "Geranet (NFSe)",
                    "status": "online",
                    "detalhe": f"HTTP {r.status_code}",
                }
                resultados["resumo"]["online"] += 1
            else:
                resultados["apis"]["geranet"] = {
                    "nome": "Geranet (NFSe)",
                    "status": "erro",
                    "detalhe": f"HTTP {r.status_code}: {r.text[:200]}",
                }
                resultados["resumo"]["offline"] += 1
        except Exception as e:
            resultados["apis"]["geranet"] = {
                "nome": "Geranet (NFSe)",
                "status": "offline",
                "detalhe": f"Erro ao conectar: {str(e)[:200]}",
            }
            resultados["resumo"]["offline"] += 1

    # 7. Railway (self)
    resultados["resumo"]["total"] += 1
    try:
        r = requests.get("https://wiserule-production.up.railway.app/health", timeout=10)
        if r.status_code == 200:
            resultados["apis"]["railway"] = {
                "nome": "Railway (self)",
                "status": "online",
                "detalhe": "Endpoint /health respondeu OK",
            }
            resultados["resumo"]["online"] += 1
        else:
            resultados["apis"]["railway"] = {
                "nome": "Railway (self)",
                "status": "erro",
                "detalhe": f"HTTP {r.status_code}: {r.text[:200]}",
            }
            resultados["resumo"]["offline"] += 1
    except Exception as e:
        resultados["apis"]["railway"] = {
            "nome": "Railway (self)",
            "status": "offline",
            "detalhe": f"Erro ao conectar: {str(e)[:200]}",
        }
        resultados["resumo"]["offline"] += 1

    return resultados