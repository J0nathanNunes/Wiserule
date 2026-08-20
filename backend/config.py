"""Configurações centralizadas do Wiserule."""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Wiserule")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # OpenRouter
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # LegisWeb
    LEGISWEB_TOKEN: str = os.getenv("LEGISWEB_TOKEN", "")
    LEGISWEB_CODIGO_CLIENTE: str = os.getenv("LEGISWEB_CODIGO_CLIENTE", "")
    LEGISWEB_BASE_URL: str = "https://www.legisweb.com.br/api/correlacoes_servicos/"

    # Tavily
    TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")

    # Brave Search (fallback)
    BRAVE_API_KEY: str = os.getenv("BRAVE_API_KEY", "")

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_TABLE_ANALISES: str = os.getenv("SUPABASE_TABLE_ANALISES", "analises")
    SUPABASE_TABLE_CORRELACAO: str = os.getenv("SUPABASE_TABLE_CORRELACAO", "v_correlacao_completa")

    # Geranet (API NFSe)
    GERANET_API_KEY: str = os.getenv("GERANET_API_KEY", "")

    # Certificado digital A1 (.pfx) para Geranet
    #
    # Você pode configurar de 3 formas:
    #
    # 1) Múltiplos certificados LOCAIS (recomendado)
    #    Coloque os .pfx na pasta backend/certificados/
    #    Nomeie como {ANO}-{CNPJ}.pfx (ex: 2026-07121135000316.pfx)
    #    A senha deve ser a mesma para todos
    #
    # 2) Múltiplos certificados no RAILWAY
    #    GERANET_CERTS_JSON = {"07121135000316": "base64...", "60833910001906": "base64..."}
    #
    # 3) Único certificado (legado)
    #    GERANET_CERT_BASE64 ou GERANET_CERT_PATH + GERANET_CERT_PASSWORD
    #
    GERANET_CERTS_DIR: str = os.getenv("GERANET_CERTS_DIR", "certificados")
    GERANET_CERTS_JSON: str = os.getenv("GERANET_CERTS_JSON", "")
    GERANET_CERT_PATH: str = os.getenv("GERANET_CERT_PATH", "")
    GERANET_CERT_BASE64: str = os.getenv("GERANET_CERT_BASE64", "")
    GERANET_CERT_PASSWORD: str = os.getenv("GERANET_CERT_PASSWORD", "")

    # MinhaReceita
    MINHA_RECEITA_URL: str = "https://minhareceita.org"

    # Modelos LLM
    MODELO_OCR: str = "openai/gpt-4o-mini"
    MODELO_ANALISE: str = "openai/gpt-4o-mini"
    MODELO_VISAO: str = "openai/gpt-4o-mini"

    # Limites
    MAX_FILE_SIZE_MB: int = 5
    MAX_RESULTADOS_BUSCA: int = 5


settings = Settings()