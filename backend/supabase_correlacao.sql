-- ============================================
-- Tabela de Correlação Wiserule
-- LC 116/2003 × NBS × CNAE × CSN
-- ============================================

-- Tabela principal de itens da LC 116/2003
CREATE TABLE IF NOT EXISTS lc116_itens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,         -- ex: "01.02", "17.10"
    descricao TEXT NOT NULL,              -- ex: "Desenvolvimento de programas de computador"
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de correlação CNAE → LC 116
CREATE TABLE IF NOT EXISTS correlacao_cnae_lc116 (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cnae_codigo TEXT NOT NULL,            -- ex: "6201-5/01" (completo) ou "6201" (prefixo)
    cnae_descricao TEXT,                   -- descrição do CNAE
    lc116_id BIGINT REFERENCES lc116_itens(id),
    lc116_codigo TEXT NOT NULL,           -- ex: "01.02" (denormalizado para consulta rápida)
    nbs_codigo TEXT,                      -- ex: "1.01"
    nbs_descricao TEXT,                   -- descrição NBS
    csn_codigo TEXT,                      -- código CSN (futuro)
    csn_descricao TEXT,                   -- descrição CSN (futuro)
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cnae_codigo, lc116_codigo)
);

-- Tabela de NBS (Nomenclatura Brasileira de Serviços)
CREATE TABLE IF NOT EXISTS nbs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,          -- ex: "1.01", "12.01"
    descricao TEXT NOT NULL,
    secao TEXT,                           -- seção da NBS
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de CSN (Código de Serviço Nacional) - preparado para futuro
CREATE TABLE IF NOT EXISTS csn (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,          -- código CSN
    descricao TEXT NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_correlacao_cnae ON correlacao_cnae_lc116 (cnae_codigo);
CREATE INDEX IF NOT EXISTS idx_correlacao_lc116 ON correlacao_cnae_lc116 (lc116_codigo);
CREATE INDEX IF NOT EXISTS idx_correlacao_nbs ON correlacao_cnae_lc116 (nbs_codigo);
CREATE INDEX IF NOT EXISTS idx_lc116_codigo ON lc116_itens (codigo);
CREATE INDEX IF NOT EXISTS idx_nbs_codigo ON nbs (codigo);

-- View para consulta completa
CREATE OR REPLACE VIEW v_correlacao_completa AS
SELECT 
    ccl.id,
    ccl.cnae_codigo,
    ccl.cnae_descricao,
    ccl.lc116_codigo,
    li.descricao AS lc116_descricao,
    ccl.nbs_codigo,
    nbs.descricao AS nbs_descricao,
    ccl.csn_codigo,
    csn.descricao AS csn_descricao,
    ccl.ativo
FROM correlacao_cnae_lc116 ccl
LEFT JOIN lc116_itens li ON ccl.lc116_codigo = li.codigo
LEFT JOIN nbs ON ccl.nbs_codigo = nbs.codigo
LEFT JOIN csn ON ccl.csn_codigo = csn.codigo
WHERE ccl.ativo = TRUE;

-- Política de segurança (desabilitada para uso interno)
ALTER TABLE lc116_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE correlacao_cnae_lc116 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE csn ENABLE ROW LEVEL SECURITY;

-- Políticas permitindo tudo para usuário autenticado (service_role)
CREATE POLICY "Permitir tudo para service_role" ON lc116_itens
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON correlacao_cnae_lc116
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON nbs
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON csn
    FOR ALL USING (true) WITH CHECK (true);