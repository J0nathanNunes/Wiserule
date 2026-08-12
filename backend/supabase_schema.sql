-- ============================================
-- Script para criar as tabelas no Supabase
-- Execute no SQL Editor do painel Supabase
-- ============================================

-- Tabela de análises
CREATE TABLE IF NOT EXISTS analises (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cnpj TEXT,
    servico TEXT,
    valor REAL,
    cidade TEXT,
    uf TEXT DEFAULT 'MS',
    resultado_json TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de logs de API (opcional)
CREATE TABLE IF NOT EXISTS api_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    api_name TEXT,
    endpoint TEXT,
    payload TEXT,
    resposta_status INTEGER,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_analises_cnpj ON analises (cnpj);
CREATE INDEX IF NOT EXISTS idx_analises_criado_em ON analises (criado_em DESC);

-- Política de segurança (RLS) - opcional, desabilitada por padrão
-- ALTER TABLE analises ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;