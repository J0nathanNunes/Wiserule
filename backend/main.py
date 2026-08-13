"""API principal do Wiserule - FastAPI."""

import base64
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models import AnaliseResponse
from cnpj import consultar_cnpj, consultar_cnpj_fallback
from legisweb import correlacionar_servico, formatar_correlacao_para_llm
from busca_online import buscar_online, formatar_busca_para_llm
from agente_llm import (
    gerar_analise,
    extrair_dados_nfse,
    extrair_dados_texto,
)
from database import salvar_analise, listar_analises, buscar_analise_por_id

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
):
    """
    Endpoint principal de análise de NFSe.

    Aceita dados via formulário (CNPJ, serviço, valor, cidade, UF)
    ou mensagem em linguagem natural, além de arquivo opcional (imagem/PDF).
    """
    try:
        # --- FASE 1: Extrair dados ---
        dados_extraidos = {}

        # 1a: Se tem arquivo, faz OCR
        if arquivo and arquivo.filename:
            conteudo = await arquivo.read()

            # Valida tamanho
            if len(conteudo) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
                raise HTTPException(
                    status_code=413,
                    detail=f"Arquivo muito grande. Máximo: {settings.MAX_FILE_SIZE_MB}MB",
                )

            extensao = arquivo.filename.rsplit(".", 1)[-1].lower() if "." in arquivo.filename else "png"
            arquivo_base64 = base64.b64encode(conteudo).decode()

            dados_extraidos = extrair_dados_nfse(arquivo_base64, extensao)
            print(f"[OCR] Dados extraídos: {dados_extraidos}")

        # 1b: Se tem mensagem em texto, extrai via LLM
        if mensagem and not any([cnpj, servico, valor, cidade]):
            dados_extraidos = extrair_dados_texto(mensagem)
            print(f"[TEXTO] Dados extraídos: {dados_extraidos}")

        # 1c: Mescla dados (manual sobrescreve extraído)
        cnpj = cnpj or dados_extraidos.get("cnpj", "")
        servico = servico or dados_extraidos.get("servico", "")
        valor = float(valor) if valor else float(dados_extraidos.get("valor", 0.0) or 0.0)
        cidade = cidade or dados_extraidos.get("cidade", "")
        uf = uf or dados_extraidos.get("uf", "MS")

        # Valida dados mínimos
        if not cnpj or not servico or not cidade:
            return AnaliseResponse(
                status="erro",
                erro="Dados insuficientes. Informe CNPJ, serviço e cidade.",
                dados_extraidos=dados_extraidos,
            )

        # Limpa CNPJ (apenas números)
        cnpj = "".join(filter(str.isdigit, cnpj))

        # --- FASE 2: Consultar CNPJ ---
        empresa = consultar_cnpj(cnpj)

        # Se falhou, tenta fallback
        if not empresa.razao_social and empresa.situacao.startswith("Erro"):
            empresa = consultar_cnpj_fallback(cnpj)

        # --- FASE 3: Correlacionar serviço ---
        correlacao = correlacionar_servico(servico, cidade, uf)
        correlacao_formatada = formatar_correlacao_para_llm(correlacao)

        # --- FASE 4: Busca online ---
        pergunta = f"retenção ISS {servico} {cidade} {uf} legislação discussões"
        resultados_busca = buscar_online(pergunta)
        busca_formatada = formatar_busca_para_llm(resultados_busca)

        # --- FASE 5: Gerar relatório ---
        contexto = {
            "empresa": empresa.model_dump() if hasattr(empresa, "model_dump") else empresa.__dict__,
            "correlacao_formatada": correlacao_formatada,
            "valor": valor,
            "cidade": cidade,
            "uf": uf,
            "busca_formatada": busca_formatada,
        }

        resumo = gerar_analise(contexto)

        # --- FASE 6: Salvar histórico ---
        try:
            salvar_analise(
                cnpj=cnpj,
                servico=servico,
                valor=valor,
                cidade=cidade,
                uf=uf,
                resultado=resumo,
            )
        except Exception:
            pass  # Falha no histórico não deve interromper a resposta

        return AnaliseResponse(
            status="sucesso",
            resumo=resumo,
            dados_extraidos=dados_extraidos if dados_extraidos else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        return AnaliseResponse(
            status="erro",
            erro=f"Erro interno: {str(e)}",
        )


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