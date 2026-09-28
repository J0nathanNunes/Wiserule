-- Cache das consultas ao emissor (Geranet) por CNPJ.
-- Evita reconsultar o emissor em reanexos do mesmo documento (TTL 15 min,
-- filtrado na query por criado_em). Uma linha por CNPJ (upsert no código).
CREATE TABLE IF NOT EXISTS cache_emissor_nfse (
    cnpj TEXT PRIMARY KEY,
    resposta TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cache_emissor_criado_em ON cache_emissor_nfse (criado_em DESC);
