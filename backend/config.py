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