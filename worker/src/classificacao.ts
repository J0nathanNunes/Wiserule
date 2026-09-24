/**
 * Classificação Fiscal Wiserule.
 * Equivalente a backend/classificacao_fiscal.py em Python.
 *
 * Integra:
 * - LC 116/2003 (itens e exceções Art. 3º)
 * - CSN, CTM, NBS, CNAE
 * - Retenções federais (IRRF, CSLL, COFINS, PIS)
 * - INSS Cota Patronal (art. 22 Lei 8.212/91)
 * - CEBAS (Isenção de INSS)
 * - IBS/CBS (reforma tributária)
 * - Local de pagamento do ISS (Art. 3º LC 116/2003)
 */

// Exceções do Art. 3º LC 116/2003
const ARTIGO_3_EXCECOES: Record<string, { local: string; regla: string }> = {
  '01.01': { local: 'local_ejecucion', regla: 'Serviços de informática - ISS devido no local de execução quando houver cessão de mão de obra' },
  '01.02': { local: 'establecimiento_prestador', regla: 'Desenvolvimento sob encomenda - ISS devido no estabelecimento do prestador' },
  '01.06': { local: 'establecimiento_prestador', regla: 'Serviços técnicos em TI - ISS devido no estabelecimento do prestador' },
  '01.07': { local: 'local_ejecucion', regla: 'Manutenção de equipamentos - ISS devido onde o serviço for executado' },
  '03.01': { local: 'local_ejecucion', regla: 'Serviços de saúde - ISS devido no local de execução' },
  '03.02': { local: 'local_ejecucion', regla: 'Serviços médicos e odontológicos - ISS devido no local de execução' },
  '03.03': { local: 'local_ejecucion', regla: 'Serviços de fisioterapia - ISS devido no local de execução' },
  '03.04': { local: 'establecimiento_prestador', regla: 'Serviços de laboratório - ISS devido no estabelecimento do prestador' },
  '03.05': { local: 'local_ejecucion', regla: 'Serviços veterinários - ISS devido no local de execução' },
  '04.01': { local: 'local_ejecucion', regla: 'Serviços de saúde hospitalar - ISS devido no local de execução' },
  '04.02': { local: 'local_ejecucion', regla: 'Serviços médicos - ISS devido no local de execução' },
  '04.03': { local: 'local_ejecucion', regla: 'Serviços de enfermagem - ISS devido no local de execução' },
  '04.04': { local: 'establecimiento_prestador', regla: 'Serviços de laboratório - ISS devido no estabelecimento do prestador' },
  '04.05': { local: 'local_ejecucion', regla: 'Serviços veterinários - ISS devido no local de execução' },
  '05.01': { local: 'local_ejecucion', regla: 'Serviços de planos de saúde - ISS devido no domicílio do tomador' },
  '07.02': { local: 'local_ejecucion', regla: 'Execução de obras de construção civil - ISS devido no local da obra' },
  '07.03': { local: 'local_ejecucion', regla: 'Acabamentos - ISS devido no local da obra' },
  '07.04': { local: 'local_ejecucion', regla: 'Serviços auxiliares da construção - ISS devido no local da obra' },
  '07.05': { local: 'local_ejecucion', regla: 'Reparação, conservação e reforma de edifícios, estradas, pontes, portos e congêneres - ISS devido no local da execução, conforme art. 3º, V, da LC 116/2003' },
  '07.10': { local: 'local_ejecucion', regla: 'Limpeza, manutenção e conservação de vias, imóveis, parques e jardins - ISS devido no local da execução, conforme art. 3º, VII, da LC 116/2003' },
  '13.05': { local: 'establecimiento_prestador', regla: 'Composição gráfica, inclusive confecção de impressos gráficos, exceto os destinados a posterior operação de comercialização ou industrialização - regra geral do art. 3º da LC 116/2003' },
  '07.16': { local: 'local_ejecucion', regla: 'Instalações - ISS devido no local de execução' },
  '07.17': { local: 'local_ejecucion', regla: 'Montagem industrial - ISS devido no local de execução' },
  '10.01': { local: 'local_ejecucion', regla: 'Serviços de transporte - ISS devido no local da prestação' },
  '10.02': { local: 'local_ejecucion', regla: 'Serviços de transporte de valores - ISS devido no local da prestação' },
  '10.03': { local: 'local_ejecucion', regla: 'Serviços de transporte de pessoas - ISS devido no local da prestação' },
  '10.04': { local: 'local_ejecucion', regla: 'Serviços de transporte de cargas - ISS devido no local da prestação' },
  '10.05': { local: 'local_ejecucion', regla: 'Organização de eventos - ISS devido no local do evento' },
  '11.01': { local: 'establecimiento_prestador', regla: 'Serviços educacionais - ISS devido no estabelecimento do prestador' },
  '11.02': { local: 'establecimiento_prestador', regla: 'Ensino a distância - ISS devido no estabelecimento do prestador' },
  '11.03': { local: 'establecimiento_prestador', regla: 'Cursos livres - ISS devido no estabelecimento do prestador' },
  '12.01': { local: 'establecimiento_prestador', regla: 'Serviços de consultoria - ISS devido no estabelecimento do prestador' },
  '12.02': { local: 'establecimiento_prestador', regla: 'Serviços jurídicos - ISS devido no estabelecimento do prestador' },
  '12.03': { local: 'establecimiento_prestador', regla: 'Serviços de cartório - ISS devido no estabelecimento do prestador' },
  '12.04': { local: 'establecimiento_prestador', regla: 'Serviços contábeis - ISS devido no estabelecimento do prestador' },
  '12.05': { local: 'establecimiento_prestador', regla: 'Serviços de apoio administrativo - ISS devido no estabelecimento do prestador' },
  '12.06': { local: 'establecimiento_prestador', regla: 'Serviços de escritório - ISS devido no estabelecimento do prestador' },
  '12.07': { local: 'establecimiento_prestador', regla: 'Telemarketing - ISS devido no estabelecimento do prestador' },
  '12.08': { local: 'establecimiento_prestador', regla: 'Serviços de fotografia e tradução - ISS devido no estabelecimento do prestador' },
  '12.09': { local: 'establecimiento_prestador', regla: 'Serviços diversos - ISS devido no estabelecimento do prestador' },
  '14.01': { local: 'local_ejecucion', regla: 'Manutenção de máquinas - ISS devido no local de execução' },
  '14.02': { local: 'local_ejecucion', regla: 'Manutenção de equipamentos - ISS devido no local de execução' },
  '14.03': { local: 'local_ejecucion', regla: 'Manutenção de veículos - ISS devido no local de execução' },
  '14.04': { local: 'local_ejecucion', regla: 'Manutenção de equipamentos diversos - ISS devido no local de execução' },
  '14.05': { local: 'local_ejecucion', regla: 'Manutenção de veículos automotores - ISS devido no local de execução' },
  '14.06': { local: 'local_ejecucion', regla: 'Manutenção de eletrodomésticos - ISS devido no local de execução' },
  '16.01': { local: 'local_ejecucion', regla: 'Transporte rodoviário - ISS devido no local da prestação' },
  '16.02': { local: 'local_ejecucion', regla: 'Transporte aquaviário - ISS devido no local da prestação' },
  '16.03': { local: 'local_ejecucion', regla: 'Transporte aéreo - ISS devido no local da prestação' },
  '16.04': { local: 'local_ejecucion', regla: 'Armazenamento - ISS devido no local da prestação' },
  '16.05': { local: 'local_ejecucion', regla: 'Serviços auxiliares de transporte - ISS devido no local da prestação' },
  '17.01': { local: 'establecimiento_prestador', regla: 'Consultoria empresarial - ISS devido no estabelecimento do prestador' },
  '17.02': { local: 'establecimiento_prestador', regla: 'Serviços jurídicos - ISS devido no estabelecimento do prestador' },
  '17.03': { local: 'establecimiento_prestador', regla: 'Serviços de cartório - ISS devido no estabelecimento do prestador' },
  '17.04': { local: 'establecimiento_prestador', regla: 'Serviços contábeis - ISS devido no estabelecimento do prestador' },
  '17.05': { local: 'establecimiento_prestador', regla: 'Serviços de apoio administrativo - ISS devido no estabelecimento do prestador' },
  '17.06': { local: 'establecimiento_prestador', regla: 'Serviços de escritório - ISS devido no estabelecimento do prestador' },
  '17.07': { local: 'establecimiento_prestador', regla: 'Telemarketing - ISS devido no estabelecimento do prestador' },
  '17.08': { local: 'establecimiento_prestador', regla: 'Serviços de fotografia, tradução, cobrança - ISS devido no estabelecimento do prestador' },
  '17.09': { local: 'establecimiento_prestador', regla: 'Outros serviços - ISS devido no estabelecimento do prestador' },
  '17.10': { local: 'local_ejecucion', regla: 'Publicidade e propaganda - ISS devido no local de execução quando houver veiculação' },
  '19.01': { local: 'local_ejecucion', regla: 'Vigilância e segurança - ISS devido no local da prestação do serviço' },
  '19.02': { local: 'local_ejecucion', regla: 'Transporte de valores - ISS devido no local da prestação' },
  '19.03': { local: 'local_ejecucion', regla: 'Monitoramento eletrônico - ISS devido no local da prestação' },
  '19.04': { local: 'local_ejecucion', regla: 'Investigação particular - ISS devido no local da prestação' },
  '20.01': { local: 'establecimiento_prestador', regla: 'Lavanderia - ISS devido no estabelecimento do prestador' },
  '20.02': { local: 'establecimiento_prestador', regla: 'Cabeleireiro e estética - ISS devido no estabelecimento do prestador' },
  '20.03': { local: 'local_ejecucion', regla: 'Serviços funerários - ISS devido no local de execução' },
  '21.01': { local: 'local_ejecucion', regla: 'Hotéis - ISS devido no local da hospedagem' },
  '21.02': { local: 'local_ejecucion', regla: 'Albergues - ISS devido no local da hospedagem' },
  '21.03': { local: 'local_ejecucion', regla: 'Restaurantes - ISS devido no local do estabelecimento' },
  '21.04': { local: 'local_ejecucion', regla: 'Bufê e catering - ISS devido no local de execução' },
  '22.01': { local: 'local_ejecucion', regla: 'Atividades esportivas - ISS devido no local de execução' },
  '22.02': { local: 'local_ejecucion', regla: 'Clubes - ISS devido no local de execução' },
  '22.03': { local: 'local_ejecucion', regla: 'Atividades esportivas diversas - ISS devido no local de execução' },
  '22.04': { local: 'local_ejecucion', regla: 'Parques de diversão - ISS devido no local de execução' },
  '22.05': { local: 'local_ejecucion', regla: 'Casas noturnas - ISS devido no local de execução' },
  '22.06': { local: 'local_ejecucion', regla: 'Jogos e entretenimento - ISS devido no local de execução' },
  '22.07': { local: 'local_ejecucion', regla: 'Entretenimento - ISS devido no local de execução' },
  '22.08': { local: 'local_ejecucion', regla: 'Atividades culturais - ISS devido no local de execução' },
  '22.09': { local: 'local_ejecucion', regla: 'Produção audiovisual - ISS devido no local de execução' },
  '22.10': { local: 'local_ejecucion', regla: 'Gravação de som - ISS devido no local de execução' },
  '22.11': { local: 'establecimiento_prestador', regla: 'Rádio - ISS devido no estabelecimento do prestador' },
  '22.12': { local: 'establecimiento_prestador', regla: 'Televisão - ISS devido no estabelecimento do prestador' },
  '22.13': { local: 'establecimiento_prestador', regla: 'Telecomunicações - ISS devido no estabelecimento do prestador' },
  '22.14': { local: 'establecimiento_prestador', regla: 'Serviços de informação - ISS devido no estabelecimento do prestador' },
  '22.15': { local: 'establecimiento_prestador', regla: 'Aluguel de bens móveis - ISS devido no estabelecimento do prestador' },
  '22.16': { local: 'establecimiento_prestador', regla: 'Aluguel de máquinas - ISS devido no estabelecimento do prestador' },
  '22.17': { local: 'establecimiento_prestador', regla: 'Aluguel de propriedade intelectual - ISS devido no estabelecimento do prestador' },
  '22.18': { local: 'establecimiento_prestador', regla: 'Recrutamento e seleção - ISS devido no estabelecimento do prestador' },
  '22.19': { local: 'local_ejecucion', regla: 'Serviços temporários - ISS devido no local da prestação' },
  '22.20': { local: 'establecimiento_prestador', regla: 'Gestão de RH - ISS devido no estabelecimento do prestador' },
  '22.21': { local: 'establecimiento_prestador', regla: 'Agências de viagem - ISS devido no estabelecimento do prestador' },
  '22.22': { local: 'local_ejecucion', regla: 'Guias de turismo - ISS devido no local de execução' },
  '22.23': { local: 'local_ejecucion', regla: 'Limpeza e conservação - ISS devido no local de execução' },
  '22.24': { local: 'local_ejecucion', regla: 'Paisagismo e jardinagem - ISS devido no local de execução' },
  '23.01': { local: 'establecimiento_prestador', regla: 'Corretagem de imóveis - ISS devido no estabelecimento do prestador' },
  '23.02': { local: 'local_ejecucion', regla: 'Administração de condomínios - ISS devido no local do imóvel' },
  '23.03': { local: 'local_ejecucion', regla: 'Avaliação de imóveis - ISS devido no local do imóvel' },
};

// CNPJs de entidades imunes/isentas com CEBAS
const ENTIDADES_CEBAS_CONOCIDAS = ['60833910000106'];

// Serviços que geram obrigação de cota patronal quando contratados de MEI
const SERVICIOS_COTA_PATRONAL_MEI = [
  'hidráulica', 'eletricidade', 'pintura', 'alvenaria', 'carpintaria',
  'manutenção', 'reparação', 'demolição', 'limpeza', 'construção',
  'pedreiro', 'encanador', 'eletricista', 'pintor', 'serviços gerais',
  'conservação', 'zeladoria',
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
  const codigoNormalizado = lc116Codigo.replace(/^(\d)\.(\d{2})$/, '0$1.$2');
  const excepcion = ARTIGO_3_EXCECOES[codigoNormalizado];
  if (excepcion) {
    return {
      local_pago: excepcion.local,
      regla_descripcion: excepcion.regla,
      exige_obra_art: ['07.02', '07.03', '07.04', '07.05'].includes(codigoNormalizado),
    };
  }
  return {
    local_pago: 'establecimiento_prestador',
    regla_descripcion: 'Regra geral: ISS devido no município do estabelecimento prestador (Art. 3º LC 116/2003)',
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
      observacion: 'Tomador com CEBAS - dispensado da cota patronal (art. 55 Lei 8.212/91)',
      base_legal: 'Constituição Federal, art. 195, §7º c/c Lei 8.212/91, art. 55',
    };
  }

  if (!prestadorEsMei) {
    return {
      exige_cota_patronal: false,
      porcentaje: 0,
      recaudacion: 'no_aplica',
      observacion: 'Prestador não é MEI. A cota patronal de INSS é devida pelo tomador diretamente sobre a folha (20% - art. 22 Lei 8.212/91), não havendo arrecadação específica sobre o valor da NFSe.',
      base_legal: 'Lei 8.212/91, art. 22',
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
      observacion: `Prestador MEI prestando serviço de '${descripcionServicio}'. O tomador deve arrecadar contribuição previdenciária de 20% sobre o valor da nota (art. 22, III Lei 8.212/91). O MEI já arrecada 5% via DAS (art. 18, §5-C LC 123/2006), mas a cota patronal adicional é devida pelo tomador.`,
      base_legal: 'CF art. 195, I; Ley 8.212/91, art. 22, III; LC 123/2006, art. 18, §5-C',
    };
  }

  return {
    exige_cota_patronal: false,
    porcentaje: 0,
    recaudacion: 'no_exige',
    observacion: `Prestador MEI, mas o serviço '${descripcionServicio}' não está entre os que geram obrigação de cota patronal adicional. O MEI já arrecada 5% via DAS-MEI.`,
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
    '## Classificação Fiscal Detalhada',
    '',
    '### Local de Pagamento do ISS (Art. 3º LC 116/2003)',
    ...(params.lc116Codigo ? [] : ['Item da LC 116 não identificado com segurança; regra de local de incidência pendente de validação manual.', '']),
    `Regra: ${localIss.regla_descripcion}`,
    `Local de pagamento: ${localIss.local_pago}`,
    `Exige ART/CREA: ${localIss.exige_obra_art ? 'Sim' : 'Não'}`,
    '',
  ];

  if (localIss.local_pago === 'local_ejecucion' && params.ciudadPrestador && params.ciudadPrestador !== params.ciudadServicio) {
    partes.push(
      `⚠️ ATENÇÃO: O serviço é executado em ${params.ciudadServicio}/${params.ufServicio}, ` +
      `mas o prestador está em ${params.ciudadPrestador}. O ISS deve ser pago ` +
      `no município de execução (${params.ciudadServicio}).`,
      '',
    );
  }

  partes.push('### Retenções Federais (IN RFB 2.100/2022)');
  if (params.simplesNacional) {
    partes.push('Empresa optante do Simples Nacional → avaliar as dispensas de retenção conforme regime, natureza do serviço e legislação aplicável; não presumir dispensa universal para todos os tributos.');
    partes.push('Base legal: LC 123/2006, art. 13');
  } else {
    partes.push('Empresa NÃO optante do Simples Nacional → Sujeita a retenções:');
    for (const [tributo, datos] of Object.entries(retenciones)) {
      if (datos.retener) {
        partes.push(`- ${tributo.toUpperCase()}: ${datos.aliquota}% - ${datos.base_legal}`);
        if (params.valorServicio && params.valorServicio > 0) {
          const valorRetener = Math.round(params.valorServicio * datos.aliquota / 100 * 100) / 100;
          partes.push(`  → R$ ${valorRetener.toFixed(2)} sobre R$ ${params.valorServicio.toFixed(2)}`);
        }
      }
    }
    partes.push('', 'Estes tributos DEVEM ser destacados na NFSe quando o tomador for pessoa jurídica.');
    partes.push('A falta de destaque pode gerar multa e responsabilidade solidária.');
  }

  partes.push('', '### INSS - Cota Patronal (art. 195, I, CF)');
  partes.push(`Exige cota patronal: ${cotaPatronal.exige_cota_patronal ? 'Sim' : 'Não'}`);
  if (cotaPatronal.porcentaje > 0) {
    partes.push(`Percentual: ${cotaPatronal.porcentaje}% sobre o valor`);
  }
  partes.push(`Arrecadação: ${cotaPatronal.recaudacion}`);
  partes.push(`Observação: ${cotaPatronal.observacion}`);
  partes.push(`Base legal: ${cotaPatronal.base_legal}`);

  partes.push('', '### IBS/CBS - Reforma Tributária (EC 132/2023)');
  partes.push(`CST: ${ibscbs.cst} | cIndOp: ${ibscbs.cindop}`);
  partes.push(`Alíquota IBS sugerida: ${ibscbs.aliquota_ibs}% | CBS: ${ibscbs.aliquota_cbs}%`);
  partes.push(`Período de transição: ${ibscbs.periodo_transicion}`);
  partes.push(`Base legal: ${ibscbs.base_legal}`);

  return partes.join('\n');
}