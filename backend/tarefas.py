"""Gerenciamento de tarefas assíncronas para análise progressiva."""
import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Armazenamento em memória das tarefas
_tarefas: dict = {}


class StatusTarefa:
    AGUARDANDO = "aguardando"
    PROCESSANDO = "processando"
    PARCIAL = "parcial"
    CONCLUIDO = "concluido"
    ERRO = "erro"


def criar_tarefa() -> str:
    """Cria uma nova tarefa e retorna seu ID."""
    task_id = str(uuid.uuid4())[:8]
    _tarefas[task_id] = {
        "id": task_id,
        "status": StatusTarefa.AGUARDANDO,
        "criado_em": datetime.now().isoformat(),
        "etapa_atual": "Iniciando análise...",
        "dados_empresa": None,
        "relatorio_parcial": None,
        "relatorio_completo": None,
        "erro": None,
        "progresso": 0,  # 0 a 100
    }
    return task_id


def atualizar_tarefa(task_id: str, **kwargs):
    """Atualiza campos de uma tarefa."""
    if task_id in _tarefas:
        _tarefas[task_id].update(kwargs)


def obter_tarefa(task_id: str) -> Optional[dict]:
    """Retorna os dados da tarefa."""
    return _tarefas.get(task_id)


async def processar_analise_progressiva(
    task_id: str,
    cnpj: str,
    servico: str,
    valor: float,
    cidade: str,
    uf: str,
    empresa_data: dict,
    correlacao_formatada: str,
    info_ibs_cbs: str,
    busca_formatada: str,
    dados_extraidos: dict,
):
    """
    Processa a análise em etapas, atualizando o status progressivamente.
    Deve ser chamada em background.
    """
    from agente_llm import gerar_analise
    from database import salvar_analise

    try:
        atualizar_tarefa(
            task_id,
            status=StatusTarefa.PARCIAL,
            progresso=60,
            etapa_atual="Gerando relatório completo...",
        )

        # Gera análise completa
        contexto = {
            "empresa": empresa_data,
            "correlacao_formatada": correlacao_formatada,
            "cnae_codigo": empresa_data.get("cnae", ""),
            "cnae_descricao": empresa_data.get("cnae_descricao", ""),
            "cnaes_secundarios": empresa_data.get("cnaes_secundarios", []),
            "valor": valor,
            "cidade": cidade,
            "uf": uf,
            "busca_formatada": busca_formatada,
            "info_ibs_cbs": info_ibs_cbs,
        }

        relatorio = await asyncio.to_thread(gerar_analise, contexto)

        # Salva histórico
        try:
            salvar_analise(
                cnpj=cnpj,
                servico=servico,
                valor=valor,
                cidade=cidade,
                uf=uf,
                resultado=relatorio,
            )
        except Exception:
            pass

        atualizar_tarefa(
            task_id,
            status=StatusTarefa.CONCLUIDO,
            progresso=100,
            etapa_atual="Análise concluída.",
            relatorio_completo=relatorio,
        )

    except Exception as e:
        logger.error(f"[TAREFA {task_id}] Erro: {e}")
        atualizar_tarefa(
            task_id,
            status=StatusTarefa.ERRO,
            erro=str(e),
            etapa_atual="Erro na análise.",
        )