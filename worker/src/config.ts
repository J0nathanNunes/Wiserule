/**
 * Configuración central del Worker Wiserule.
 * Equivalente a backend/config.py en Python.
 */

export interface Env {
  // D1 Database
  DB: D1Database;

  // Secrets (configurados en el dashboard de Cloudflare)
  OPENROUTER_API_KEY?: string;
  TAVILY_API_KEY?: string;
  GERANET_API_KEY?: string;
  GERANET_CERT_PASSWORD?: string;
  GERANET_CERTS_JSON?: string;

  // Vars (configurados en wrangler.toml)
  APP_NAME?: string;
  MINHA_RECEITA_URL?: string;
  OPENROUTER_BASE_URL?: string;
  GERANET_BASE_URL?: string;
  MAX_FILE_SIZE_MB?: string;
  MODELO_OCR?: string;
  MODELO_ANALISE?: string;
  MODELO_VISAO?: string;
  CORS_ORIGINS?: string;
}

export function getConfig(env: Env) {
  return {
    appName: env.APP_NAME || 'Wiserule',
    minhaReceitaUrl: env.MINHA_RECEITA_URL || 'https://minhareceita.org',
    openrouterBaseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    geranetBaseUrl: env.GERANET_BASE_URL || 'https://nfe.geranet.net/api/v1',
    maxFileSizeMb: parseInt(env.MAX_FILE_SIZE_MB || '5', 10),
    modeloOcr: env.MODELO_OCR || 'openai/gpt-4o-mini',
    modeloAnalise: env.MODELO_ANALISE || 'openai/gpt-4o-mini',
    modeloVision: env.MODELO_VISAO || 'openai/gpt-4o-mini',
    // Modelos alternativos para redundância real (modelos diferentes = erros diferentes)
    modeloOcrAlt: env.MODELO_OCR_ALT || 'google/gemini-2.0-flash-001',
    modeloVisionAlt: env.MODELO_VISAO_ALT || 'anthropic/claude-3.5-sonnet',
    corsOrigins: (env.CORS_ORIGINS || 'https://wiserule.com,https://www.wiserule.com,http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export type Config = ReturnType<typeof getConfig>;