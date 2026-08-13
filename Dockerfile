# Railway - Backend Wiserule
FROM python:3.11-slim

WORKDIR /app

# Instala dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copia e instala dependências Python
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código do backend
COPY backend/ .

# Railway define a porta via variável $PORT
EXPOSE 8000

# Comando para iniciar
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}