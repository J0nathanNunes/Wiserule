/**
 * Integración con la API Geranet para consulta de NFSe.
 * Equivalente a backend/geranet.py en Python.
 */

import { Env } from './config';

export interface GeranetConsultaParams {
  cnpj: string;
  inscripcion_municipal: string;
  razon_social: string;
  municipio: string;
  certificado_digital?: string;
  senha_certificado?: string;
  ultimo_nsu?: string;
  chave_nfse?: string;
}

export interface GeranetConsultaResult {
  status: 'sucesso' | 'error';
  datos?: Record<string, unknown>;
  resumen?: Record<string, unknown>;
  error?: string;
}

function obtenerCertificadoHex(env: Env, cnpj: string | null): string {
  // 1. JSON multi-cert (GERANET_CERTS_JSON)
  if (env.GERANET_CERTS_JSON && cnpj) {
    try {
      const certs = JSON.parse(env.GERANET_CERTS_JSON) as Record<string, string>;
      if (certs[cnpj]) {
        return certs[cnpj];
      }
    } catch {
      // ignorar
    }
  }

  // 2. Variable individual GERANET_CERT_{CNPJ}
  if (cnpj) {
    const varName = `GERANET_CERT_${cnpj}`;
    const valor = (env as Record<string, string | undefined>)[varName];
    if (valor) return valor;
  }

  // 3. Certificado único (legado)
  const certBase64 = (env as Record<string, string | undefined>).GERANET_CERT_BASE64;
  if (certBase64) return certBase64;

  throw new Error(
    cnpj
      ? `Ningún certificado encontrado para el CNPJ ${cnpj}. Configura GERANET_CERTS_JSON o GERANET_CERT_{CNPJ}.`
      : 'Ningún certificado configurado. Define GERANET_CERT_BASE64 o GERANET_CERTS_JSON.'
  );
}

export async function consultarNotas(
  params: GeranetConsultaParams,
  env: Env,
): Promise<GeranetConsultaResult> {
  if (!env.GERANET_API_KEY) {
    return { status: 'error', error: 'GERANET_API_KEY no configurada' };
  }

  let hexCert: string;
  try {
    hexCert = params.certificado_digital || obtenerCertificadoHex(env, params.cnpj);
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'Error de certificado' };
  }

  const senha = params.senha_certificado || env.GERANET_CERT_PASSWORD;
  if (!senha) {
    return {
      status: 'error',
      error: 'Contraseña del certificado no informada. Envía senha_certificado o configura GERANET_CERT_PASSWORD.',
    };
  }

  const payload = {
    prestador: {
      cnpj: params.cnpj,
      inscripcionMunicipal: params.inscripcion_municipal,
      razonSocial: params.razon_social,
      municipio: params.municipio,
    },
    certificadoDigital: hexCert,
    senhaCertificadoDigital: senha,
    padraoNacional: 'sim',
    ultimoNsu: params.ultimo_nsu || '0',
    ...(params.chave_nfse ? { chaveNfse: params.chave_nfse } : {}),
  };

  try {
    const res = await fetch(`${env.GERANET_BASE_URL || 'https://nfe.geranet.net/api/v1'}/nfse/consultar-notas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GERANET_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) return { status: 'error', error: 'Credenciales Geranet inválidas (HTTP 401)' };
    if (res.status === 402) return { status: 'error', error: 'Saldo insuficiente en Geranet (HTTP 402)' };
    if (res.status >= 400) {
      const body = await res.text();
      return { status: 'error', error: `Geranet retornó HTTP ${res.status}: ${body.slice(0, 300)}` };
    }

    const data = await res.json();
    if (data.situacion === 'error') {
      return { status: 'error', error: `Geranet retornó error: ${data.mensaje || 'sin mensaje'}` };
    }

    return { status: 'sucesso', datos: data, resumen: resumirConsulta(data) };
  } catch (e) {
    return {
      status: 'error',
      error: `Error inesperado en la consulta Geranet: ${e instanceof Error ? e.message.slice(0, 200) : 'desconocido'}`,
    };
  }
}

export function extraerNotasMasRecientes(respuesta: Record<string, unknown>, limite = 10): Array<Record<string, unknown>> {
  const registros = (respuesta.registros as Array<Record<string, unknown>>) || [];
  if (registros.length === 0) return [];

  // Ordena por fecha descendente
  registros.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));

  const simplificadas: Array<Record<string, unknown>> = [];
  for (const reg of registros.slice(0, limite)) {
    const datosNota = (reg.datosNota as Record<string, unknown>) || {};
    const servico = (datosNota.servico as Record<string, unknown>) || {};
    const valores = (servico.valores as Record<string, unknown>) || {};
    const tomador = (datosNota.tomador as Record<string, unknown>) || {};
    const identificacion = (datosNota.identificacion as Record<string, unknown>) || {};

    simplificadas.push({
      nsu: reg.nsu,
      numero_nota: reg.numeroNota,
      chave: reg.chaveDfe,
      codigo_verificacion: reg.codigoVerificacion,
      situacion: reg.descripcionSituacion,
      data_emision: identificacion.dataEmision || reg.data,
      valor: valores.valorServicios || 0,
      valor_liquido: valores.valorLiquidoNfse || 0,
      tomador_nombre: tomador.razonSocial || '',
      tomador_cnpj: tomador.cpfCnpj || '',
      item_servicio: servico.itemListaServicio || '',
      discriminacion: servico.discriminacion || '',
      iss_retido: (servico.tributacion as Record<string, unknown>)?.issRetido || 0,
      link: reg.link || '',
      tem_xml: Boolean(reg.xml),
    });
  }

  return simplificadas;
}

export function resumirConsulta(respuesta: Record<string, unknown>): Record<string, unknown> {
  const registros = (respuesta.registros as Array<Record<string, unknown>>) || [];
  const notas = extraerNotasMasRecientes(respuesta, 20);

  const totalValor = notas.reduce((acc, n) => acc + (Number(n.valor) || 0), 0);
  const notasAno = notas.filter((n) => n.data_emision && String(n.data_emision).startsWith('2026'));
  const totalAno = notasAno.reduce((acc, n) => acc + (Number(n.valor) || 0), 0);
  const retidos = notas.filter((n) => Number(n.iss_retido) === 1);

  return {
    cantidad_total: respuesta.quantidadeDocumentos || registros.length,
    cantidad_retornada: registros.length,
    ultimo_nsu: respuesta.ultimoNsu,
    proximo_nsu_sugerido: respuesta.proximoNsuSugerido,
    tem_mas: respuesta.temMasRegistrosProvavelmente === 'sim',
    notas_analizadas: notas.length,
    total_bruto: totalValor,
    total_2026: totalAno,
    notas_con_iss_retido: retidos.length,
    primera_nota: notas[0] || null,
    ultima_nota: notas[notas.length - 1] || null,
  };
}