"""Módulo de substituição para LegisWeb usando tabelas públicas.

Fontes gratuitas:
- IBGE/Concla: NBS (Nomenclatura Brasileira de Serviços) - correlação CNAE
- Tabela interna: CNAE → LC 116/2003 (baseada em dados públicos consolidados)
- CNAE → CNAE Fiscal da Receita Federal (já consultado via MinhaReceita)
"""

import csv
import json
import logging
import os
from pathlib import Path
from typing import Optional

import requests
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Mapeamento CNAE → LC 116/2003 baseado nas NBS e dados públicos
# Fonte: IBGE/Concla + Lei Complementar 116/2003
# Estrutura: { (cnae_prefixo ou descricao_lower): { "lc116": "xx.xx", "descricao": "...", "nbs": "...", "csn": "..." } }
CNAE_LC116_MAP = {
    # INFORMÁTICA E TI
    "6201": {"lc116": "01.02", "descricao": "Desenvolvimento de programas de computador sob encomenda", "nbs": "1.01"},
    "6202": {"lc116": "01.03", "descricao": "Processamento de dados e provedores", "nbs": "1.04"},
    "6203": {"lc116": "01.04", "descricao": "Hospedagem de sites e serviços de TI", "nbs": "1.04"},
    "6204": {"lc116": "01.05", "descricao": "Consultoria em TI", "nbs": "1.03"},
    "620": {"lc116": "01.06", "descricao": "Serviços técnicos em informática", "nbs": "1.00"},
    "6311": {"lc116": "01.04", "descricao": "Processamento de dados", "nbs": "1.04"},
    "6319": {"lc116": "01.04", "descricao": "Outros serviços de TI", "nbs": "1.04"},
    "951": {"lc116": "01.07", "descricao": "Manutenção de equipamentos de informática", "nbs": "1.05"},
    "9511": {"lc116": "01.07", "descricao": "Manutenção de computadores", "nbs": "1.05"},
    "9512": {"lc116": "01.07", "descricao": "Manutenção de equipamentos periféricos", "nbs": "1.05"},

    # CONSULTORIA E ADMINISTRAÇÃO
    "702": {"lc116": "17.01", "descricao": "Consultoria empresarial", "nbs": "12.01"},
    "7020": {"lc116": "17.01", "descricao": "Consultoria empresarial", "nbs": "12.01"},
    "6911": {"lc116": "17.02", "descricao": "Serviços jurídicos", "nbs": "12.02"},
    "6912": {"lc116": "17.03", "descricao": "Serviços de cartório", "nbs": "12.03"},
    "692": {"lc116": "17.04", "descricao": "Serviços de contabilidade", "nbs": "12.04"},
    "6920": {"lc116": "17.04", "descricao": "Serviços de contabilidade", "nbs": "12.04"},
    "7490": {"lc116": "17.05", "descricao": "Serviços de apoio administrativo", "nbs": "12.05"},
    "821": {"lc116": "17.06", "descricao": "Serviços de escritório e apoio", "nbs": "12.06"},
    "8211": {"lc116": "17.06", "descricao": "Serviços combinados de escritório", "nbs": "12.06"},
    "8219": {"lc116": "17.06", "descricao": "Fotocópias e outros serviços", "nbs": "12.06"},
    "822": {"lc116": "17.07", "descricao": "Telemarketing e call center", "nbs": "12.07"},
    "8220": {"lc116": "17.07", "descricao": "Telemarketing e call center", "nbs": "12.07"},

    # PUBLICIDADE E MARKETING
    "731": {"lc116": "17.10", "descricao": "Publicidade e propaganda", "nbs": "12.10"},
    "7310": {"lc116": "17.10", "descricao": "Publicidade e propaganda", "nbs": "12.10"},
    "7319": {"lc116": "17.10", "descricao": "Publicidade e propaganda", "nbs": "12.10"},
    "7410": {"lc116": "17.11", "descricao": "Design e decoração", "nbs": "12.11"},

    # EVENTOS E ORGANIZAÇÃO
    "823": {"lc116": "17.10", "descricao": "Organização de feiras e congressos", "nbs": "12.10"},
    "8230": {"lc116": "17.10", "descricao": "Organização de feiras e congressos", "nbs": "12.10"},
    "799": {"lc116": "10.05", "descricao": "Organização de eventos", "nbs": "6.05"},
    "7990": {"lc116": "10.05", "descricao": "Organização de eventos", "nbs": "6.05"},

    # CONSTRUÇÃO CIVIL
    "41": {"lc116": "7.02", "descricao": "Construção civil (execução de obras)", "nbs": "5.02"},
    "410": {"lc116": "7.02", "descricao": "Construção civil", "nbs": "5.02"},
    "4110": {"lc116": "7.02", "descricao": "Incorporação de imóveis", "nbs": "5.02"},
    "4120": {"lc116": "7.02", "descricao": "Construção de edifícios", "nbs": "5.02"},
    "42": {"lc116": "7.02", "descricao": "Obras de infraestrutura", "nbs": "5.02"},
    "43": {"lc116": "7.02", "descricao": "Serviços especializados para construção", "nbs": "5.02"},
    "432": {"lc116": "7.02", "descricao": "Instalações elétricas e hidráulicas", "nbs": "5.02"},
    "433": {"lc116": "7.03", "descricao": "Acabamentos em construção", "nbs": "5.03"},
    "439": {"lc116": "7.04", "descricao": "Outros serviços de construção", "nbs": "5.04"},
    "711": {"lc116": "7.05", "descricao": "Projetos de arquitetura e engenharia", "nbs": "5.05"},
    "7111": {"lc116": "7.05", "descricao": "Projetos de arquitetura", "nbs": "5.05"},
    "7112": {"lc116": "7.05", "descricao": "Projetos de engenharia", "nbs": "5.05"},
    "7119": {"lc116": "7.05", "descricao": "Projetos técnicos diversos", "nbs": "5.05"},

    # MANUTENÇÃO
    "331": {"lc116": "14.01", "descricao": "Manutenção de máquinas e equipamentos", "nbs": "10.01"},
    "3311": {"lc116": "14.01", "descricao": "Manutenção de equipamentos industriais", "nbs": "10.01"},
    "3312": {"lc116": "14.01", "descricao": "Manutenção de equipamentos eletrônicos", "nbs": "10.01"},
    "3313": {"lc116": "14.02", "descricao": "Manutenção de máquinas agrícolas", "nbs": "10.02"},
    "3314": {"lc116": "14.03", "descricao": "Manutenção de equipamentos de transporte", "nbs": "10.03"},
    "3315": {"lc116": "14.04", "descricao": "Manutenção de equipamentos diversos", "nbs": "10.04"},
    "452": {"lc116": "14.05", "descricao": "Manutenção de veículos", "nbs": "10.05"},
    "4520": {"lc116": "14.05", "descricao": "Manutenção de veículos", "nbs": "10.05"},
    "953": {"lc116": "14.06", "descricao": "Manutenção de equipamentos domésticos", "nbs": "10.06"},
    "9531": {"lc116": "14.06", "descricao": "Manutenção de eletrodomésticos", "nbs": "10.06"},
    "9532": {"lc116": "14.07", "descricao": "Manutenção de móveis e objetos", "nbs": "10.07"},
    "954": {"lc116": "14.08", "descricao": "Manutenção de bicicletas e outros", "nbs": "10.08"},

    # EDUCAÇÃO E ENSINO
    "85": {"lc116": "11.01", "descricao": "Serviços educacionais", "nbs": "7.01"},
    "851": {"lc116": "11.01", "descricao": "Educação infantil e fundamental", "nbs": "7.01"},
    "852": {"lc116": "11.01", "descricao": "Ensino médio", "nbs": "7.01"},
    "853": {"lc116": "11.01", "descricao": "Ensino superior", "nbs": "7.01"},
    "854": {"lc116": "11.02", "descricao": "Educação profissional", "nbs": "7.02"},
    "855": {"lc116": "11.03", "descricao": "Cursos livres e idiomas", "nbs": "7.03"},
    "8550": {"lc116": "11.03", "descricao": "Cursos livres e idiomas", "nbs": "7.03"},
    "859": {"lc116": "11.04", "descricao": "Outros serviços de ensino", "nbs": "7.04"},
    "8591": {"lc116": "11.04", "descricao": "Ensino de esportes e artes", "nbs": "7.04"},
    "8592": {"lc116": "11.04", "descricao": "Ensino especializado", "nbs": "7.04"},
    "8593": {"lc116": "11.04", "descricao": "Ensino profissionalizante", "nbs": "7.04"},
    "8599": {"lc116": "11.04", "descricao": "Outros serviços de ensino", "nbs": "7.04"},

    # SAÚDE
    "86": {"lc116": "4.01", "descricao": "Serviços de saúde", "nbs": "3.01"},
    "861": {"lc116": "4.01", "descricao": "Atividades hospitalares", "nbs": "3.01"},
    "862": {"lc116": "4.02", "descricao": "Serviços médicos e odontológicos", "nbs": "3.02"},
    "8621": {"lc116": "4.02", "descricao": "Serviços médicos", "nbs": "3.02"},
    "8622": {"lc116": "4.02", "descricao": "Serviços odontológicos", "nbs": "3.02"},
    "863": {"lc116": "4.03", "descricao": "Serviços de fisioterapia e enfermagem", "nbs": "3.03"},
    "8630": {"lc116": "4.03", "descricao": "Serviços de fisioterapia", "nbs": "3.03"},
    "864": {"lc116": "4.04", "descricao": "Serviços de laboratório e diagnóstico", "nbs": "3.04"},
    "8640": {"lc116": "4.04", "descricao": "Serviços de laboratório", "nbs": "3.04"},
    "865": {"lc116": "4.05", "descricao": "Serviços veterinários", "nbs": "3.05"},
    "8650": {"lc116": "4.05", "descricao": "Serviços veterinários", "nbs": "3.05"},
    "869": {"lc116": "4.06", "descricao": "Outros serviços de saúde", "nbs": "3.06"},

    # TRANSPORTE
    "49": {"lc116": "16.01", "descricao": "Transporte rodoviário", "nbs": "11.01"},
    "491": {"lc116": "16.01", "descricao": "Transporte ferroviário", "nbs": "11.01"},
    "492": {"lc116": "16.01", "descricao": "Transporte rodoviário de cargas", "nbs": "11.01"},
    "4921": {"lc116": "16.01", "descricao": "Transporte rodoviário de cargas", "nbs": "11.01"},
    "4922": {"lc116": "16.01", "descricao": "Transporte rodoviário de passageiros", "nbs": "11.01"},
    "493": {"lc116": "16.01", "descricao": "Transporte dutoviário", "nbs": "11.01"},
    "494": {"lc116": "16.01", "descricao": "Transporte aquaviário", "nbs": "11.01"},
    "495": {"lc116": "16.01", "descricao": "Transporte aéreo", "nbs": "11.01"},
    "50": {"lc116": "16.02", "descricao": "Transporte aquaviário", "nbs": "11.02"},
    "51": {"lc116": "16.03", "descricao": "Transporte aéreo", "nbs": "11.03"},
    "521": {"lc116": "16.04", "descricao": "Armazenamento e logística", "nbs": "11.04"},
    "5211": {"lc116": "16.04", "descricao": "Armazenamento", "nbs": "11.04"},
    "5212": {"lc116": "16.04", "descricao": "Carga e descarga", "nbs": "11.04"},
    "522": {"lc116": "16.05", "descricao": "Atividades auxiliares de transporte", "nbs": "11.05"},
    "5221": {"lc116": "16.05", "descricao": "Serviços de agenciamento de cargas", "nbs": "11.05"},
    "5222": {"lc116": "16.06", "descricao": "Serviços de estacionamento", "nbs": "11.06"},
    "5223": {"lc116": "16.07", "descricao": "Serviços de pedágio", "nbs": "11.07"},
    "5229": {"lc116": "16.08", "descricao": "Outros serviços auxiliares", "nbs": "11.08"},
    "525": {"lc116": "16.09", "descricao": "Correios e entregas", "nbs": "11.09"},
    "5250": {"lc116": "16.09", "descricao": "Correios e entregas", "nbs": "11.09"},
    "531": {"lc116": "16.10", "descricao": "Correios", "nbs": "11.10"},
    "532": {"lc116": "16.11", "descricao": "Serviços de entregas", "nbs": "11.11"},
    "5320": {"lc116": "16.11", "descricao": "Serviços de entregas", "nbs": "11.11"},

    # HOSPEDAGEM E ALIMENTAÇÃO
    "551": {"lc116": "21.01", "descricao": "Hotéis e pousadas (hospedagem)", "nbs": "15.01"},
    "5510": {"lc116": "21.01", "descricao": "Hotéis e pousadas", "nbs": "15.01"},
    "552": {"lc116": "21.02", "descricao": "Albergues e camping", "nbs": "15.02"},
    "553": {"lc116": "21.03", "descricao": "Restaurantes e serviços de alimentação", "nbs": "15.03"},
    "561": {"lc116": "21.03", "descricao": "Restaurantes e similares", "nbs": "15.03"},
    "5611": {"lc116": "21.03", "descricao": "Restaurantes", "nbs": "15.03"},
    "5612": {"lc116": "21.03", "descricao": "Lanches e serviços de alimentação", "nbs": "15.03"},
    "562": {"lc116": "21.04", "descricao": "Catering e bufê", "nbs": "15.04"},
    "5620": {"lc116": "21.04", "descricao": "Catering e bufê", "nbs": "15.04"},

    # SERVIÇOS PESSOAIS
    "960": {"lc116": "20.01", "descricao": "Serviços pessoais diversos", "nbs": "14.01"},
    "9601": {"lc116": "20.01", "descricao": "Lavanderia e tinturaria", "nbs": "14.01"},
    "9602": {"lc116": "20.02", "descricao": "Cabeleireiros e estética", "nbs": "14.02"},
    "9603": {"lc116": "20.03", "descricao": "Atividades funerárias", "nbs": "14.03"},
    "9609": {"lc116": "20.04", "descricao": "Outros serviços pessoais", "nbs": "14.04"},
    "970": {"lc116": "20.05", "descricao": "Serviços domésticos", "nbs": "14.05"},
    "9700": {"lc116": "20.05", "descricao": "Serviços domésticos", "nbs": "14.05"},

    # SEGURANÇA
    "801": {"lc116": "19.01", "descricao": "Vigilância e segurança privada", "nbs": "13.01"},
    "8011": {"lc116": "19.01", "descricao": "Vigilância patrimonial", "nbs": "13.01"},
    "8012": {"lc116": "19.02", "descricao": "Transporte de valores", "nbs": "13.02"},
    "802": {"lc116": "19.03", "descricao": "Monitoramento e alarmes", "nbs": "13.03"},
    "8020": {"lc116": "19.03", "descricao": "Monitoramento eletrônico", "nbs": "13.03"},
    "803": {"lc116": "19.04", "descricao": "Investigação particular", "nbs": "13.04"},
    "8030": {"lc116": "19.04", "descricao": "Investigação particular", "nbs": "13.04"},

    # ESPORTES E LAZER
    "931": {"lc116": "22.01", "descricao": "Atividades esportivas", "nbs": "16.01"},
    "9311": {"lc116": "22.01", "descricao": "Ginástica e fitness", "nbs": "16.01"},
    "9312": {"lc116": "22.02", "descricao": "Clubes esportivos", "nbs": "16.02"},
    "9313": {"lc116": "22.03", "descricao": "Atividades esportivas diversas", "nbs": "16.03"},
    "932": {"lc116": "22.04", "descricao": "Parques e entretenimento", "nbs": "16.04"},
    "9321": {"lc116": "22.04", "descricao": "Parques de diversão", "nbs": "16.04"},
    "9322": {"lc116": "22.05", "descricao": "Discotecas e casas noturnas", "nbs": "16.05"},
    "9323": {"lc116": "22.06", "descricao": "Jogos e entretenimento", "nbs": "16.06"},
    "9329": {"lc116": "22.07", "descricao": "Outros serviços de entretenimento", "nbs": "16.07"},
    "900": {"lc116": "22.08", "descricao": "Atividades culturais e artísticas", "nbs": "16.08"},
    "9001": {"lc116": "22.08", "descricao": "Teatro e música", "nbs": "16.08"},
    "9002": {"lc116": "22.08", "descricao": "Exposições e museus", "nbs": "16.08"},
    "9003": {"lc116": "22.08", "descricao": "Atividades artísticas diversas", "nbs": "16.08"},

    # IMOBILIÁRIO
    "681": {"lc116": "23.01", "descricao": "Atividades imobiliárias (corretagem)", "nbs": "17.01"},
    "6810": {"lc116": "23.01", "descricao": "Corretagem de imóveis", "nbs": "17.01"},
    "682": {"lc116": "23.02", "descricao": "Administração de imóveis", "nbs": "17.02"},
    "6821": {"lc116": "23.02", "descricao": "Administração de condomínios", "nbs": "17.02"},
    "6822": {"lc116": "23.02", "descricao": "Administração de imóveis próprios", "nbs": "17.02"},
    "683": {"lc116": "23.03", "descricao": "Avaliação de imóveis", "nbs": "17.03"},
    "6830": {"lc116": "23.03", "descricao": "Avaliação de imóveis", "nbs": "17.03"},

    # COMÉRCIO (serviços associados)
    "471": {"lc116": "23.04", "descricao": "Comércio varejista (serviços associados)", "nbs": "17.04"},
    "478": {"lc116": "23.05", "descricao": "Comércio de produtos diversos (serviços)", "nbs": "17.05"},

    # DEMAIS SERVIÇOS
    "591": {"lc116": "22.09", "descricao": "Produção de filmes e vídeos", "nbs": "16.09"},
    "5911": {"lc116": "22.09", "descricao": "Produção audiovisual", "nbs": "16.09"},
    "5912": {"lc116": "22.09", "descricao": "Distribuição audiovisual", "nbs": "16.09"},
    "592": {"lc116": "22.10", "descricao": "Gravação de som e edição", "nbs": "16.10"},
    "5920": {"lc116": "22.10", "descricao": "Gravação de som", "nbs": "16.10"},
    "601": {"lc116": "22.11", "descricao": "Atividades de rádio", "nbs": "16.11"},
    "602": {"lc116": "22.12", "descricao": "Atividades de televisão", "nbs": "16.12"},
    "611": {"lc116": "22.13", "descricao": "Telecomunicações (serviços)", "nbs": "16.13"},
    "612": {"lc116": "22.13", "descricao": "Telefonia fixa", "nbs": "16.13"},
    "613": {"lc116": "22.13", "descricao": "Telefonia móvel", "nbs": "16.13"},
    "614": {"lc116": "22.13", "descricao": "Internet (provedores)", "nbs": "16.13"},
    "619": {"lc116": "22.13", "descricao": "Outros serviços de telecomunicações", "nbs": "16.13"},
    "639": {"lc116": "22.14", "descricao": "Serviços de informação", "nbs": "16.14"},
    "6391": {"lc116": "22.14", "descricao": "Agências de notícias", "nbs": "16.14"},
    "6399": {"lc116": "22.14", "descricao": "Outros serviços de informação", "nbs": "16.14"},
    "772": {"lc116": "22.15", "descricao": "Aluguel de bens móveis", "nbs": "16.15"},
    "7721": {"lc116": "22.15", "descricao": "Locação de veículos", "nbs": "16.15"},
    "7722": {"lc116": "22.15", "descricao": "Locação de objetos pessoais", "nbs": "16.15"},
    "7723": {"lc116": "22.15", "descricao": "Locação de equipamentos", "nbs": "16.15"},
    "7729": {"lc116": "22.15", "descricao": "Locação de outros bens", "nbs": "16.15"},
    "773": {"lc116": "22.16", "descricao": "Aluguel de máquinas e equipamentos", "nbs": "16.16"},
    "7731": {"lc116": "22.16", "descricao": "Locação de máquinas agrícolas", "nbs": "16.16"},
    "7732": {"lc116": "22.16", "descricao": "Locação de máquinas industriais", "nbs": "16.16"},
    "7733": {"lc116": "22.16", "descricao": "Locação de equipamentos de construção", "nbs": "16.16"},
    "7734": {"lc116": "22.16", "descricao": "Locação de equipamentos de TI", "nbs": "16.16"},
    "774": {"lc116": "22.17", "descricao": "Aluguel de propriedade intelectual", "nbs": "16.17"},
    "7740": {"lc116": "22.17", "descricao": "Aluguel de propriedade intelectual", "nbs": "16.17"},
    "781": {"lc116": "22.18", "descricao": "Seleção e recrutamento", "nbs": "16.18"},
    "7810": {"lc116": "22.18", "descricao": "Seleção e recrutamento", "nbs": "16.18"},
    "782": {"lc116": "22.19", "descricao": "Serviços de temporários", "nbs": "16.19"},
    "7820": {"lc116": "22.19", "descricao": "Serviços de temporários", "nbs": "16.19"},
    "783": {"lc116": "22.20", "descricao": "Gestão de RH", "nbs": "16.20"},
    "7830": {"lc116": "22.20", "descricao": "Gestão de RH", "nbs": "16.20"},
    "791": {"lc116": "22.21", "descricao": "Agências de viagem", "nbs": "16.21"},
    "7911": {"lc116": "22.21", "descricao": "Agências de viagem", "nbs": "16.21"},
    "7912": {"lc116": "22.21", "descricao": "Operadores turísticos", "nbs": "16.21"},
    "792": {"lc116": "22.22", "descricao": "Guias de turismo", "nbs": "16.22"},
    "7920": {"lc116": "22.22", "descricao": "Guias de turismo", "nbs": "16.22"},
    "801": {"lc116": "19.01", "descricao": "Vigilância e segurança", "nbs": "13.01"},
    "802": {"lc116": "19.02", "descricao": "Alarmes e monitoramento", "nbs": "13.02"},
    "803": {"lc116": "19.03", "descricao": "Investigação", "nbs": "13.03"},
    "812": {"lc116": "22.23", "descricao": "Limpeza e conservação", "nbs": "16.23"},
    "8121": {"lc116": "22.23", "descricao": "Limpeza predial", "nbs": "16.23"},
    "8122": {"lc116": "22.23", "descricao": "Limpeza industrial", "nbs": "16.23"},
    "8129": {"lc116": "22.23", "descricao": "Outros serviços de limpeza", "nbs": "16.23"},
    "813": {"lc116": "22.24", "descricao": "Paisagismo e jardinagem", "nbs": "16.24"},
    "8130": {"lc116": "22.24", "descricao": "Paisagismo e jardinagem", "nbs": "16.24"},
    "829": {"lc116": "17.08", "descricao": "Outros serviços administrativos", "nbs": "12.08"},
    "8291": {"lc116": "17.08", "descricao": "Serviços de cobrança", "nbs": "12.08"},
    "8292": {"lc116": "17.08", "descricao": "Embalagem e empacotamento", "nbs": "12.08"},
    "8293": {"lc116": "17.08", "descricao": "Serviços de fotografia", "nbs": "12.08"},
    "8294": {"lc116": "17.08", "descricao": "Serviços de tradução", "nbs": "12.08"},
    "8295": {"lc116": "17.08", "descricao": "Serviços de reprografia", "nbs": "12.08"},
    "8296": {"lc116": "17.08", "descricao": "Serviços de gravação e carimbo", "nbs": "12.08"},
    "8297": {"lc116": "17.08", "descricao": "Serviços de leitura e contagem", "nbs": "12.08"},
    "8299": {"lc116": "17.09", "descricao": "Outros serviços diversos", "nbs": "12.09"},
}


def correlacionar_por_cnae(cnae_codigo: str, descricao_servico: str = "") -> dict:
    """
    Correlaciona um CNAE com a LC 116/2003 usando tabela interna.

    Args:
        cnae_codigo: Código CNAE (ex: "8230-0/01" ou "8230001").
        descricao_servico: Descrição do serviço (usado como fallback).

    Returns:
        Dicionário com lc116, descricao, nbs.
    """
    # Limpa o código CNAE (remove traços, barras, apenas números)
    cnae_limpo = "".join(filter(str.isdigit, str(cnae_codigo)))

    resultado = _buscar_na_tabela(cnae_limpo)

    if resultado:
        return resultado

    # Fallback: busca por descrição do serviço
    if descricao_servico:
        resultado = _buscar_por_descricao(descricao_servico)
        if resultado:
            return resultado

    return {
        "lc116": "",
        "descricao": "",
        "nbs": "",
        "csn": "",
        "fonte": "Tabela interna Wiserule (pública)",
    }


def _buscar_na_tabela(cnae_limpo: str) -> dict:
    """Busca o CNAE na tabela, tentando do mais específico ao mais genérico."""
    # Tenta o código completo (6 dígitos)
    if cnae_limpo in CNAE_LC116_MAP:
        item = CNAE_LC116_MAP[cnae_limpo]
        return {
            "lc116": item["lc116"],
            "descricao": item["descricao"],
            "nbs": item.get("nbs", ""),
            "csn": item.get("csn", ""),
            "fonte": "Tabela interna Wiserule (pública)",
        }

    # Tenta com 3 dígitos (prefixo)
    while len(cnae_limpo) >= 3:
        cnae_limpo = cnae_limpo[:-1]
        if cnae_limpo in CNAE_LC116_MAP:
            item = CNAE_LC116_MAP[cnae_limpo]
            return {
                "lc116": item["lc116"],
                "descricao": item["descricao"],
                "nbs": item.get("nbs", ""),
                "csn": item.get("csn", ""),
                "fonte": "Tabela interna Wiserule (pública)",
            }

    return {}


def _buscar_por_descricao(descricao: str) -> dict:
    """Busca por palavras-chave na descrição do serviço."""
    desc_lower = descricao.lower()

    # Palavras-chave para mapear serviço → LC 116
    palavras_chave = {
        "software": "01.02",
        "programa": "01.02",
        "desenvolvimento": "01.02",
        "site": "01.04",
        "hospedagem": "01.04",
        "manutenção de computador": "01.07",
        "manutenção de equipamento": "14.01",
        "consultoria": "17.01",
        "contabilidade": "17.04",
        "advocacia": "17.02",
        "jurídico": "17.02",
        "evento": "10.05",
        "festa": "10.05",
        "feira": "17.10",
        "congresso": "17.10",
        "construção": "7.02",
        "obra": "7.02",
        "arquitetura": "7.05",
        "engenharia": "7.05",
        "projeto": "7.05",
        "saúde": "4.01",
        "médico": "4.02",
        "hospital": "4.01",
        "dentista": "4.02",
        "transporte": "16.01",
        "carga": "16.01",
        "hotel": "21.01",
        "restaurante": "21.03",
        "alimentação": "21.03",
        "segurança": "19.01",
        "vigilância": "19.01",
        "limpeza": "22.23",
        "educação": "11.01",
        "escola": "11.01",
        "curso": "11.03",
        "ensino": "11.01",
        "publicidade": "17.10",
        "propaganda": "17.10",
        "marketing": "17.10",
        "fotografia": "17.08",
        "tradução": "17.08",
        "imobiliário": "23.01",
        "corretagem": "23.01",
        "condomínio": "23.02",
    }

    for palavra, lc116 in palavras_chave.items():
        if palavra in desc_lower:
            # Encontra o item correspondente no map
            for codigo, item in CNAE_LC116_MAP.items():
                if item["lc116"] == lc116 and len(codigo) >= 3:
                    return {
                        "lc116": item["lc116"],
                        "descricao": item["descricao"],
                        "nbs": item.get("nbs", ""),
                        "csn": item.get("csn", ""),
                        "fonte": "Tabela interna Wiserule (por descrição)",
                    }

    return {}


def formatar_correlacao_para_llm(correlacao: dict) -> str:
    """Formata o resultado da correlação para incluir no prompt do LLM."""
    if not correlacao or not correlacao.get("lc116"):
        return "Correlação não encontrada na base interna."

    partes = [
        f"LC 116/2003: {correlacao['lc116']} - {correlacao['descricao']}",
    ]

    if correlacao.get("nbs"):
        partes.append(f"NBS: {correlacao['nbs']}")

    if correlacao.get("csn"):
        partes.append(f"CSN: {correlacao['csn']}")

    partes.append(f"Fonte: {correlacao.get('fonte', 'Tabela interna')}")

    return "\n".join(partes)