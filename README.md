# Wiserule - Análise Fiscal Inteligente

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Wiserule** é um aplicativo web em formato de chat inteligente (estilo ChatGPT) que analisa Notas Fiscais de Serviço eletrônicas (NFSe). O usuário informa CNPJ, descrição do serviço, valor e município — ou simplesmente anexa a imagem/PDF da nota — e recebe um relatório técnico-jurídico completo sobre retenções fiscais, enquadramento da empresa e legislação aplicável.

---

## 🚀 Funcionalidades

- ✅ **Chat conversacional** estilo ChatGPT
- ✅ **Consulta automática de CNPJ** via MinhaReceita.org (com fallback BrasilAPI)
- ✅ **Correlação de serviços** com LC 116/2003, NBS, CNAE e CSN via LegisWeb
- ✅ **Busca online** sobre retenções e legislação via Tavily (fallback Brave Search)
- ✅ **OCR de NFSe** em imagens e PDFs via LLM multimodal (OpenRouter)
- ✅ **Relatório completo** com dados da empresa, enquadramento, retenções e base legal
- ✅ **Histórico de análises** persistido em banco de dados
- ✅ **Interface responsiva** com Next.js + Tailwind CSS

---

## 🧠 Arquitetura

```
[Usuário] → Chat (Next.js + Tailwind)
                ↓ HTTP/JSON
           [FastAPI Backend]
                ↓
    ┌───────────┼───────────┐
    ↓           ↓           ↓
MinhaReceita  LegisWeb   Tavily/Brave
    ↓           ↓           ↓
    └───────────┼───────────┘
                ↓
          [OpenRouter LLM]
           - OCR (imagem/PDF)
           - Relatório final
```

---

## 📋 Pré-requisitos

- **Python 3.11+**
- **Node.js 20+**
- **Chaves de API** (ver seção abaixo)

---

## 🔑 APIs Necessárias

| API | Obrigatória? | Custo | Para quê? |
|---|---|---|---|
| [OpenRouter](https://openrouter.ai/) | ✅ Sim | R$ 10-50/mês | LLM + OCR |
| [LegisWeb](https://www.legisweb.com.br/) | ✅ Sim | R$ 49-99/mês | Correlação de serviços |
| [Tavily](https://tavily.com/) | ❌ Opcional | Grátis (1.000/mês) | Busca online |
| [Brave Search](https://brave.com/search/api/) | ❌ Opcional | Grátis (2.000/mês) | Fallback de busca |
| MinhaReceita.org | ✅ Grátis | R$ 0 | Consulta CNPJ |

---

## 🛠️ Instalação e Execução

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/agente-nfse.git
cd agente-nfse
```

### 2. Configure as variáveis de ambiente

```bash
cp backend/.env.example backend/.env
# Edite o arquivo .env com suas chaves
```

### 3. Backend (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

pip install -r requirements.txt
uvicorn main:app --reload
```

O backend estará em `http://localhost:8000`.

### 4. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

O frontend estará em `http://localhost:3000`.

### 5. Ou use Docker

```bash
# Configure o .env com as chaves
docker-compose up -d
```

Acesse: `http://localhost:3000`

---

## 📡 Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Status do servidor |
| `POST` | `/analisar` | Análise completa de NFSe |
| `POST` | `/extrair` | Apenas OCR de imagem/PDF |
| `GET` | `/historico` | Lista análises anteriores |
| `GET` | `/historico/{id}` | Detalhe de uma análise |

### Exemplo: POST /analisar

```bash
curl -X POST http://localhost:8000/analisar \
  -F "cnpj=07121135000316" \
  -F "servico=Desenvolvimento de software" \
  -F "valor=5000.00" \
  -F "cidade=Campo Grande" \
  -F "uf=MS"
```

---

## 💻 Estrutura do Projeto

```
agente-nfse/
├── backend/
│   ├── main.py              # FastAPI endpoints
│   ├── config.py            # Configurações centralizadas
│   ├── models.py            # Modelos Pydantic
│   ├── cnpj.py              # Consulta MinhaReceita
│   ├── legisweb.py          # Correlação LegisWeb
│   ├── busca_online.py      # Tavily + Brave fallback
│   ├── agente_llm.py        # OpenRouter (OCR + análise)
│   ├── database.py          # SQLite/PostgreSQL
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── globals.css
│   │   └── components/
│   │       ├── ChatMessage.tsx
│   │       ├── ChatInput.tsx
│   │       └── Sidebar.tsx
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## ⚖️ Regras de Negócio Implementadas

| Condição | Regra |
|---|---|
| `opcao_pelo_mei == true` | Empresa é **MEI** |
| `opcao_pelo_simples == true` | **Simples Nacional** |
| Ambos false | Lucro Presumido/Real |
| SN ou MEI | **Não retém** IRRF, CSLL, COFINS, PIS (LC 123/2006, art. 13) |
| ISS | Regra municipal (LegisWeb) |
| Cidade não encontrada | Alerta no relatório |

---

## 📊 Custo Mensal Estimado

| Item | Custo |
|---|---|
| MinhaReceita.org | R$ 0 |
| LegisWeb | R$ 49-99 |
| OpenRouter | R$ 10-50 |
| Tavily | R$ 0 |
| Infraestrutura | R$ 0-20 |
| **Total** | **R$ 60-170/mês** |

---

## 🧪 Testes

```bash
# Backend
cd backend
python -m pytest

# Frontend
cd frontend
npm run lint
```

---

## 🚢 Deploy

### Opção 1: Docker (recomendado)

```bash
docker-compose up -d
```

### Opção 2: Render / Railway

1. Conecte o repositório GitHub
2. Defina as variáveis de ambiente no painel
3. Use o `Dockerfile` fornecido

### Opção 3: Streamlit Cloud (MVP)

Para uma versão simplificada, adapte o frontend para Streamlit.

---

## ⚠️ Aviso Legal

> As informações geradas por este sistema são de **caráter analítico** e não constituem aconselhamento jurídico oficial. Consulte um profissional habilitado (contador ou advogado) para tomada de decisão.

---

## 📄 Licença

MIT

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests.