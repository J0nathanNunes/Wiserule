-- ============================================
-- Schema Completo de Classificação Fiscal Wiserule
-- LC 116/2003 × NBS × CNAE × CSN × CTM × Art. 3
-- ============================================

-- Tabela principal de itens da LC 116/2003
CREATE TABLE IF NOT EXISTS lc116_itens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    descricao TEXT NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- NBS - Nomenclatura Brasileira de Serviços
CREATE TABLE IF NOT EXISTS nbs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    descricao TEXT NOT NULL,
    secao TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- CSN - Código de Serviço Nacional
CREATE TABLE IF NOT EXISTS csn (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    descricao TEXT NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- CTM - Código de Tributação Municipal
CREATE TABLE IF NOT EXISTS ctm (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo TEXT NOT NULL,
    municipio_ibge TEXT NOT NULL,
    descricao TEXT NOT NULL,
    lc116_codigo TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(codigo, municipio_ibge)
);

-- Correlação CNAE → LC 116 + NBS + CSN
CREATE TABLE IF NOT EXISTS correlacao_cnae_lc116 (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cnae_codigo TEXT NOT NULL,
    cnae_descricao TEXT,
    lc116_id BIGINT REFERENCES lc116_itens(id),
    lc116_codigo TEXT NOT NULL,
    nbs_codigo TEXT,
    nbs_descricao TEXT,
    csn_codigo TEXT,
    csn_descricao TEXT,
    codigo_servico_nacional TEXT,
    aliquota_iss_sugerida REAL,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cnae_codigo, lc116_codigo)
);

-- Exceções do Art. 3º da LC 116/2003
CREATE TABLE IF NOT EXISTS lc116_art3_excecoes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lc116_codigo TEXT NOT NULL REFERENCES lc116_itens(codigo),
    lc116_descricao TEXT NOT NULL,
    local_pagamento_iss TEXT NOT NULL,
    regra_descricao TEXT NOT NULL,
    exige_obra_art BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de tributos federais por tipo de serviço
CREATE TABLE IF NOT EXISTS retencoes_federais (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lc116_codigo TEXT NOT NULL REFERENCES lc116_itens(codigo),
    irrf_aliquota REAL DEFAULT 1.5,
    csll_aliquota REAL DEFAULT 1.0,
    cofins_aliquota REAL DEFAULT 3.0,
    pis_aliquota REAL DEFAULT 0.65,
    exige_destaque_nfse BOOLEAN DEFAULT TRUE,
    observacao TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- IBS/CBS - Classificação por tipo de serviço
CREATE TABLE IF NOT EXISTS ibscbs_classificacao (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lc116_codigo TEXT NOT NULL REFERENCES lc116_itens(codigo),
    cst_codigo TEXT NOT NULL,
    cindop_codigo TEXT,
    aliquota_ibs_sugerida REAL DEFAULT 0.10,
    aliquota_cbs_sugerida REAL DEFAULT 0.90,
    regime_especial TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_correlacao_cnae ON correlacao_cnae_lc116 (cnae_codigo);
CREATE INDEX IF NOT EXISTS idx_correlacao_lc116 ON correlacao_cnae_lc116 (lc116_codigo);
CREATE INDEX IF NOT EXISTS idx_correlacao_nbs ON correlacao_cnae_lc116 (nbs_codigo);
CREATE INDEX IF NOT EXISTS idx_lc116_codigo ON lc116_itens (codigo);
CREATE INDEX IF NOT EXISTS idx_nbs_codigo ON nbs (codigo);
CREATE INDEX IF NOT EXISTS idx_art3_lc116 ON lc116_art3_excecoes (lc116_codigo);
CREATE INDEX IF NOT EXISTS idx_retencoes_lc116 ON retencoes_federais (lc116_codigo);
CREATE INDEX IF NOT EXISTS idx_ibscbs_lc116 ON ibscbs_classificacao (lc116_codigo);

-- View consolidada
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
    ccl.codigo_servico_nacional,
    ccl.aliquota_iss_sugerida,
    ccl.ativo,
    a3.local_pagamento_iss,
    a3.regra_descricao AS art3_regra,
    rf.irrf_aliquota,
    rf.csll_aliquota,
    rf.cofins_aliquota,
    rf.pis_aliquota,
    rf.exige_destaque_nfse,
    ic.cst_codigo,
    ic.cindop_codigo,
    ic.aliquota_ibs_sugerida,
    ic.aliquota_cbs_sugerida
FROM correlacao_cnae_lc116 ccl
LEFT JOIN lc116_itens li ON ccl.lc116_codigo = li.codigo
LEFT JOIN nbs ON ccl.nbs_codigo = nbs.codigo
LEFT JOIN csn ON ccl.csn_codigo = csn.codigo
LEFT JOIN lc116_art3_excecoes a3 ON ccl.lc116_codigo = a3.lc116_codigo
LEFT JOIN retencoes_federais rf ON ccl.lc116_codigo = rf.lc116_codigo
LEFT JOIN ibscbs_classificacao ic ON ccl.lc116_codigo = ic.lc116_codigo
WHERE ccl.ativo = TRUE;

-- RLS Policies
ALTER TABLE lc116_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE correlacao_cnae_lc116 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE csn ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctm ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc116_art3_excecoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE retencoes_federais ENABLE ROW LEVEL SECURITY;
ALTER TABLE ibscbs_classificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo para service_role" ON lc116_itens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON correlacao_cnae_lc116 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON nbs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON csn FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON ctm FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON lc116_art3_excecoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON retencoes_federais FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para service_role" ON ibscbs_classificacao FOR ALL USING (true) WITH CHECK (true);