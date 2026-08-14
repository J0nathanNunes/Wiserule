"""Script para popular as tabelas de correlação no Supabase.

Execute com: python -m backend.popular_correlacao

Requisitos:
- SUPABASE_URL e SUPABASE_KEY configurados no .env
- Tabelas criadas via supabase_correlacao.sql
"""

import logging
from supabase import create_client
from config import settings
from correlacao_interna import CNAE_LC116_MAP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def popular():
    """Popula as tabelas de correlação no Supabase com os dados do CNAE_LC116_MAP."""
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    
    if not client:
        logger.error("Supabase não configurado. Verifique SUPABASE_URL e SUPABASE_KEY.")
        return

    inseridos = 0
    erros = 0

    for codigo, item in CNAE_LC116_MAP.items():
        try:
            # Verifica se o item LC 116 já existe, senão insere
            lc116_result = client.table("lc116_itens").select("id").eq("codigo", item["lc116"]).execute()
            
            if not lc116_result.data:
                client.table("lc116_itens").insert({
                    "codigo": item["lc116"],
                    "descricao": item["descricao"],
                }).execute()

            # Verifica se a NBS já existe, senão insere
            nbs_codigo = item.get("nbs", "")
            if nbs_codigo:
                nbs_result = client.table("nbs").select("id").eq("codigo", nbs_codigo).execute()
                if not nbs_result.data:
                    # Extrai seção do código (ex: "1.01" → seção "1")
                    secao = nbs_codigo.split(".")[0] if "." in nbs_codigo else ""
                    client.table("nbs").insert({
                        "codigo": nbs_codigo,
                        "descricao": item.get("descricao", ""),
                        "secao": secao,
                    }).execute()

            # Insere a correlação CNAE → LC 116
            client.table("correlacao_cnae_lc116").upsert({
                "cnae_codigo": codigo,
                "cnae_descricao": item["descricao"],
                "lc116_codigo": item["lc116"],
                "nbs_codigo": item.get("nbs", ""),
            }, on_conflict="cnae_codigo, lc116_codigo").execute()

            inseridos += 1

        except Exception as e:
            logger.error(f"Erro ao inserir CNAE {codigo}: {e}")
            erros += 1

    logger.info(f"✅ População concluída! {inseridos} inseridos, {erros} erros.")


if __name__ == "__main__":
    popular()