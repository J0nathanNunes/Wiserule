// Mantém o custo do PBKDF2 abaixo do limite de CPU por solicitação do Worker.
const ITERACOES_HASH = 100_000;
export const NOME_COOKIE_SESSAO = '__Host-wiserule_session';
// Validade absoluta da sessão desde o login.
export const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 24 * 30;
// A sessão encerra após 10 minutos sem qualquer requisição autenticada.
export const INATIVIDADE_SESSAO_SEGUNDOS = 10 * 60;

export type UsuarioAutenticado = {
  id: string;
  nome: string;
  email: string;
  papel: 'admin' | 'usuario';
  status: 'ativo';
};

function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function gerarAleatorio(tamanho: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(tamanho));
}

async function derivarHashSenha(senha: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERACOES_HASH },
    material,
    256,
  );
  return new Uint8Array(bits);
}

export async function criarCredencialSenha(senha: string): Promise<{ hash: string; salt: string }> {
  const salt = gerarAleatorio(16);
  const hash = await derivarHashSenha(senha, salt);
  return { hash: bytesHex(hash), salt: bytesHex(salt) };
}

export async function verificarSenha(senha: string, hashHex: string, saltHex: string): Promise<boolean> {
  const hashInformado = await derivarHashSenha(senha, hexBytes(saltHex));
  const hashArmazenado = hexBytes(hashHex);
  if (hashInformado.length !== hashArmazenado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < hashInformado.length; i++) diferenca |= hashInformado[i] ^ hashArmazenado[i];
  return diferenca === 0;
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesHex(new Uint8Array(digest));
}

export async function criarSessao(db: D1Database, usuarioId: string): Promise<string> {
  const token = bytesHex(gerarAleatorio(32));
  const tokenHash = await hashToken(token);
  await db.prepare(
    `INSERT INTO sessoes_usuario (token_hash, usuario_id, expira_em, ultima_atividade_em)
     VALUES (?, ?, datetime('now', '+30 days'), datetime('now'))`,
  ).bind(tokenHash, usuarioId).run();
  await db.prepare("DELETE FROM sessoes_usuario WHERE expira_em <= datetime('now')").run();
  return token;
}

export async function buscarUsuarioDaSessao(db: D1Database, token: string): Promise<UsuarioAutenticado | null> {
  const tokenHash = await hashToken(token);
  const usuario = await db.prepare(
    `SELECT u.id, u.nome, u.email, u.papel, u.status
     FROM sessoes_usuario s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = ?
       AND s.expira_em > datetime('now')
       AND s.ultima_atividade_em > datetime('now', '-10 minutes')
       AND u.status = 'ativo'`,
  ).bind(tokenHash).first<UsuarioAutenticado>();
  return usuario || null;
}

// Renova a janela de inatividade da sessão a cada requisição autenticada.
export async function renovarAtividadeSessao(db: D1Database, token: string): Promise<void> {
  await db.prepare(
    `UPDATE sessoes_usuario
     SET ultima_atividade_em = datetime('now')
     WHERE token_hash = ? AND expira_em > datetime('now')`,
  ).bind(await hashToken(token)).run();
}

export async function invalidarSessao(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessoes_usuario WHERE token_hash = ?').bind(await hashToken(token)).run();
}

export function compararSegredo(informado: string, configurado: string): boolean {
  const a = new TextEncoder().encode(informado);
  const b = new TextEncoder().encode(configurado);
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

export function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function validarSenha(senha: string): boolean {
  return senha.length >= 12 && senha.length <= 128;
}