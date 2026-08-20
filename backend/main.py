"""API principal do Wiserule - FastAPI."""

import asyncio
import base64
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models import AnaliseResponse
from cnpj import consultar_cnpj, consultar_cnpj_fallback
from busca_online import buscar_online, formatar_busca_para_llm
from agente_llm import (
    gerar_analise,
    extrair_dados_nfse,
    extrair_dados_texto,
)
from database import salvar_analise, listar_analises, buscar_analise_por_id
from ibs_cbs import consultar_class_trib, formatar_info_ibs_cbs
from correlacao_interna import correlacionar_por_cnae, formatar_correlacao_para_llm as formatar_correlacao_interna
from tarefas import (
    criar_tarefa, atualizar_tarefa, obter_tarefa,
    StatusTarefa, processar_analise_progressiva,
)
from classificacao_fiscal import (
    classificar_local_iss,
    classificar_retencoes,
    classificar_ibscbs,
    formatar_classificacao_para_llm,
)

app = FastAPI(
    title=settings.APP_NAME,
    description="API de análise inteligente de NFSe do Wiserule",
    version="1.0.0",
)

# CORS - permite frontend Netlify e desenvolvimento local
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://wiserule.netlify.app",
        "https://*.netlify.app",
        "http://localhost:3000",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Endpoint de verificação de saúde do servidor."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "apis_configured": {
            "openrouter": bool(settings.OPENROUTER_API_KEY),
            "legisweb": bool(settings.LEGISWEB_TOKEN),
            "tavily": bool(settings.TAVILY_API_KEY),
            "brave": bool(settings.BRAVE_API_KEY),
            "supabase": bool(settings.SUPABASE_URL and settings.SUPABASE_KEY),
        },
    }


@app.post("/analisar", response_model=AnaliseResponse)
async def analisar_nfse(
    cnpj: str = Form(""),
    servico: str = Form(""),
    valor: float = Form(0.0),
    cidade: str = Form(""),
    uf: str = Form("MS"),
    mensagem: str = Form(""),
    arquivo: Optional[UploadFile] = File(None),
    cnpj_tomador: str = Form(""),
):
    """
    Endpoint principal de análise de NFSe.
    Retorna imediatamente com status "processando" e um task_id.
    O frontend deve usar GET /analisar/status/{task_id} para acompanhar.
    """
    try:
        # --- FASE 1: Extrair dados ---
        dados_extraidos = {}

        # 1a: Se tem arquivo, faz OCR
        if arquivo and arquivo.filename:
            conteudo = await arquivo.read()
            if len(conteudo) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
                raise HTTPException(status_code=413, detail=f"Arquivo muito grande. Máximo: {settings.MAX_FILE_SIZE_MB}MB")

            extensao = arquivo.filename.rsplit(".", 1)[-1].lower() if "." in arquivo.filename else "png"
            arquivo_base64 = base64.b64encode(conteudo).decode()
            dados_extraidos = extrair_dados_nfse(arquivo_base64, extensao)

        elif mensagem and not any([cnpj, servico, valor, cidade]):
            dados_extraidos = extrair_dados_texto(mensagem)

        # Mescla dados
        cnpj = cnpj or dados_extraidos.get("cnpj", "")
        servico = servico or dados_extraidos.get("servico", "")
        valor = float(valor) if valor else float(dados_extraidos.get("valor", 0.0) or 0.0)
        cidade = cidade or dados_extraidos.get("cidade", "")
        uf = uf or dados_extraidos.get("uf", "MS")

        if not cnpj or not servico or not cidade:
            return AnaliseResponse(status="erro", erro="Dados insuficientes. Informe CNPJ, serviço e cidade.")

        cnpj = "".join(filter(str.isdigit, cnpj))

        # Cria tarefa e inicia processamento em background
        task_id = criar_tarefa()
        atualizar_tarefa(task_id, status=StatusTarefa.PROCESSANDO, progresso=10, etapa_atual="Consultando dados...")

        # --- ETAPA RÁPIDA: CNPJ + Correlação (paralelo) ---
        async def consultar_cnpj_async():
            emp = consultar_cnpj(cnpj)
            if not emp.razao_social and hasattr(emp, 'situacao') and emp.situacao.startswith("Erro"):
                emp = consultar_cnpj_fallback(cnpj)
            return emp

        async def correlacionar_async():
            # Usa nossa correlação interna (Supabase + fallback tabela interna)
            cnae_empresa = ""
            try:
                emp = consultar_cnpj(cnpj)
                if emp and hasattr(emp, 'cnae') and emp.cnae:
                    cnae_empresa = emp.cnae
            except Exception:
                pass
            corr = correlacionar_por_cnae(cnae_empresa, servico)
            return formatar_correlacao_interna(corr)

        async def consultar_ibs_cbs_async():
            return formatar_info_ibs_cbs(consultar_class_trib())

        empresa_task = asyncio.create_task(consultar_cnpj_async())
        correlacao_task = asyncio.create_task(correlacionar_async())
        ibs_cbs_task = asyncio.create_task(consultar_ibs_cbs_async())

        empresa = await empresa_task
        correlacao_formatada = await correlacao_task
        info_ibs_cbs = await ibs_cbs_task

        atualizar_tarefa(task_id, progresso=40, etapa_atual="Buscando referências online...")

        cnae_str = empresa.cnae if hasattr(empresa, 'cnae') and empresa.cnae else servico
        pergunta = f"{cnae_str} {servico} retenção ISS {cidade} {uf} LC 116 legislação"
        resultados_busca = buscar_online(pergunta)
        busca_formatada = formatar_busca_para_llm(resultados_busca)

        atualizar_tarefa(task_id, progresso=60, etapa_atual="Gerando relatório completo...")

        # Prepara dados da empresa para o dict
        empresa_dict = empresa.model_dump() if hasattr(empresa, "model_dump") else empresa.__dict__

        # Gera classificação fiscal detalhada
        lc116_codigo = ""
        if "LC 116/2003:" in correlacao_formatada:
            import re
            match = re.search(r"LC 116/2003:\s*([\d.]+)", correlacao_formatada)
            if match:
                lc116_codigo = match.group(1)

        simples_nacional = empresa.simples_nacional if hasattr(empresa, 'simples_nacional') else False
        cidade_prestador = empresa.municipio if hasattr(empresa, 'municipio') else ""
        cnae_str = empresa.cnae if hasattr(empresa, 'cnae') and empresa.cnae else ""
        classificacao_fiscal = formatar_classificacao_para_llm(
            lc116_codigo=lc116_codigo,
            simples_nacional=simples_nacional,
            cidade_servico=cidade,
            uf_servico=uf,
            cidade_prestador=cidade_prestador,
            cnpj_tomador=cnpj_tomador,
            valor_servico=valor,
            cnae_servico=cnae_str,
            descricao_servico=servico,
        )

        # Inicia processamento em background
        asyncio.create_task(processar_analise_progressiva(
            task_id=task_id,
            cnpj=cnpj,
            servico=servico,
            valor=valor,
            cidade=cidade,
            uf=uf,
            empresa_data=empresa_dict,
            correlacao_formatada=correlacao_formatada,
            info_ibs_cbs=info_ibs_cbs,
            busca_formatada=busca_formatada,
            dados_extraidos=dados_extraidos,
            classificacao_fiscal=classificacao_fiscal,
        ))

        # Retorna imediatamente com o task_id
        return AnaliseResponse(
            status="processando",
            resumo="",
            dados_extraidos={"task_id": task_id, "cnpj": cnpj, "servico": servico, "cidade": cidade},
        )

    except HTTPException:
        raise
    except Exception as e:
        return AnaliseResponse(status="erro", erro=f"Erro interno: {str(e)}")


@app.get("/analisar/status/{task_id}")
async def status_analise(task_id: str):
    """Retorna o status atual de uma análise em andamento."""
    tarefa = obter_tarefa(task_id)
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")

    return {
        "status": tarefa["status"],
        "progresso": tarefa["progresso"],
        "etapa_atual": tarefa["etapa_atual"],
        "relatorio_completo": tarefa.get("relatorio_completo"),
        "erro": tarefa.get("erro"),
    }


@app.post("/extrair")
async def extrair_dados(
    arquivo: UploadFile = File(...),
):
    """Extrai dados de uma NFSe a partir de imagem/PDF (apenas OCR)."""
    if not arquivo.filename:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado.")

    conteudo = await arquivo.read()

    if len(conteudo) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande. Máximo: {settings.MAX_FILE_SIZE_MB}MB",
        )

    extensao = arquivo.filename.rsplit(".", 1)[-1].lower() if "." in arquivo.filename else "png"
    arquivo_base64 = base64.b64encode(conteudo).decode()

    dados = extrair_dados_nfse(arquivo_base64, extensao)

    return {"status": "sucesso", "dados": dados}


@app.get("/historico")
async def historico(limite: int = 20):
    """Lista o histórico de análises realizadas."""
    analises = listar_analises(limite)
    return {
        "status": "sucesso",
        "analises": [
            {
                "id": a.id,
                "cnpj": a.cnpj,
                "servico": a.servico,
                "valor": a.valor,
                "cidade": a.cidade,
                "uf": a.uf,
                "criado_em": a.criado_em.isoformat() if hasattr(a.criado_em, 'isoformat') else str(a.criado_em),
            }
            for a in analises
        ],
    }


@app.get("/historico/{analise_id}")
async def detalhe_analise(analise_id: int):
    """Retorna o detalhe completo de uma análise."""
    analise = buscar_analise_por_id(analise_id)
    if not analise:
        raise HTTPException(status_code=404, detail="Análise não encontrada.")

    return {
        "status": "sucesso",
        "analise": {
            "id": analise.id,
            "cnpj": analise.cnpj,
            "servico": analise.servico,
            "valor": analise.valor,
            "cidade": analise.cidade,
            "uf": analise.uf,
            "resultado": analise.resultado_json,
            "criado_em": analise.criado_em.isoformat() if hasattr(analise.criado_em, 'isoformat') else str(analise.criado_em),
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)