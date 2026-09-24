/**
 * Codificação Base64 para proteger texto UTF-8 contra corrupção.
 *
 * PROBLEMA: O Durable Object do Cloudflare corrompe bytes UTF-8 multibyte
 * (í, ç, emojis) ao armazenar/recuperar objetos. Isso causa mojibake
 * (Ã¡, Ã£, Ã§, ð) no relatório.
 *
 * SOLUÇÃO: Codificar o texto em Base64 (ASCII puro) antes de guardar no DO.
 * Base64 só usa caracteres ASCII, que NUNCA são corrompidos por problemas
 * de encoding. Ao ler, decodificamos de volta a UTF-8 correto.
 */

/**
 * Codifica texto UTF-8 em Base64 (ASCII puro).
 * Usa btoa com manejo correto de Unicode.
 */
export function codificarBase64(texto: string): string {
  if (!texto) return '';
  // Converte string UTF-8 a bytes e depois a Base64
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario);
}

/**
 * Decodifica Base64 de volta a texto UTF-8.
 */
export function decodificarBase64(base64: string): string {
  if (!base64) return '';
  try {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) {
      bytes[i] = binario.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    // Se não é Base64 válido, retorna o texto original (puede ser texto plano)
    return base64;
  }
}

/**
 * Detecta si un texto parece estar corrompido (mojibake).
 * Busca patrones comunes de corrupción UTF-8→Latin-1.
 */
export function pareceCorrompido(texto: string): boolean {
  if (!texto) return false;
  // Patrones de mojibake: Ã¡, Ã£, Ã§, Ã©, Ã, ð, etc.
  return /Ã|Â|ð|â€|â€™|â€œ|â€\u009d|Ã¡|Ã£|Ã§|Ã©|Ã­|Ã³|Ãº|Ã±/.test(texto);
}

/**
 * Intenta reparar texto corrompido (mojibake) decodificando los bytes
 * como Latin-1 y re-decodificando como UTF-8.
 */
export function repararMojibake(texto: string): string {
  if (!texto || !pareceCorrompido(texto)) return texto;
  try {
    // Cada char del texto corrompido es un byte Latin-1
    const bytes = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i++) {
      bytes[i] = texto.charCodeAt(i) & 0xff;
    }
    const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
    const reparado = decoder.decode(bytes);
    // Solo usa el resultado si no tiene caracteres de reemplazo
    if (!reparado.includes('\uFFFD')) {
      return reparado;
    }
  } catch {
    // Ignora
  }
  return texto;
}