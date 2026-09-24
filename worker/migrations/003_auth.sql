-- Contas, aprovações administrativas e sessões de acesso.
CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash TEXT NOT NULL,
    senha_salt TEXT NOT NULL,
    papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin', 'usuario')),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativo', 'recusado')),
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes_usuario (
    token_hash TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tentativas_login (
    email TEXT NOT NULL COLLATE NOCASE,
    ip TEXT NOT NULL,
    tentada_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario_expira ON sessoes_usuario (expira_em);
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios (status, criado_em);
CREATE INDEX IF NOT EXISTS idx_tentativas_login_email_ip_data ON tentativas_login (email, ip, tentada_em);