/**
 * Clasificación Fiscal Wiserule.
 * Equivalente a backend/classificacao_fiscal.py en Python.
 *
 * Integra:
 * - LC 116/2003 (ítems y excepciones Art. 3º)
 * - CSN, CTM, NBS, CNAE
 * - Retenciones federales (IRRF, CSLL, COFINS, PIS)
 * - INSS Cota Patronal (art. 22 Ley 8.212/91)
 * - CEBAS (Exención de INSS)
 * - IBS/CBS (reforma tributaria)
 * - Lugar de pago del ISS (Art. 3º LC 116/2003)
 */

// Excepciones del Art. 3º LC 116/2003
const ARTIGO_3_EXCECOES: Record<string, { local: string; regla: string }> = {
  '01.01': { local: 'local_ejecucion', regla: 'Servicios de informática - ISS debido en el lugar de ejecución cuando haya cesión de mano de obra' },
  '01.02': { local: 'establecimiento_prestador', regla: 'Desarrollo bajo pedido - ISS debido en el establecimiento del prestador' },
  '01.06': { local: 'establecimiento_prestador', regla: 'Servicios técnicos en TI - ISS debido en el establecimiento del prestador' },
  '01.07': { local: 'local_ejecucion', regla: 'Mantenimiento de equipos - ISS debido donde el servicio se ejecute' },
  '03.01': { local: 'local_ejecucion', regla: 'Servicios de salud - ISS debido en el lugar de ejecución' },
  '03.02': { local: 'local_ejecucion', regla: 'Servicios médicos y odontológicos - ISS debido en el lugar de ejecución' },
  '03.03': { local: 'local_ejecucion', regla: 'Servicios de fisioterapia - ISS debido en el lugar de ejecución' },
  '03.04': { local: 'establecimiento_prestador', regla: 'Servicios de laboratorio - ISS debido en el establecimiento del prestador' },
  '03.05': { local: 'local_ejecucion', regla: 'Servicios veterinarios - ISS debido en el lugar de ejecución' },
  '04.01': { local: 'local_ejecucion', regla: 'Servicios de salud hospitalaria - ISS debido en el lugar de ejecución' },
  '04.02': { local: 'local_ejecucion', regla: 'Servicios médicos - ISS debido en el lugar de ejecución' },
  '04.03': { local: 'local_ejecucion', regla: 'Servicios de enfermería - ISS debido en el lugar de ejecución' },
  '04.04': { local: 'establecimiento_prestador', regla: 'Servicios de laboratorio - ISS debido en el establecimiento del prestador' },
  '04.05': { local: 'local_ejecucion', regla: 'Servicios veterinarios - ISS debido en el lugar de ejecución' },
  '05.01': { local: 'local_ejecucion', regla: 'Servicios de planes de salud - ISS debido en el domicilio del tomador' },
  '07.02': { local: 'local_ejecucion', regla: 'Ejecución de obras de construcción civil - ISS debido en el lugar de la obra' },
  '07.03': { local: 'local_ejecucion', regla: 'Acabados - ISS debido en el lugar de la obra' },
  '07.04': { local: 'local_ejecucion', regla: 'Servicios auxiliares de la construcción - ISS debido en el lugar de la obra' },
  '07.05': { local: 'local_ejecucion', regla: 'Proyectos de arquitectura e ingeniería - ISS debido en el lugar de la obra' },
  '07.16': { local: 'local_ejecucion', regla: 'Instalaciones - ISS debido en el lugar de ejecución' },
  '07.17': { local: 'local_ejecucion', regla: 'Montaje industrial - ISS debido en el lugar de ejecución' },
  '10.01': { local: 'local_ejecucion', regla: 'Servicios de transporte - ISS debido en el lugar de la prestación' },
  '10.02': { local: 'local_ejecucion', regla: 'Servicios de transporte de valores - ISS debido en el lugar de la prestación' },
  '10.03': { local: 'local_ejecucion', regla: 'Servicios de transporte de personas - ISS debido en el lugar de la prestación' },
  '10.04': { local: 'local_ejecucion', regla: 'Servicios de transporte de cargas - ISS debido en el lugar de la prestación' },
  '10.05': { local: 'local_ejecucion', regla: 'Organización de eventos - ISS debido en el lugar del evento' },
  '11.01': { local: 'establecimiento_prestador', regla: 'Servicios educativos - ISS debido en el establecimiento del prestador' },
  '11.02': { local: 'establecimiento_prestador', regla: 'Enseñanza a distancia - ISS debido en el establecimiento del prestador' },
  '11.03': { local: 'establecimiento_prestador', regla: 'Cursos libres - ISS debido en el establecimiento del prestador' },
  '12.01': { local: 'establecimiento_prestador', regla: 'Servicios de consultoría - ISS debido en el establecimiento del prestador' },
  '12.02': { local: 'establecimiento_prestador', regla: 'Servicios jurídicos - ISS debido en el establecimiento del prestador' },
  '12.03': { local: 'establecimiento_prestador', regla: 'Servicios de notaría - ISS debido en el establecimiento del prestador' },
  '12.04': { local: 'establecimiento_prestador', regla: 'Servicios contables - ISS debido en el establecimiento del prestador' },
  '12.05': { local: 'establecimiento_prestador', regla: 'Servicios de apoyo administrativo - ISS debido en el establecimiento del prestador' },
  '12.06': { local: 'establecimiento_prestador', regla: 'Servicios de oficina - ISS debido en el establecimiento del prestador' },
  '12.07': { local: 'establecimiento_prestador', regla: 'Telemarketing - ISS debido en el establecimiento del prestador' },
  '12.08': { local: 'establecimiento_prestador', regla: 'Servicios de fotografía y traducción - ISS debido en el establecimiento del prestador' },
  '12.09': { local: 'establecimiento_prestador', regla: 'Servicios diversos - ISS debido en el establecimiento del prestador' },
  '14.01': { local: 'local_ejecucion', regla: 'Mantenimiento de máquinas - ISS debido en el lugar de ejecución' },
  '14.02': { local: 'local_ejecucion', regla: 'Mantenimiento de equipos - ISS debido en el lugar de ejecución' },
  '14.03': { local: 'local_ejecucion', regla: 'Mantenimiento de vehículos - ISS debido en el lugar de ejecución' },
  '14.04': { local: 'local_ejecucion', regla: 'Mantenimiento de equipos diversos - ISS debido en el lugar de ejecución' },
  '14.05': { local: 'local_ejecucion', regla: 'Mantenimiento de vehículos automotores - ISS debido en el lugar de ejecución' },
  '14.06': { local: 'local_ejecucion', regla: 'Mantenimiento de electrodomésticos - ISS debido en el lugar de ejecución' },
  '16.01': { local: 'local_ejecucion', regla: 'Transporte rodoviario - ISS debido en el lugar de la prestación' },
  '16.02': { local: 'local_ejecucion', regla: 'Transporte acuaviario - ISS debido en el lugar de la prestación' },
  '16.03': { local: 'local_ejecucion', regla: 'Transporte aéreo - ISS debido en el lugar de la prestación' },
  '16.04': { local: 'local_ejecucion', regla: 'Almacenamiento - ISS debido en el lugar de la prestación' },
  '16.05': { local: 'local_ejecucion', regla: 'Servicios auxiliares de transporte - ISS debido en el lugar de la prestación' },
  '17.01': { local: 'establecimiento_prestador', regla: 'Consultoría empresarial - ISS debido en el establecimiento del prestador' },
  '17.02': { local: 'establecimiento_prestador', regla: 'Servicios jurídicos - ISS debido en el establecimiento del prestador' },
  '17.03': { local: 'establecimiento_prestador', regla: 'Servicios de notaría - ISS debido en el establecimiento del prestador' },
  '17.04': { local: 'establecimiento_prestador', regla: 'Servicios contables - ISS debido en el establecimiento del prestador' },
  '17.05': { local: 'establecimiento_prestador', regla: 'Servicios de apoyo administrativo - ISS debido en el establecimiento del prestador' },
  '17.06': { local: 'establecimiento_prestador', regla: 'Servicios de oficina - ISS debido en el establecimiento del prestador' },
  '17.07': { local: 'establecimiento_prestador', regla: 'Telemarketing - ISS debido en el establecimiento del prestador' },
  '17.08': { local: 'establecimiento_prestador', regla: 'Servicios de fotografía, traducción, cobranza - ISS debido en el establecimiento del prestador' },
  '17.09': { local: 'establecimiento_prestador', regla: 'Otros servicios - ISS debido en el establecimiento del prestador' },
  '17.10': { local: 'local_ejecucion', regla: 'Publicidad y propaganda - ISS debido en el lugar de ejecución cuando haya veiculación' },
  '19.01': { local: 'local_ejecucion', regla: 'Vigilancia y seguridad - ISS debido en el lugar de la prestación del servicio' },
  '19.02': { local: 'local_ejecucion', regla: 'Transporte de valores - ISS debido en el lugar de la prestación' },
  '19.03': { local: 'local_ejecucion', regla: 'Monitoreo electrónico - ISS debido en el lugar de la prestación' },
  '19.04': { local: 'local_ejecucion', regla: 'Investigación particular - ISS debido en el lugar de la prestación' },
  '20.01': { local: 'establecimiento_prestador', regla: 'Lavandería - ISS debido en el establecimiento del prestador' },
  '20.02': { local: 'establecimiento_prestador', regla: 'Peluquería y estética - ISS debido en el establecimiento del prestador' },
  '20.03': { local: 'local_ejecucion', regla: 'Servicios funerarios - ISS debido en el lugar de ejecución' },
  '21.01': { local: 'local_ejecucion', regla: 'Hoteles - ISS debido en el lugar del hospedaje' },
  '21.02': { local: 'local_ejecucion', regla: 'Albergues - ISS debido en el lugar del hospedaje' },
  '21.03': { local: 'local_ejecucion', regla: 'Restaurantes - ISS debido en el lugar del establecimiento' },
  '21.04': { local: 'local_ejecucion', regla: 'Bufet y catering - ISS debido en el lugar de ejecución' },
  '22.01': { local: 'local_ejecucion', regla: 'Actividades deportivas - ISS debido en el lugar de ejecución' },
  '22.02': { local: 'local_ejecucion', regla: 'Clubes - ISS debido en el lugar de ejecución' },
  '22.03': { local: 'local_ejecucion', regla: 'Actividades deportivas diversas - ISS debido en el lugar de ejecución' },
  '22.04': { local: 'local_ejecucion', regla: 'Parques de diversión - ISS debido en el lugar de ejecución' },
  '22.05': { local: 'local_ejecucion', regla: 'Casas nocturnas - ISS debido en el lugar de ejecución' },
  '22.06': { local: 'local_ejecucion', regla: 'Juegos y entretenimiento - ISS debido en el lugar de ejecución' },
  '22.07': { local: 'local_ejecucion', regla: 'Entretenimiento - ISS debido en el lugar de ejecución' },
  '22.08': { local: 'local_ejecucion', regla: 'Actividades culturales - ISS debido en el lugar de ejecución' },
  '22.09': { local: 'local_ejecucion', regla: 'Producción audiovisual - ISS debido en el lugar de ejecución' },
  '22.10': { local: 'local_ejecucion', regla: 'Grabación de sonido - ISS debido en el lugar de ejecución' },
  '22.11': { local: 'establecimiento_prestador', regla: 'Radio - ISS debido en el establecimiento del prestador' },
  '22.12': { local: 'establecimiento_prestador', regla: 'Televisión - ISS debido en el establecimiento del prestador' },
  '22.13': { local: 'establecimiento_prestador', regla: 'Telecomunicaciones - ISS debido en el establecimiento del prestador' },
  '22.14': { local: 'establecimiento_prestador', regla: 'Servicios de información - ISS debido en el establecimiento del prestador' },
  '22.15': { local: 'establecimiento_prestador', regla: 'Alquiler de bienes muebles - ISS debido en el establecimiento del prestador' },
  '22.16': { local: 'establecimiento_prestador', regla: 'Alquiler de máquinas - ISS debido en el establecimiento del prestador' },
  '22.17': { local: 'establecimiento_prestador', regla: 'Alquiler de propiedad intelectual - ISS debido en el establecimiento del prestador' },
  '22.18': { local: 'establecimiento_prestador', regla: 'Reclutamiento y selección - ISS debido en el establecimiento del prestador' },
  '22.19': { local: 'local_ejecucion', regla: 'Servicios temporales - ISS debido en el lugar de la prestación' },
  '22.20': { local: 'establecimiento_prestador', regla: 'Gestión de RRHH - ISS debido en el establecimiento del prestador' },
  '22.21': { local: 'establecimiento_prestador', regla: 'Agencias de viaje - ISS debido en el establecimiento del prestador' },
  '22.22': { local: 'local_ejecucion', regla: 'Guías de turismo - ISS debido en el lugar de ejecución' },
  '22.23': { local: 'local_ejecucion', regla: 'Limpieza y conservación - ISS debido en el lugar de ejecución' },
  '22.24': { local: 'local_ejecucion', regla: 'Paisajismo y jardinería - ISS debido en el lugar de ejecución' },
  '23.01': { local: 'establecimiento_prestador', regla: 'Corretaje de inmuebles - ISS debido en el establecimiento del prestador' },
  '23.02': { local: 'local_ejecucion', regla: 'Administración de condominios - ISS debido en el lugar del inmueble' },
  '23.03': { local: 'local_ejecucion', regla: 'Evaluación de inmuebles - ISS debido en el lugar del inmueble' },
};

// CNPJs de entidades inmunes/exentas con CEBAS
const ENTIDADES_CEBAS_CONOCIDAS = ['60833910000106'];

// Servicios que generan obligación de cota patronal cuando se contratan de MEI
const SERVICIOS_COTA_PATRONAL_MEI = [
  'hidráulica', 'electricidad', 'pintura', 'albañilería', 'carpintería',
  'mantenimiento', 'reparación', 'demolición', 'limpieza', 'construcción',
  'albañil', 'plomero', 'electricista', 'pintor', 'servicios generales',
  'conservación', 'celaduría',
];

export interface LocalIss {
  local_pago: string;
  regla_descripcion: string;
  exige_obra_art: boolean;
}

export interface Retencion {
  aliquota: number;
  retener: boolean;
  base_legal: string;
}

export interface Retenciones {
  irrf: Retencion;
  csll: Retencion;
  cofins: Retencion;
  pis: Retencion;
}

export interface CotaPatronal {
  exige_cota_patronal: boolean;
  porcentaje: number;
  recaudacion: string;
  observacion: string;
  base_legal: string;
}

export function clasificarLocalIss(lc116Codigo: string): LocalIss {
  const excepcion = ARTIGO_3_EXCECOES[lc116Codigo];
  if (excepcion) {
    return {
      local_pago: excepcion.local,
      regla_descripcion: excepcion.regla,
      exige_obra_art: ['7.02', '7.03', '7.04', '7.05'].includes(lc116Codigo),
    };
  }
  return {
    local_pago: 'establecimiento_prestador',
    regla_descripcion: 'Regla general: ISS debido en el municipio del establecimiento prestador (Art. 3º LC 116/2003)',
    exige_obra_art: false,
  };
}

export function clasificarRetenciones(simplesNacional: boolean): Retenciones {
  if (simplesNacional) {
    return {
      irrf: { aliquota: 0, retener: false, base_legal: 'LC 123/2006, art. 13' },
      csll: { aliquota: 0, retener: false, base_legal: 'LC 123/2006, art. 13' },
      cofins: { aliquota: 0, retener: false, base_legal: 'LC 123/2006, art. 13' },
      pis: { aliquota: 0, retener: false, base_legal: 'LC 123/2006, art. 13' },
    };
  }
  return {
    irrf: { aliquota: 1.5, retener: true, base_legal: 'IN RFB 2.100/2022, art. 647' },
    csll: { aliquota: 1.0, retener: true, base_legal: 'IN RFB 2.100/2022' },
    cofins: { aliquota: 3.0, retener: true, base_legal: 'IN RFB 2.100/2022' },
    pis: { aliquota: 0.65, retener: true, base_legal: 'IN RFB 2.100/2022' },
  };
}

export function clasificarCotaPatronal(
  prestadorEsMei: boolean,
  descripcionServicio = '',
  cnaeServicio = '',
  cnpjTomador = '',
): CotaPatronal {
  const cnpjLimpio = cnpjTomador.replace(/\D/g, '');
  if (ENTIDADES_CEBAS_CONOCIDAS.includes(cnpjLimpio)) {
    return {
      exige_cota_patronal: false,
      porcentaje: 0,
      recaudacion: 'dispensado',
      observacion: 'Tomador con CEBAS - dispensado de la cota patronal (art. 55 Ley 8.212/91)',
      base_legal: 'Constitución Federal, art. 195, §7º c/c Ley 8.212/91, art. 55',
    };
  }

  if (!prestadorEsMei) {
    return {
      exige_cota_patronal: false,
      porcentaje: 0,
      recaudacion: 'no_aplica',
      observacion: 'Prestador no es MEI. La cota patronal de INSS es debida por el tomador directamente sobre la nómina (20% - art. 22 Ley 8.212/91), no habiendo recaudación específica sobre el valor de la NFSe.',
      base_legal: 'Ley 8.212/91, art. 22',
    };
  }

  const descLower = descripcionServicio.toLowerCase();
  const servicioEspecifico = SERVICIOS_COTA_PATRONAL_MEI.some((p) => descLower.includes(p));

  const cnaeLimpio = cnaeServicio.replace(/\D/g, '');
  const cnaeConstruccion = cnaeLimpio.startsWith('41') || cnaeLimpio.startsWith('42') || cnaeLimpio.startsWith('43') || cnaeLimpio.startsWith('81');

  if (servicioEspecifico || cnaeConstruccion) {
    return {
      exige_cota_patronal: true,
      porcentaje: 20,
      recaudacion: 'tomador_recauda_20',
      observacion: `Prestador MEI prestando servicio de '${descripcionServicio}'. El tomador debe recaudar contribución previsional de 20% sobre el valor de la nota (art. 22, III Ley 8.212/91). El MEI ya recauda 5% vía DAS (art. 18, §5-C LC 123/2006), pero la cota patronal adicional es debida por el tomador.`,
      base_legal: 'CF art. 195, I; Ley 8.212/91, art. 22, III; LC 123/2006, art. 18, §5-C',
    };
  }

  return {
    exige_cota_patronal: false,
    porcentaje: 0,
    recaudacion: 'no_exige',
    observacion: `Prestador MEI, pero el servicio '${descripcionServicio}' no está entre los que generan obligación de cota patronal adicional. El MEI ya recauda 5% vía DAS-MEI.`,
    base_legal: 'LC 123/2006, art. 18, §5-C',
  };
}

export interface ClasificacionFiscal {
  local_iss: LocalIss;
  retenciones: Retenciones;
  cota_patronal: CotaPatronal;
  ibscbs: {
    cst: string;
    cindop: string;
    aliquota_ibs: number;
    aliquota_cbs: number;
    base_legal: string;
    periodo_transicion: string;
  };
}

export function clasificarIbscbs(): ClasificacionFiscal['ibscbs'] {
  return {
    cst: '000',
    cindop: '100401',
    aliquota_ibs: 0.1,
    aliquota_cbs: 0.9,
    base_legal: 'EC 132/2023, PLP 68/2024',
    periodo_transicion: '2026-2033',
  };
}

export function formatearClasificacionParaLlm(params: {
  lc116Codigo: string;
  simplesNacional: boolean;
  ciudadServicio: string;
  ufServicio: string;
  ciudadPrestador?: string;
  cnpjTomador?: string;
  valorServicio?: number;
  cnaeServicio?: string;
  descripcionServicio?: string;
  prestadorEsMei?: boolean;
}): string {
  const localIss = clasificarLocalIss(params.lc116Codigo);
  const retenciones = clasificarRetenciones(params.simplesNacional);
  const ibscbs = clasificarIbscbs();
  const cotaPatronal = clasificarCotaPatronal(
    params.prestadorEsMei || false,
    params.descripcionServicio || '',
    params.cnaeServicio || '',
    params.cnpjTomador || '',
  );

  const partes: string[] = [
    '## Clasificación Fiscal Detallada',
    '',
    '### Lugar de Pago del ISS (Art. 3º LC 116/2003)',
    `Regla: ${localIss.regla_descripcion}`,
    `Lugar de pago: ${localIss.local_pago}`,
    `Exige ART/CREA: ${localIss.exige_obra_art ? 'Sí' : 'No'}`,
    '',
  ];

  if (localIss.local_pago === 'local_ejecucion' && params.ciudadPrestador && params.ciudadPrestador !== params.ciudadServicio) {
    partes.push(
      `⚠️ ATENCIÓN: El servicio se ejecuta en ${params.ciudadServicio}/${params.ufServicio}, ` +
      `pero el prestador está en ${params.ciudadPrestador}. El ISS debe pagarse ` +
      `en el municipio de ejecución (${params.ciudadServicio}).`,
      '',
    );
  }

  partes.push('### Retenciones Federales (IN RFB 2.100/2022)');
  if (params.simplesNacional) {
    partes.push('Empresa optante del Simples Nacional → No hay retención de tributos federales.');
    partes.push('Base legal: LC 123/2006, art. 13');
  } else {
    partes.push('Empresa NO optante del Simples Nacional → Sujeta a retenciones:');
    for (const [tributo, datos] of Object.entries(retenciones)) {
      if (datos.retener) {
        partes.push(`- ${tributo.toUpperCase()}: ${datos.aliquota}% - ${datos.base_legal}`);
        if (params.valorServicio && params.valorServicio > 0) {
          const valorRetener = Math.round(params.valorServicio * datos.aliquota / 100 * 100) / 100;
          partes.push(`  → R$ ${valorRetener.toFixed(2)} sobre R$ ${params.valorServicio.toFixed(2)}`);
        }
      }
    }
    partes.push('', 'Estos tributos DEBEN destacarse en la NFSe cuando el tomador sea persona jurídica.');
    partes.push('La falta de destaque puede generar multa y responsabilidad solidaria.');
  }

  partes.push('', '### INSS - Cota Patronal (art. 195, I, CF)');
  partes.push(`Exige cota patronal: ${cotaPatronal.exige_cota_patronal ? 'Sí' : 'No'}`);
  if (cotaPatronal.porcentaje > 0) {
    partes.push(`Porcentaje: ${cotaPatronal.porcentaje}% sobre el valor`);
  }
  partes.push(`Recaudación: ${cotaPatronal.recaudacion}`);
  partes.push(`Observación: ${cotaPatronal.observacion}`);
  partes.push(`Base legal: ${cotaPatronal.base_legal}`);

  partes.push('', '### IBS/CBS - Reforma Tributaria (EC 132/2023)');
  partes.push(`CST: ${ibscbs.cst} | cIndOp: ${ibscbs.cindop}`);
  partes.push(`Alícuota IBS sugerida: ${ibscbs.aliquota_ibs}% | CBS: ${ibscbs.aliquota_cbs}%`);
  partes.push(`Período de transición: ${ibscbs.periodo_transicion}`);
  partes.push(`Base legal: ${ibscbs.base_legal}`);

  return partes.join('\n');
}