"""Módulo de integração com OpenRouter (LLM)."""

import base64
import json
import logging
import re
from io import BytesIO
from typing import Optional
from PyPDF2 import PdfReader
from openai import OpenAI
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_openai_client() -> OpenAI:
    """Retorna cliente OpenAI configurado para OpenRouter."""
    return OpenAI(
        base_url=settings.OPENROUTER_BASE_URL,
        api_key=settings.OPENROUTER_API_KEY,
        default_headers={
            "HTTP-Referer": "https://github.com/agente-nfse",
            "X-Title": "Wiserule",
        },
        timeout=45.0,
        max_retries=1,
    )


SYSTEM_PROMPT_ANALISE = """Você é um analista fiscal sênior especializado em NFSe e direito tributário brasileiro.
Analise os dados fornecidos e gere um relatório técnico-jurídico completo em Markdown.

O relatório DEVE conter estas seções obrigatórias:

## 📋 Dados da Empresa
- Razão social, nome fantasia, CNPJ, situação cadastral
- Endereço completo, município, UF, CEP
- Natureza jurídica, porte
- Data de início de atividade
- CNAE principal e CNAEs secundários cadastrados na Receita Federal

## 🏢 Enquadramento Fiscal
- MEI, Simples Nacional, Lucro Presumido/Real
- Informe se é optante pelo Simples Nacional conforme dados oficiais
- Datas de opção e exclusão do MEI/Simples (se houver exclusão, mostrar a data; se não houver, usar "-")

## 🛠️ Serviço Prestado
- Descrição do serviço, código LC 116/2003, CNAE, NBS, CSN (quando disponíveis)

## ⚖️ Legislação Aplicável
- LC 116/2003 (item específico)
- Lei Municipal do município informado
- LC 123/2006 (Simples Nacional)
- IN RFB 2.100/2022 (retenções federais)

## 🧮 Análise de Retenções
Analise CADA tributo individualmente com base no enquadramento:

**Se a empresa for optante do Simples Nacional ou MEI:**
- **ISS (municipal):** Verificar regra do município (geralmente dispensa de retenção)
- **IRRF (1.5%):** Não retido (LC 123/2006, art. 13)
- **CSLL (1%):** Não retido (LC 123/2006, art. 13)
- **COFINS (3%):** Não retido (LC 123/2006, art. 13)
- **PIS (0,65%):** Não retido (LC 123/2006, art. 13)

**Se a empresa NÃO for optante do Simples Nacional (Lucro Presumido/Real):**
- **ISS (municipal):** Verificar regra do município (retenção na fonte é obrigatória)
- **IRRF (1.5%):** Deve ser retido (IN RFB 2.100/2022)
- **CSLL (1%):** Deve ser retido (IN RFB 2.100/2022)
- **COFINS (3%):** Deve ser retido (IN RFB 2.100/2022)
- **PIS (0,65%):** Deve ser retido (IN RFB 2.100/2022)

Indique valores percentuais e base legal de cada um.

## 💬 Opiniões da Comunidade
Resumo das informações encontradas nas buscas online, citando as fontes (URLs).
Inclua alerta de que são complementares à legislação oficial.

IMPORTANTE: Filtre os resultados. Se alguma fonte falar sobre assunto diferente do serviço analisado (ex.: construção civil quando o serviço é organização de eventos), descarte essa fonte e não a mencione.

## ✅ Conclusão
Análise final consolidada. Seja conservador: se houver divergência entre fontes, priorize a legislação oficial.
NÃO sugira nenhuma ação concreta (como "recolher" ou "pagar"). Apenas analise.

IMPORTANTE: Formate o relatório em Markdown limpo e bem estruturado.
"""

SYSTEM_PROMPT_OCR = """Você é um especialista em leitura de Notas Fiscais de Serviço eletrônicas (NFSe) brasileiras.

Extraia os seguintes dados da NFSe fornecida (imagem/PDF):
- CNPJ do prestador do serviço (formato XX.XXX.XXX/XXXX-XX ou apenas números)
- Descrição do serviço (o texto que descreve o que foi prestado)
- Valor total da nota (valor numérico, sem R$)
- Município da prestação (cidade onde o serviço foi prestado)
- UF (sigla do estado, ex: MS, SP, RJ)
- Número da NFSe (se visível)
- Data de emissão (se visível)

Procure por campos como "Prestador", "CNPJ", "Valor Total", "Município", "Descrição" na nota.

Retorne APENAS um JSON válido e nada mais, no formato exato:
{"cnpj": "...", "servico": "...", "valor": 0.00, "cidade": "...", "uf": "..."}

Se algum campo não estiver visível, use string vazia ou 0.0 para valor.
NÃO invente dados. Se não encontrar, deixe vazio.
"""

SYSTEM_PROMPT_EXTRACAO = """Extraia os seguintes dados do texto do usuário:
- cnpj: string (apenas números)
- servico: string (descrição do serviço)
- valor: number (valor numérico)
- cidade: string
- uf: string (sigla de 2 letras)

Retorne APENAS um JSON válido e nada mais, no formato exato:
{"cnpj": "...", "servico": "...", "valor": 0.00, "cidade": "...", "uf": "..."}

Se algum dado não existir no texto, use string vazia ou 0.0 para valor.
"""


def chamar_llm(
    mensagens: list[dict],
    modelo: Optional[str] = None,
    temperatura: float = 0.3,
    max_tokens: int = 2048,
) -> str:
    """
    Chama a API do OpenRouter para completar um chat usando a biblioteca openai.

    Args:
        mensagens: Lista de mensagens no formato [{"role": "...", "content": "..."}].
        modelo: Nome do modelo (usa padrão da config se não informado).
        temperatura: Criatividade da resposta (0.0 a 1.0).
        max_tokens: Máximo de tokens na resposta.

    Returns:
        Texto da resposta do modelo.
    """
    if not settings.OPENROUTER_API_KEY:
        return "Erro: OPENROUTER_API_KEY não configurada."

    try:
        client = get_openai_client()
        model = modelo or settings.MODELO_ANALISE

        logger.info(f"[LLM] Model: {model}")
        logger.info(f"[LLM] Base URL: {settings.OPENROUTER_BASE_URL}")

        response = client.chat.completions.create(
            model=model,
            messages=mensagens,
            temperature=temperatura,
            max_tokens=max_tokens,
        )

        if not response.choices:
            return "Erro: resposta vazia do OpenRouter."

        return response.choices[0].message.content or ""

    except Exception as e:
        logger.error(f"[LLM] Erro: {str(e)}")
        return f"Erro na chamada OpenRouter: {str(e)}"


def _formatar_cnaes_secundarios(cnaes: list) -> str:
    """Formata a lista de CNAEs secundários para o prompt."""
    if not cnaes:
        return "Nenhum CNAE secundário cadastrado."
    
    linhas = []
    for c in cnaes:
        codigo = c.get("codigo", "")
        descricao = c.get("descricao", "")
        linhas.append(f"- {codigo}: {descricao}")
    return "\n".join(linhas)


def gerar_analise(contexto: dict) -> str:
    """
    Gera o relatório completo de análise.

    Args:
        contexto: Dicionário com dados consolidados da análise.

    Returns:
        Relatório em Markdown.
    """
    # Trata None para exibição
    empresa = contexto.get('empresa', {})
    if isinstance(empresa, dict):
        for campo in ['data_exclusao_simples', 'data_exclusao_mei', 'telefone', 'email']:
            if campo in empresa and empresa[campo] is None:
                empresa[campo] = '-'

    mensagens = [
        {"role": "system", "content": SYSTEM_PROMPT_ANALISE},
        {
            "role": "user",
            "content": f"""Analise os dados abaixo e gere o relatório completo:

## Dados da Empresa
{json.dumps(empresa, indent=2, ensure_ascii=False)}

## CNAE do Serviço
Código: {contexto.get('cnae_codigo', '')}
Descrição: {contexto.get('cnae_descricao', '')}

## CNAEs Secundários (Receita Federal)
{_formatar_cnaes_secundarios(contexto.get('cnaes_secundarios', []))}

## Correlação do Serviço (LC 116/2003, NBS, CSN)
{contexto.get('correlacao_formatada', 'Não disponível')}

## Valor do Serviço
R$ {contexto.get('valor', 0):.2f}

## Município
{contexto.get('cidade', '')}/{contexto.get('uf', '')}

## Resultados de Busca Online
{contexto.get('busca_formatada', 'Nenhum resultado disponível')}
""",
        },
    ]

    return chamar_llm(mensagens)


def extrair_dados_nfse(arquivo_base64: str, extensao: str = "png") -> dict:
    """
    Extrai dados de uma NFSe a partir de imagem/PDF usando LLM multimodal.

    Args:
        arquivo_base64: Conteúdo do arquivo em base64.
        extensao: Extensão do arquivo (png, jpg, pdf).

    Returns:
        Dicionário com dados extraídos.
    """
    import base64

    # Se for PDF, extrai texto diretamente com PyPDF2
    if extensao.lower() == "pdf":
        try:
            arquivo_bytes = base64.b64decode(arquivo_base64)
            reader = PdfReader(BytesIO(arquivo_bytes))
            texto_pdf = ""
            for pagina in reader.pages:
                texto_pdf += pagina.extract_text() or ""
            
            logger.info(f"[OCR] Texto extraído do PDF ({len(texto_pdf)} chars)")
            
            # Envia o texto extraído para o LLM extrair os dados
            mensagens = [
                {"role": "system", "content": SYSTEM_PROMPT_OCR},
                {"role": "user", "content": f"Extraia os dados desta NFSe do texto abaixo:\n\n{texto_pdf}"},
            ]
            resposta = chamar_llm(mensagens, modelo=settings.MODELO_OCR, temperatura=0.1)
            logger.info(f"[OCR] Resposta do LLM para PDF: {resposta[:200]}")
            return _extrair_json(resposta)
        except Exception as e:
            logger.error(f"[OCR] Erro ao processar PDF: {e}")
            return {}

    # Para imagens (png, jpg), usa modelo com visão
    mime_type = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
    }.get(extensao.lower(), "image/png")

    mensagens = [
        {"role": "system", "content": SYSTEM_PROMPT_OCR},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Extraia os dados desta NFSe e retorne APENAS o JSON.",
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{arquivo_base64}"
                    },
                },
            ],
        },
    ]

    resposta = chamar_llm(mensagens, modelo=settings.MODELO_VISAO)
    logger.info(f"[OCR] Resposta bruta do LLM: {resposta[:300]}")

    # Tenta extrair JSON da resposta
    dados = _extrair_json(resposta)
    logger.info(f"[OCR] JSON extraído: {dados}")
    return dados


def extrair_dados_texto(texto: str) -> dict:
    """
    Extrai dados de NFSe a partir de texto em linguagem natural.

    Args:
        texto: Texto digitado pelo usuário.

    Returns:
        Dicionário com dados extraídos.
    """
    mensagens = [
        {"role": "system", "content": SYSTEM_PROMPT_EXTRACAO},
        {"role": "user", "content": texto},
    ]

    resposta = chamar_llm(mensagens, modelo=settings.MODELO_OCR, temperatura=0.1)

    return _extrair_json(resposta)


def _extrair_json(texto: str) -> dict:
    """Tenta extrair um JSON válido da resposta do LLM."""
    # Tenta encontrar bloco JSON delimitado por ```json ... ```
    padrao = r"```(?:json)?\s*([\s\S]*?)```"
    match = re.search(padrao, texto)
    if match:
        texto = match.group(1).strip()

    # Tenta parsear
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        pass

    # Tenta encontrar { ... } no texto
    padrao_chaves = r"\{[\s\S]*\}"
    match = re.search(padrao_chaves, texto)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return {}