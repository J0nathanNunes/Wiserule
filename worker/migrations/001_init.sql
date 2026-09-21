-- ============================================
-- Migración inicial Wiserule - Cloudflare D1
-- ============================================

-- Tabla de análisis
CREATE TABLE IF NOT EXISTS analises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cnpj TEXT,
    servico TEXT,
    valor REAL,
    cidade TEXT,
    uf TEXT DEFAULT 'MS',
    resultado_json TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_analises_cnpj ON analises (cnpj);
CREATE INDEX IF NOT EXISTS idx_analises_criado_em ON analises (criado_em DESC);

-- Tabla principal de ítems de la LC 116/2003
CREATE TABLE IF NOT EXISTS lc116_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL,
    criado_em TEXT DEFAULT (datetime('now'))
);

-- NBS - Nomenclatura Brasileña de Servicios
CREATE TABLE IF NOT EXISTS nbs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL,
    seccion TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
);

-- CSN - Código de Servicio Nacional
CREATE TABLE IF NOT EXISTS csn (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL,
    criado_em TEXT DEFAULT (datetime('now'))
);

-- CTM - Código de Tributación Municipal
CREATE TABLE IF NOT EXISTS ctm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    municipio_ibge TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    lc116_codigo TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    UNIQUE(codigo, municipio_ibge)
);

-- Correlación CNAE → LC 116 + NBS + CSN
CREATE TABLE IF NOT EXISTS correlacion_cnae_lc116 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cnae_codigo TEXT NOT NULL,
    cnae_descripcion TEXT,
    lc116_codigo TEXT NOT NULL,
    nbs_codigo TEXT,
    csn_codigo TEXT,
    codigo_servicio_nacional TEXT,
    aliquota_iss_sugerida REAL,
    activo BOOLEAN DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now')),
    UNIQUE(cnae_codigo, lc116_codigo)
);

-- Excepciones del Art. 3º de la LC 116/2003
CREATE TABLE IF NOT EXISTS lc116_art3_excepciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lc116_codigo TEXT NOT NULL,
    lc116_descripcion TEXT NOT NULL,
    local_pago_iss TEXT NOT NULL,
    regla_descripcion TEXT NOT NULL,
    exige_obra_art BOOLEAN DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now'))
);

-- Tabla de tributos federales por tipo de servicio
CREATE TABLE IF NOT EXISTS retenciones_federales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lc116_codigo TEXT NOT NULL,
    irrf_aliquota REAL DEFAULT 1.5,
    csll_aliquota REAL DEFAULT 1.0,
    cofins_aliquota REAL DEFAULT 3.0,
    pis_aliquota REAL DEFAULT 0.65,
    exige_destacado_nfse BOOLEAN DEFAULT 1,
    observacion TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
);

-- IBS/CBS - Clasificación por tipo de servicio
CREATE TABLE IF NOT EXISTS ibscbs_clasificacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lc116_codigo TEXT NOT NULL,
    cst_codigo TEXT NOT NULL,
    cindop_codigo TEXT,
    aliquota_ibs_sugerida REAL DEFAULT 0.10,
    aliquota_cbs_sugerida REAL DEFAULT 0.90,
    regimen_especial TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_correlacion_cnae ON correlacion_cnae_lc116 (cnae_codigo);
CREATE INDEX IF NOT EXISTS idx_correlacion_lc116 ON correlacion_cnae_lc116 (lc116_codigo);
CREATE INDEX IF NOT EXISTS idx_correlacion_nbs ON correlacion_cnae_lc116 (nbs_codigo);
CREATE INDEX IF NOT EXISTS idx_lc116_codigo ON lc116_itens (codigo);
CREATE INDEX IF NOT EXISTS idx_nbs_codigo ON nbs (codigo);
CREATE INDEX IF NOT EXISTS idx_art3_lc116 ON lc116_art3_excepciones (lc116_codigo);
CREATE INDEX IF NOT EXISTS idx_retenciones_lc116 ON retenciones_federales (lc116_codigo);
CREATE INDEX IF NOT EXISTS idx_ibscbs_lc116 ON ibscbs_clasificacion (lc116_codigo);