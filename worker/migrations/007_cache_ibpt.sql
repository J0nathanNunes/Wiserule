-- Cache das referências de alíquotas IBPT (De Olho no Imposto) por código
-- LC116/NBS + UF. A tabela IBPT tem vigência semanal/mensal, então TTL de
-- 24h (filtrado na query por criado_em) é seguro. Uma linha por código+UF.
CREATE TABLE IF NOT EXISTS cache_ibpt_aliquotas (
    codigo TEXT NOT NULL,
    uf TEXT NOT NULL,
    resposta TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (codigo, uf)
);

CREATE INDEX IF NOT EXISTS idx_cache_ibpt_criado_em ON cache_ibpt_aliquotas (criado_em DESC);
