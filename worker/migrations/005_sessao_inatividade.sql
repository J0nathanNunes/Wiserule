-- Adiciona controle de inatividade às sessões existentes.
ALTER TABLE sessoes_usuario ADD COLUMN ultima_atividade_em TEXT NOT NULL DEFAULT (datetime('now'));
