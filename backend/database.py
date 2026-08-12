"""Módulo de banco de dados para histórico de análises via Supabase."""

import json
from datetime import datetime
from typing import Optional

from supabase import create_client, Client

from config import settings
from models import AnaliseHistorico


def get_client() -> Optional[Client]:
    """Obtém o cliente Supabase."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        return None
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def init_db():
    """
    Inicializa as tabelas no Supabase.
    As tabelas precisam ser criadas manualmente no SQL Editor do Supabase com:

    CREATE TABLE IF NOT EXISTS analises (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        cnpj TEXT,
        servico TEXT,
        valor REAL,
        cidade TEXT,
        uf TEXT DEFAULT 'MS',
        resultado_json TEXT,
        criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS api_logs (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        api_name TEXT,
        endpoint TEXT,
        payload TEXT,
        resposta_status INTEGER,
        criado_em TIMESTAMPTZ DEFAULT NOW()
    );
    """
    # Tabelas devem ser criadas via SQL Editor do Supabase
    pass


def salvar_analise(
    cnpj: str,
    servico: str,
    valor: float,
    cidade: str,
    uf: str,
    resultado: str,
) -> int:
    """
    Salva uma análise no Supabase.

    Returns:
        ID da análise criada.
    """
    client = get_client()
    if not client:
        return 0

    try:
        data = {
            "cnpj": cnpj,
            "servico": servico,
            "valor": valor,
            "cidade": cidade,
            "uf": uf,
            "resultado_json": resultado,
        }
        response = client.table(settings.SUPABASE_TABLE_ANALISES).insert(data).execute()

        if response.data and len(response.data) > 0:
            return response.data[0].get("id", 0)
        return 0

    except Exception:
        return 0


def listar_analises(limite: int = 20) -> list[AnaliseHistorico]:
    """Lista as análises mais recentes do Supabase."""
    client = get_client()
    if not client:
        return []

    try:
        response = (
            client.table(settings.SUPABASE_TABLE_ANALISES)
            .select("id, cnpj, servico, valor, cidade, uf, resultado_json, criado_em")
            .order("criado_em", desc=True)
            .limit(limite)
            .execute()
        )

        analises = []
        for row in response.data or []:
            criado_em = row.get("criado_em")
            if criado_em and isinstance(criado_em, str):
                try:
                    criado_em = datetime.fromisoformat(criado_em.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    criado_em = datetime.now()

            analises.append(AnaliseHistorico(
                id=row.get("id", 0),
                cnpj=row.get("cnpj", ""),
                servico=row.get("servico", ""),
                valor=row.get("valor", 0.0),
                cidade=row.get("cidade", ""),
                uf=row.get("uf", "MS"),
                resultado_json=row.get("resultado_json", ""),
                criado_em=criado_em,
            ))
        return analises

    except Exception:
        return []


def buscar_analise_por_id(analise_id: int) -> Optional[AnaliseHistorico]:
    """Busca uma análise pelo ID no Supabase."""
    client = get_client()
    if not client:
        return None

    try:
        response = (
            client.table(settings.SUPABASE_TABLE_ANALISES)
            .select("id, cnpj, servico, valor, cidade, uf, resultado_json, criado_em")
            .eq("id", analise_id)
            .limit(1)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            return None

        row = response.data[0]
        criado_em = row.get("criado_em")
        if criado_em and isinstance(criado_em, str):
            try:
                criado_em = datetime.fromisoformat(criado_em.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                criado_em = datetime.now()

        return AnaliseHistorico(
            id=row.get("id", 0),
            cnpj=row.get("cnpj", ""),
            servico=row.get("servico", ""),
            valor=row.get("valor", 0.0),
            cidade=row.get("cidade", ""),
            uf=row.get("uf", "MS"),
            resultado_json=row.get("resultado_json", ""),
            criado_em=criado_em,
        )

    except Exception:
        return None