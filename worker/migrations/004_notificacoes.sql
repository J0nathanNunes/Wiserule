-- Central de notificações por usuário.
CREATE TABLE IF NOT EXISTS notificacoes_usuario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('acesso', 'erro', 'sistema')),
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    lida INTEGER NOT NULL DEFAULT 0 CHECK (lida IN (0, 1)),
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_data ON notificacoes_usuario (usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_nao_lidas ON notificacoes_usuario (usuario_id, lida, criado_em DESC);

-- Notifica administradores existentes sobre cadastros que aguardam decisão.
INSERT INTO notificacoes_usuario (usuario_id, tipo, titulo, mensagem, criado_em)
SELECT admins.id, 'acesso', 'Cadastro pendente de aprovação', pendentes.mensagem, pendentes.criado_em
FROM (
        SELECT u.id, u.nome || ' (' || u.email || ') aguarda aprovação.' AS mensagem, u.criado_em
        FROM usuarios u
        WHERE u.status = 'pendente'
) AS pendentes
CROSS JOIN usuarios AS admins
WHERE admins.papel = 'admin'
    AND admins.status = 'ativo'
    AND NOT EXISTS (
            SELECT 1 FROM notificacoes_usuario n
            WHERE n.usuario_id = admins.id
                AND n.tipo = 'acesso'
                AND n.titulo = 'Cadastro pendente de aprovação'
                AND n.mensagem = pendentes.mensagem
    );