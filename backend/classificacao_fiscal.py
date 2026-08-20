"""Módulo de Classificação Fiscal Wiserule.

Integra:
- LC 116/2003 (itens e exceções Art. 3º)
- CSN (Código de Serviço Nacional)
- CTM (Código de Tributação Municipal)
- NBS (Nomenclatura Brasileira de Serviços)
- CNAE (Classificação Nacional)
- Retenções federais (IRRF, CSLL, COFINS, PIS)
- IBS/CBS (reforma tributária)
- Local de pagamento do ISS (Art. 3º LC 116/2003)
"""

import logging
from typing import Optional
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================
# ARTIGO 3º - LC 116/2003
# Exceções onde o ISS é devido no local da execução
# ============================================
# Regra geral: ISS devido no município do estabelecimento prestador
# Exceções (Art. 3º): ISS devido no local da execução ou domicílio do tomador

ARTIGO_3_EXCECOES = {
    "01.01": {
        "local": "local_execucao",
        "regra": "Serviços de informática - ISS devido no local da execução quando houver cessão de mão de obra"
    },
    "01.02": {
        "local": "estabelecimento_prestador",
        "regra": "Desenvolvimento sob encomenda - ISS devido no estabelecimento do prestador"
    },
    "01.06": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços técnicos em TI - ISS devido no estabelecimento do prestador"
    },
    "01.07": {
        "local": "local_execucao",
        "regra": "Manutenção de equipamentos - ISS devido onde o serviço for executado"
    },
    "03.01": {
        "local": "local_execucao",
        "regra": "Serviços de saúde - ISS devido no local da execução (consultórios, clínicas)"
    },
    "03.02": {
        "local": "local_execucao",
        "regra": "Serviços médicos e odontológicos - ISS devido no local da execução"
    },
    "03.03": {
        "local": "local_execucao",
        "regra": "Serviços de fisioterapia - ISS devido no local da execução"
    },
    "03.04": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de laboratório - ISS devido no estabelecimento do prestador"
    },
    "03.05": {
        "local": "local_execucao",
        "regra": "Serviços veterinários - ISS devido no local da execução"
    },
    "04.01": {
        "local": "local_execucao",
        "regra": "Serviços de saúde hospitalar - ISS devido no local da execução"
    },
    "04.02": {
        "local": "local_execucao",
        "regra": "Serviços médicos - ISS devido no local da execução"
    },
    "04.03": {
        "local": "local_execucao",
        "regra": "Serviços de enfermagem - ISS devido no local da execução"
    },
    "04.04": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de laboratório - ISS devido no estabelecimento do prestador"
    },
    "04.05": {
        "local": "local_execucao",
        "regra": "Serviços veterinários - ISS devido no local da execução"
    },
    "05.01": {
        "local": "local_execucao",
        "regra": "Serviços de planos de saúde - ISS devido no domicílio do tomador"
    },
    "07.02": {
        "local": "local_execucao",
        "regra": "Execução de obras de construção civil - ISS devido no local da obra"
    },
    "07.03": {
        "local": "local_execucao",
        "regra": "Acabamentos - ISS devido no local da obra"
    },
    "07.04": {
        "local": "local_execucao",
        "regra": "Serviços auxiliares da construção - ISS devido no local da obra"
    },
    "07.05": {
        "local": "local_execucao",
        "regra": "Projetos de arquitetura e engenharia - ISS devido no local da obra"
    },
    "07.16": {
        "local": "local_execucao",
        "regra": "Instalações - ISS devido no local da execução"
    },
    "07.17": {
        "local": "local_execucao",
        "regra": "Montagem industrial - ISS devido no local da execução"
    },
    "10.01": {
        "local": "local_execucao",
        "regra": "Serviços de transporte - ISS devido no local da prestação"
    },
    "10.02": {
        "local": "local_execucao",
        "regra": "Serviços de transporte de valores - ISS devido no local da prestação"
    },
    "10.03": {
        "local": "local_execucao",
        "regra": "Serviços de transporte de pessoas - ISS devido no local da prestação"
    },
    "10.04": {
        "local": "local_execucao",
        "regra": "Serviços de transporte de cargas - ISS devido no local da prestação"
    },
    "10.05": {
        "local": "local_execucao",
        "regra": "Organização de eventos - ISS devido no local do evento"
    },
    "11.01": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços educacionais - ISS devido no estabelecimento do prestador"
    },
    "11.02": {
        "local": "estabelecimento_prestador",
        "regra": "Ensino a distância - ISS devido no estabelecimento do prestador"
    },
    "11.03": {
        "local": "estabelecimento_prestador",
        "regra": "Cursos livres - ISS devido no estabelecimento do prestador"
    },
    "12.01": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de consultoria - ISS devido no estabelecimento do prestador"
    },
    "12.02": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços jurídicos - ISS devido no estabelecimento do prestador"
    },
    "12.03": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de cartório - ISS devido no estabelecimento do prestador"
    },
    "12.04": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços contábeis - ISS devido no estabelecimento do prestador"
    },
    "12.05": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de apoio administrativo - ISS devido no estabelecimento do prestador"
    },
    "12.06": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de escritório - ISS devido no estabelecimento do prestador"
    },
    "12.07": {
        "local": "estabelecimento_prestador",
        "regra": "Telemarketing - ISS devido no estabelecimento do prestador"
    },
    "12.08": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de fotografia e tradução - ISS devido no estabelecimento do prestador"
    },
    "12.09": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços diversos - ISS devido no estabelecimento do prestador"
    },
    "14.01": {
        "local": "local_execucao",
        "regra": "Manutenção de máquinas - ISS devido no local da execução"
    },
    "14.02": {
        "local": "local_execucao",
        "regra": "Manutenção de equipamentos - ISS devido no local da execução"
    },
    "14.03": {
        "local": "local_execucao",
        "regra": "Manutenção de veículos - ISS devido no local da execução"
    },
    "14.04": {
        "local": "local_execucao",
        "regra": "Manutenção de equipamentos diversos - ISS devido no local da execução"
    },
    "14.05": {
        "local": "local_execucao",
        "regra": "Manutenção de veículos automotores - ISS devido no local da execução"
    },
    "14.06": {
        "local": "local_execucao",
        "regra": "Manutenção de eletrodomésticos - ISS devido no local da execução"
    },
    "16.01": {
        "local": "local_execucao",
        "regra": "Transporte rodoviário - ISS devido no local da prestação"
    },
    "16.02": {
        "local": "local_execucao",
        "regra": "Transporte aquaviário - ISS devido no local da prestação"
    },
    "16.03": {
        "local": "local_execucao",
        "regra": "Transporte aéreo - ISS devido no local da prestação"
    },
    "16.04": {
        "local": "local_execucao",
        "regra": "Armazenamento - ISS devido no local da prestação"
    },
    "16.05": {
        "local": "local_execucao",
        "regra": "Serviços auxiliares de transporte - ISS devido no local da prestação"
    },
    "17.01": {
        "local": "estabelecimento_prestador",
        "regra": "Consultoria empresarial - ISS devido no estabelecimento do prestador"
    },
    "17.02": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços jurídicos - ISS devido no estabelecimento do prestador"
    },
    "17.03": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de cartório - ISS devido no estabelecimento do prestador"
    },
    "17.04": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços contábeis - ISS devido no estabelecimento do prestador"
    },
    "17.05": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de apoio administrativo - ISS devido no estabelecimento do prestador"
    },
    "17.06": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de escritório - ISS devido no estabelecimento do prestador"
    },
    "17.07": {
        "local": "estabelecimento_prestador",
        "regra": "Telemarketing - ISS devido no estabelecimento do prestador"
    },
    "17.08": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de fotografia, tradução, cobrança - ISS devido no estabelecimento do prestador"
    },
    "17.09": {
        "local": "estabelecimento_prestador",
        "regra": "Outros serviços - ISS devido no estabelecimento do prestador"
    },
    "17.10": {
        "local": "local_execucao",
        "regra": "Publicidade e propaganda - ISS devido no local da execução quando houver veiculação"
    },
    "19.01": {
        "local": "local_execucao",
        "regra": "Vigilância e segurança - ISS devido no local da prestação do serviço"
    },
    "19.02": {
        "local": "local_execucao",
        "regra": "Transporte de valores - ISS devido no local da prestação"
    },
    "19.03": {
        "local": "local_execucao",
        "regra": "Monitoramento eletrônico - ISS devido no local da prestação"
    },
    "19.04": {
        "local": "local_execucao",
        "regra": "Investigação particular - ISS devido no local da prestação"
    },
    "20.01": {
        "local": "estabelecimento_prestador",
        "regra": "Lavanderia - ISS devido no estabelecimento do prestador"
    },
    "20.02": {
        "local": "estabelecimento_prestador",
        "regra": "Cabeleireiros e estética - ISS devido no estabelecimento do prestador"
    },
    "20.03": {
        "local": "local_execucao",
        "regra": "Serviços funerários - ISS devido no local da execução"
    },
    "21.01": {
        "local": "local_execucao",
        "regra": "Hotéis - ISS devido no local da hospedagem"
    },
    "21.02": {
        "local": "local_execucao",
        "regra": "Albergues - ISS devido no local da hospedagem"
    },
    "21.03": {
        "local": "local_execucao",
        "regra": "Restaurantes - ISS devido no local do estabelecimento"
    },
    "21.04": {
        "local": "local_execucao",
        "regra": "Bufê e catering - ISS devido no local da execução"
    },
    "22.01": {
        "local": "local_execucao",
        "regra": "Atividades esportivas - ISS devido no local da execução"
    },
    "22.02": {
        "local": "local_execucao",
        "regra": "Clubes - ISS devido no local da execução"
    },
    "22.03": {
        "local": "local_execucao",
        "regra": "Atividades esportivas diversas - ISS devido no local da execução"
    },
    "22.04": {
        "local": "local_execucao",
        "regra": "Parques de diversão - ISS devido no local da execução"
    },
    "22.05": {
        "local": "local_execucao",
        "regra": "Casas noturnas - ISS devido no local da execução"
    },
    "22.06": {
        "local": "local_execucao",
        "regra": "Jogos e entretenimento - ISS devido no local da execução"
    },
    "22.07": {
        "local": "local_execucao",
        "regra": "Entretenimento - ISS devido no local da execução"
    },
    "22.08": {
        "local": "local_execucao",
        "regra": "Atividades culturais - ISS devido no local da execução"
    },
    "22.09": {
        "local": "local_execucao",
        "regra": "Produção audiovisual - ISS devido no local da execução"
    },
    "22.10": {
        "local": "local_execucao",
        "regra": "Gravação de som - ISS devido no local da execução"
    },
    "22.11": {
        "local": "estabelecimento_prestador",
        "regra": "Rádio - ISS devido no estabelecimento do prestador"
    },
    "22.12": {
        "local": "estabelecimento_prestador",
        "regra": "Televisão - ISS devido no estabelecimento do prestador"
    },
    "22.13": {
        "local": "estabelecimento_prestador",
        "regra": "Telecomunicações - ISS devido no estabelecimento do prestador"
    },
    "22.14": {
        "local": "estabelecimento_prestador",
        "regra": "Serviços de informação - ISS devido no estabelecimento do prestador"
    },
    "22.15": {
        "local": "estabelecimento_prestador",
        "regra": "Aluguel de bens móveis - ISS devido no estabelecimento do prestador"
    },
    "22.16": {
        "local": "estabelecimento_prestador",
        "regra": "Aluguel de máquinas - ISS devido no estabelecimento do prestador"
    },
    "22.17": {
        "local": "estabelecimento_prestador",
        "regra": "Aluguel de propriedade intelectual - ISS devido no estabelecimento do prestador"
    },
    "22.18": {
        "local": "estabelecimento_prestador",
        "regra": "Recrutamento e seleção - ISS devido no estabelecimento do prestador"
    },
    "22.19": {
        "local": "local_execucao",
        "regra": "Serviços temporários - ISS devido no local da prestação"
    },
    "22.20": {
        "local": "estabelecimento_prestador",
        "regra": "Gestão de RH - ISS devido no estabelecimento do prestador"
    },
    "22.21": {
        "local": "estabelecimento_prestador",
        "regra": "Agências de viagem - ISS devido no estabelecimento do prestador"
    },
    "22.22": {
        "local": "local_execucao",
        "regra": "Guias de turismo - ISS devido no local da execução"
    },
    "22.23": {
        "local": "local_execucao",
        "regra": "Limpeza e conservação - ISS devido no local da execução"
    },
    "22.24": {
        "local": "local_execucao",
        "regra": "Paisagismo e jardinagem - ISS devido no local da execução"
    },
    "23.01": {
        "local": "estabelecimento_prestador",
        "regra": "Corretagem de imóveis - ISS devido no estabelecimento do prestador"
    },
    "23.02": {
        "local": "local_execucao",
        "regra": "Administração de condomínios - ISS devido no local do imóvel"
    },
    "23.03": {
        "local": "local_execucao",
        "regra": "Avaliação de imóveis - ISS devido no local do imóvel"
    },
}


# ============================================
# RETENÇÕES FEDERAIS - IN RFB 2.100/2022
# ============================================
# A maioria dos serviços está sujeita a retenção na fonte
# Optantes do Simples Nacional são EXCLUÍDOS (LC 123/2006, art. 13)

RETENCOES_FEDERAIS_PADRAO = {
    "irrf_aliquota": 1.5,    # 1.5% (art. 647, IN RFB 2.100/2022)
    "csll_aliquota": 1.0,    # 1%
    "cofins_aliquota": 3.0,  # 3%
    "pis_aliquota": 0.65,    # 0.65%
    "exige_destaque_nfse": True,
}


# ============================================
# IBS/CBS - REFORMA TRIBUTÁRIA (EC 132/2023)
# ============================================
# Regras gerais de transição

IBS_CBS_PADRAO = {
    "cst": "000",
    "cindop": "100401",
    "aliquota_ibs": 0.10,    # 0.1% (período de transição)
    "aliquota_cbs": 0.90,    # 0.9% (período de transição)
}


# ============================================
# FUNÇÕES DE CLASSIFICAÇÃO
# ============================================

def classificar_local_iss(lc116_codigo: str) -> dict:
    """
    Classifica onde o ISS deve ser pago com base no Art. 3º da LC 116/2003.

    Returns:
        Dict com local_pagamento, regra_descricao, exige_obra_art
    """
    if lc116_codigo in ARTIGO_3_EXCECOES:
        excecao = ARTIGO_3_EXCECOES[lc116_codigo]
        return {
            "local_pagamento": excecao["local"],
            "regra_descricao": excecao["regra"],
            "exige_obra_art": lc116_codigo in ("7.02", "7.03", "7.04", "7.05"),
        }

    # Regra geral: estabelecimento do prestador
    return {
        "local_pagamento": "estabelecimento_prestador",
        "regra_descricao": "Regra geral: ISS devido no município do estabelecimento prestador (Art. 3º LC 116/2003)",
        "exige_obra_art": False,
    }


def classificar_retencoes(simples_nacional: bool, lc116_codigo: str = "") -> dict:
    """
    Classifica as retenções federais com base no enquadramento.

    Args:
        simples_nacional: Se a empresa é optante do SN
        lc116_codigo: Código LC 116 (para exceções futuras)

    Returns:
        Dict com alíquotas e se deve reter
    """
    if simples_nacional:
        return {
            "irrf": {"aliquota": 0, "reter": False, "base_legal": "LC 123/2006, art. 13"},
            "csll": {"aliquota": 0, "reter": False, "base_legal": "LC 123/2006, art. 13"},
            "cofins": {"aliquota": 0, "reter": False, "base_legal": "LC 123/2006, art. 13"},
            "pis": {"aliquota": 0, "reter": False, "base_legal": "LC 123/2006, art. 13"},
        }

    return {
        "irrf": {"aliquota": 1.5, "reter": True, "base_legal": "IN RFB 2.100/2022, art. 647"},
        "csll": {"aliquota": 1.0, "reter": True, "base_legal": "IN RFB 2.100/2022"},
        "cofins": {"aliquota": 3.0, "reter": True, "base_legal": "IN RFB 2.100/2022"},
        "pis": {"aliquota": 0.65, "reter": True, "base_legal": "IN RFB 2.100/2022"},
    }


def classificar_ibscbs(lc116_codigo: str = "") -> dict:
    """
    Classificação IBS/CBS para o serviço.

    Returns:
        Dict com CST, cIndOp, alíquotas sugeridas
    """
    return {
        "cst": IBS_CBS_PADRAO["cst"],
        "cindop": IBS_CBS_PADRAO["cindop"],
        "aliquota_ibs": IBS_CBS_PADRAO["aliquota_ibs"],
        "aliquota_cbs": IBS_CBS_PADRAO["aliquota_cbs"],
        "base_legal": "EC 132/2023, PLP 68/2024",
        "periodo_transicao": "2026-2033",
    }


def formatar_classificacao_para_llm(
    lc116_codigo: str,
    simples_nacional: bool,
    cidade_servico: str,
    uf_servico: str,
    cidade_prestador: str = "",
) -> str:
    """
    Formata a classificação fiscal completa para incluir no contexto do LLM.
    """
    local_iss = classificar_local_iss(lc116_codigo)
    retencoes = classificar_retencoes(simples_nacional, lc116_codigo)
    ibscbs = classificar_ibscbs(lc116_codigo)

    partes = [
        "## Classificação Fiscal Detalhada",
        "",
        f"### Local de Pagamento do ISS (Art. 3º LC 116/2003)",
        f"Regra: {local_iss['regra_descricao']}",
        f"Local de pagamento: {local_iss['local_pagamento']}",
        f"Exige ART/CREA: {'Sim' if local_iss['exige_obra_art'] else 'Não'}",
        "",
    ]

    if local_iss["local_pagamento"] == "local_execucao" and cidade_prestador and cidade_prestador != cidade_servico:
        partes.append(
            f"⚠️ ATENÇÃO: O serviço é executado em {cidade_servico}/{uf_servico}, "
            f"mas o prestador está em {cidade_prestador}. O ISS deve ser pago "
            f"no município de execução ({cidade_servico})."
        )
        partes.append("")

    partes.append("### Retenções Federais (IN RFB 2.100/2022)")
    if simples_nacional:
        partes.append("Empresa optante do Simples Nacional → Não há retenção de tributos federais.")
        partes.append("Base legal: LC 123/2006, art. 13")
    else:
        partes.append("Empresa NÃO optante do Simples Nacional → Sujeita a retenções:")
        for tributo, dados in retencoes.items():
            if dados["reter"]:
                partes.append(f"- {tributo.upper()}: {dados['aliquota']}% - {dados['base_legal']}")
        partes.append("")
        partes.append("Esses tributos DEVEM ser destacados na NFSe quando o tomador for pessoa jurídica.")
        partes.append("A falta de destaque pode gerar multa e responsabilidade solidária.")

    partes.append("")
    partes.append("### IBS/CBS - Reforma Tributária (EC 132/2023)")
    partes.append(f"CST: {ibscbs['cst']} | cIndOp: {ibscbs['cindop']}")
    partes.append(f"Alíquota IBS sugerida: {ibscbs['aliquota_ibs']}% | CBS: {ibscbs['aliquota_cbs']}%")
    partes.append(f"Período de transição: {ibscbs['periodo_transicao']}")
    partes.append(f"Base legal: {ibscbs['base_legal']}")

    return "\n".join(partes)