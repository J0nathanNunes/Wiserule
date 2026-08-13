"""Modelos Pydantic para o Agente NFSe."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class AnaliseRequest(BaseModel):
    """Payload de entrada para análise de NFSe."""
    cnpj: str = Field("", description="CNPJ do prestador (apenas números)")
    servico: str = Field("", description="Descrição do serviço prestado")
    valor: float = Field(0.0, description="Valor do serviço")
    cidade: str = Field("", description="Município da prestação")
    uf: str = Field("MS", description="UF do município")
    mensagem: str = Field("", description="Mensagem em linguagem natural do usuário")


class EmpresaData(BaseModel):
    """Dados da empresa retornados pela consulta CNPJ."""
    cnpj: str = ""
    razao_social: str = ""
    situacao: str = ""
    cnae: str = ""
    cnae_descricao: str = ""
    cnaes_secundarios: list = []
    natureza_juridica: str = ""
    porte: str = ""
    simples_nacional: bool = False
    mei: bool = False
    data_opcao_simples: Optional[str] = None
    data_exclusao_simples: Optional[str] = None


class CorrelacaoServico(BaseModel):
    """Dados de correlação de serviço do LegisWeb."""
    lc116_codigo: str = ""
    lc116_descricao: str = ""
    nbs: list = []
    cnae: list = []
    csn: list = []
    detalhes_municipais: list = []


class ResultadoBusca(BaseModel):
    """Resultado de busca online."""
    title: str = ""
    url: str = ""
    content: str = ""


class DadosConsolidados(BaseModel):
    """Dados consolidados para enviar ao LLM."""
    empresa: EmpresaData = EmpresaData()
    correlacao_servico: CorrelacaoServico = CorrelacaoServico()
    valor_servico: float = 0.0
    cidade: str = ""
    uf: str = ""
    comunidade: list[ResultadoBusca] = []


class AnaliseResponse(BaseModel):
    """Resposta da análise."""
    status: str = "sucesso"
    resumo: str = ""
    dados_extraidos: Optional[dict] = None
    erro: Optional[str] = None


class AnaliseHistorico(BaseModel):
    """Registro de análise no banco."""
    id: int = 0
    cnpj: str = ""
    servico: str = ""
    valor: float = 0.0
    cidade: str = ""
    uf: str = ""
    resultado_json: str = ""
    criado_em: datetime = datetime.now()