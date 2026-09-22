/**
 * Correlación entre servicios, LC 116/2003, NBS y CNAE.
 * Equivalente a backend/correlacao_interna.py en Python.
 */

export interface Correlacion {
  lc116: string;
  descripcion: string;
  nbs: string;
  csn: string;
  fuente: string;
}

// Mapeo CNAE → LC 116/2003 (datos públicos IBGE/Concla + LC 116)
const CNAE_LC116_MAP: Record<string, { lc116: string; descripcion: string; nbs?: string }> = {
  // INFORMÁTICA Y TI
  '6201': { lc116: '01.02', descripcion: 'Desarrollo de programas de computador bajo pedido', nbs: '1.01' },
  '6202': { lc116: '01.03', descripcion: 'Procesamiento de datos y proveedores', nbs: '1.04' },
  '6203': { lc116: '01.04', descripcion: 'Hospedaje de sitios y servicios de TI', nbs: '1.04' },
  '6204': { lc116: '01.05', descripcion: 'Consultoría en TI', nbs: '1.03' },
  '620': { lc116: '01.06', descripcion: 'Servicios técnicos en informática', nbs: '1.00' },
  '6311': { lc116: '01.04', descripcion: 'Procesamiento de datos', nbs: '1.04' },
  '6319': { lc116: '01.04', descripcion: 'Otros servicios de TI', nbs: '1.04' },
  '951': { lc116: '01.07', descripcion: 'Mantenimiento de equipos de informática', nbs: '1.05' },
  '9511': { lc116: '01.07', descripcion: 'Mantenimiento de computadoras', nbs: '1.05' },
  '9512': { lc116: '01.07', descripcion: 'Mantenimiento de equipos periféricos', nbs: '1.05' },

  // CONSULTORÍA Y ADMINISTRACIÓN
  '702': { lc116: '17.01', descripcion: 'Consultoría empresarial', nbs: '12.01' },
  '7020': { lc116: '17.01', descripcion: 'Consultoría empresarial', nbs: '12.01' },
  '6911': { lc116: '17.02', descripcion: 'Servicios jurídicos', nbs: '12.02' },
  '6912': { lc116: '17.03', descripcion: 'Servicios de notaría', nbs: '12.03' },
  '692': { lc116: '17.04', descripcion: 'Servicios de contabilidad', nbs: '12.04' },
  '6920': { lc116: '17.04', descripcion: 'Servicios de contabilidad', nbs: '12.04' },
  '7490': { lc116: '17.05', descripcion: 'Servicios de apoyo administrativo', nbs: '12.05' },
  '821': { lc116: '17.06', descripcion: 'Servicios de oficina y apoyo', nbs: '12.06' },
  '8211': { lc116: '17.06', descripcion: 'Servicios combinados de oficina', nbs: '12.06' },
  '8219': { lc116: '17.06', descripcion: 'Fotocopias y otros servicios', nbs: '12.06' },
  '822': { lc116: '17.07', descripcion: 'Telemarketing y call center', nbs: '12.07' },
  '8220': { lc116: '17.07', descripcion: 'Telemarketing y call center', nbs: '12.07' },

  // PUBLICIDAD Y MARKETING
  '731': { lc116: '17.10', descripcion: 'Publicidad y propaganda', nbs: '12.10' },
  '7310': { lc116: '17.10', descripcion: 'Publicidad y propaganda', nbs: '12.10' },
  '7319': { lc116: '17.10', descripcion: 'Publicidad y propaganda', nbs: '12.10' },
  '7410': { lc116: '17.11', descripcion: 'Diseño y decoración', nbs: '12.11' },

  // EVENTOS Y ORGANIZACIÓN
  '823': { lc116: '17.10', descripcion: 'Organización de ferias y congresos', nbs: '12.10' },
  '8230': { lc116: '17.10', descripcion: 'Organización de ferias y congresos', nbs: '12.10' },
  '799': { lc116: '10.05', descripcion: 'Organización de eventos', nbs: '6.05' },
  '7990': { lc116: '10.05', descripcion: 'Organización de eventos', nbs: '6.05' },

  // CONSTRUCCIÓN CIVIL
  '41': { lc116: '7.02', descripcion: 'Construção civil (execução de obras)', nbs: '5.02' },
  '410': { lc116: '7.02', descripcion: 'Construcción civil', nbs: '5.02' },
  '4110': { lc116: '7.02', descripcion: 'Incorporación de inmuebles', nbs: '5.02' },
  '4120': { lc116: '7.02', descripcion: 'Construcción de edificios', nbs: '5.02' },
  '42': { lc116: '7.02', descripcion: 'Obras de infraestrutura', nbs: '5.02' },
  '43': { lc116: '7.02', descripcion: 'Servicios especializados para construcción', nbs: '5.02' },
  '432': { lc116: '7.02', descripcion: 'Instalaciones eléctricas e hidráulicas', nbs: '5.02' },
  '433': { lc116: '7.03', descripcion: 'Acabados en construcción', nbs: '5.03' },
  '439': { lc116: '7.04', descripcion: 'Otros servicios de construcción', nbs: '5.04' },
  '711': { lc116: '7.05', descripcion: 'Projetos de arquitetura e ingeniería', nbs: '5.05' },
  '7111': { lc116: '7.05', descripcion: 'Projetos de arquitetura', nbs: '5.05' },
  '7112': { lc116: '7.05', descripcion: 'Proyectos de ingeniería', nbs: '5.05' },
  '7119': { lc116: '7.05', descripcion: 'Proyectos técnicos diversos', nbs: '5.05' },

  // MANTENIMIENTO
  '331': { lc116: '14.01', descripcion: 'Mantenimiento de máquinas y equipos', nbs: '10.01' },
  '3311': { lc116: '14.01', descripcion: 'Mantenimiento de equipos industriales', nbs: '10.01' },
  '3312': { lc116: '14.01', descripcion: 'Mantenimiento de equipos electrónicos', nbs: '10.01' },
  '3313': { lc116: '14.02', descripcion: 'Mantenimiento de máquinas agrícolas', nbs: '10.02' },
  '3314': { lc116: '14.03', descripcion: 'Mantenimiento de equipos de transporte', nbs: '10.03' },
  '3315': { lc116: '14.04', descripcion: 'Mantenimiento de equipos diversos', nbs: '10.04' },
  '452': { lc116: '14.05', descripcion: 'Mantenimiento de vehículos', nbs: '10.05' },
  '4520': { lc116: '14.05', descripcion: 'Mantenimiento de vehículos', nbs: '10.05' },
  '953': { lc116: '14.06', descripcion: 'Mantenimiento de equipos domésticos', nbs: '10.06' },
  '9531': { lc116: '14.06', descripcion: 'Mantenimiento de electrodomésticos', nbs: '10.06' },
  '9532': { lc116: '14.07', descripcion: 'Mantenimiento de muebles y objetos', nbs: '10.07' },
  '954': { lc116: '14.08', descripcion: 'Mantenimiento de bicicletas y otros', nbs: '10.08' },

  // EDUCACIÓN
  '85': { lc116: '11.01', descripcion: 'Servicios educativos', nbs: '7.01' },
  '851': { lc116: '11.01', descripcion: 'Educación infantil y fundamental', nbs: '7.01' },
  '852': { lc116: '11.01', descripcion: 'Enseñanza media', nbs: '7.01' },
  '853': { lc116: '11.01', descripcion: 'Enseñanza superior', nbs: '7.01' },
  '854': { lc116: '11.02', descripcion: 'Educación profesional', nbs: '7.02' },
  '855': { lc116: '11.03', descripcion: 'Cursos libres e idiomas', nbs: '7.03' },
  '8550': { lc116: '11.03', descripcion: 'Cursos libres e idiomas', nbs: '7.03' },
  '859': { lc116: '11.04', descripcion: 'Otros servicios de enseñanza', nbs: '7.04' },
  '8591': { lc116: '11.04', descripcion: 'Enseñanza de deportes y artes', nbs: '7.04' },
  '8592': { lc116: '11.04', descripcion: 'Enseñanza especializada', nbs: '7.04' },
  '8593': { lc116: '11.04', descripcion: 'Enseñanza profesionalizante', nbs: '7.04' },
  '8599': { lc116: '11.04', descripcion: 'Otros servicios de enseñanza', nbs: '7.04' },

  // SALUD
  '86': { lc116: '4.01', descripcion: 'Servicios de salud', nbs: '3.01' },
  '861': { lc116: '4.01', descripcion: 'Actividades hospitalarias', nbs: '3.01' },
  '862': { lc116: '4.02', descripcion: 'Servicios médicos y odontológicos', nbs: '3.02' },
  '8621': { lc116: '4.02', descripcion: 'Servicios médicos', nbs: '3.02' },
  '8622': { lc116: '4.02', descripcion: 'Servicios odontológicos', nbs: '3.02' },
  '863': { lc116: '4.03', descripcion: 'Servicios de fisioterapia y enfermería', nbs: '3.03' },
  '8630': { lc116: '4.03', descripcion: 'Servicios de fisioterapia', nbs: '3.03' },
  '864': { lc116: '4.04', descripcion: 'Servicios de laboratorio y diagnóstico', nbs: '3.04' },
  '8640': { lc116: '4.04', descripcion: 'Servicios de laboratorio', nbs: '3.04' },
  '865': { lc116: '4.05', descripcion: 'Servicios veterinarios', nbs: '3.05' },
  '8650': { lc116: '4.05', descripcion: 'Servicios veterinarios', nbs: '3.05' },
  '869': { lc116: '4.06', descripcion: 'Otros servicios de salud', nbs: '3.06' },

  // TRANSPORTE
  '49': { lc116: '16.01', descripcion: 'Transporte rodoviario', nbs: '11.01' },
  '491': { lc116: '16.01', descripcion: 'Transporte ferroviario', nbs: '11.01' },
  '492': { lc116: '16.01', descripcion: 'Transporte rodoviario de cargas', nbs: '11.01' },
  '4921': { lc116: '16.01', descripcion: 'Transporte rodoviario de cargas', nbs: '11.01' },
  '4922': { lc116: '16.01', descripcion: 'Transporte rodoviario de pasajeros', nbs: '11.01' },
  '493': { lc116: '16.01', descripcion: 'Transporte dutoviario', nbs: '11.01' },
  '494': { lc116: '16.01', descripcion: 'Transporte acuaviario', nbs: '11.01' },
  '495': { lc116: '16.01', descripcion: 'Transporte aéreo', nbs: '11.01' },
  '50': { lc116: '16.02', descripcion: 'Transporte acuaviario', nbs: '11.02' },
  '51': { lc116: '16.03', descripcion: 'Transporte aéreo', nbs: '11.03' },
  '521': { lc116: '16.04', descripcion: 'Almacenamiento y logística', nbs: '11.04' },
  '5211': { lc116: '16.04', descripcion: 'Almacenamiento', nbs: '11.04' },
  '5212': { lc116: '16.04', descripcion: 'Carga y descarga', nbs: '11.04' },
  '522': { lc116: '16.05', descripcion: 'Actividades auxiliares de transporte', nbs: '11.05' },
  '5221': { lc116: '16.05', descripcion: 'Servicios de agenciamiento de cargas', nbs: '11.05' },
  '5222': { lc116: '16.06', descripcion: 'Servicios de estacionamiento', nbs: '11.06' },
  '5223': { lc116: '16.07', descripcion: 'Servicios de peaje', nbs: '11.07' },
  '5229': { lc116: '16.08', descripcion: 'Otros servicios auxiliares', nbs: '11.08' },
  '525': { lc116: '16.09', descripcion: 'Correos y entregas', nbs: '11.09' },
  '5250': { lc116: '16.09', descripcion: 'Correos y entregas', nbs: '11.09' },
  '531': { lc116: '16.10', descripcion: 'Correos', nbs: '11.10' },
  '532': { lc116: '16.11', descripcion: 'Servicios de entregas', nbs: '11.11' },
  '5320': { lc116: '16.11', descripcion: 'Servicios de entregas', nbs: '11.11' },

  // HOSPEDAJE Y ALIMENTACIÓN
  '551': { lc116: '21.01', descripcion: 'Hoteles y posadas (hospedaje)', nbs: '15.01' },
  '5510': { lc116: '21.01', descripcion: 'Hoteles y posadas', nbs: '15.01' },
  '552': { lc116: '21.02', descripcion: 'Albergues y camping', nbs: '15.02' },
  '553': { lc116: '21.03', descripcion: 'Restaurantes y servicios de alimentación', nbs: '15.03' },
  '561': { lc116: '21.03', descripcion: 'Restaurantes y similares', nbs: '15.03' },
  '5611': { lc116: '21.03', descripcion: 'Restaurantes', nbs: '15.03' },
  '5612': { lc116: '21.03', descripcion: 'Loncherías y servicios de alimentación', nbs: '15.03' },
  '562': { lc116: '21.04', descripcion: 'Catering y bufet', nbs: '15.04' },
  '5620': { lc116: '21.04', descripcion: 'Catering y bufet', nbs: '15.04' },

  // SERVICIOS PERSONALES
  '960': { lc116: '20.01', descripcion: 'Servicios personales diversos', nbs: '14.01' },
  '9601': { lc116: '20.01', descripcion: 'Lavandería y tintorería', nbs: '14.01' },
  '9602': { lc116: '20.02', descripcion: 'Peluquería y estética', nbs: '14.02' },
  '9603': { lc116: '20.03', descripcion: 'Actividades funerarias', nbs: '14.03' },
  '9609': { lc116: '20.04', descripcion: 'Otros servicios personales', nbs: '14.04' },
  '970': { lc116: '20.05', descripcion: 'Servicios domésticos', nbs: '14.05' },
  '9700': { lc116: '20.05', descripcion: 'Servicios domésticos', nbs: '14.05' },

  // SEGURIDAD
  '801': { lc116: '19.01', descripcion: 'Vigilancia y seguridad privada', nbs: '13.01' },
  '8011': { lc116: '19.01', descripcion: 'Vigilancia patrimonial', nbs: '13.01' },
  '8012': { lc116: '19.02', descripcion: 'Transporte de valores', nbs: '13.02' },
  '802': { lc116: '19.03', descripcion: 'Monitoreo y alarmas', nbs: '13.03' },
  '8020': { lc116: '19.03', descripcion: 'Monitoreo electrónico', nbs: '13.03' },
  '803': { lc116: '19.04', descripcion: 'Investigación particular', nbs: '13.04' },
  '8030': { lc116: '19.04', descripcion: 'Investigación particular', nbs: '13.04' },

  // DEPORTES Y OCIO
  '931': { lc116: '22.01', descripcion: 'Actividades deportivas', nbs: '16.01' },
  '9311': { lc116: '22.01', descripcion: 'Gimnasia y fitness', nbs: '16.01' },
  '9312': { lc116: '22.02', descripcion: 'Clubes deportivos', nbs: '16.02' },
  '9313': { lc116: '22.03', descripcion: 'Actividades deportivas diversas', nbs: '16.03' },
  '932': { lc116: '22.04', descripcion: 'Parques y entretenimiento', nbs: '16.04' },
  '9321': { lc116: '22.04', descripcion: 'Parques de diversión', nbs: '16.04' },
  '9322': { lc116: '22.05', descripcion: 'Discotecas y casas nocturnas', nbs: '16.05' },
  '9323': { lc116: '22.06', descripcion: 'Juegos y entretenimiento', nbs: '16.06' },
  '9329': { lc116: '22.07', descripcion: 'Otros servicios de entretenimiento', nbs: '16.07' },
  '900': { lc116: '22.08', descripcion: 'Actividades culturales y artísticas', nbs: '16.08' },
  '9001': { lc116: '22.08', descripcion: 'Teatro y música', nbs: '16.08' },
  '9002': { lc116: '22.08', descripcion: 'Exposiciones y museos', nbs: '16.08' },
  '9003': { lc116: '22.08', descripcion: 'Actividades artísticas diversas', nbs: '16.08' },

  // INMOBILIARIO
  '681': { lc116: '23.01', descripcion: 'Actividades inmobiliarias (corretaje)', nbs: '17.01' },
  '6810': { lc116: '23.01', descripcion: 'Corretaje de inmuebles', nbs: '17.01' },
  '682': { lc116: '23.02', descripcion: 'Administración de inmuebles', nbs: '17.02' },
  '6821': { lc116: '23.02', descripcion: 'Administración de condominios', nbs: '17.02' },
  '6822': { lc116: '23.02', descripcion: 'Administración de inmuebles propios', nbs: '17.02' },
  '683': { lc116: '23.03', descripcion: 'Evaluación de inmuebles', nbs: '17.03' },
  '6830': { lc116: '23.03', descripcion: 'Evaluación de inmuebles', nbs: '17.03' },

  // OTROS SERVICIOS
  '591': { lc116: '22.09', descripcion: 'Producción de películas y videos', nbs: '16.09' },
  '5911': { lc116: '22.09', descripcion: 'Producción audiovisual', nbs: '16.09' },
  '5912': { lc116: '22.09', descripcion: 'Distribución audiovisual', nbs: '16.09' },
  '592': { lc116: '22.10', descripcion: 'Grabación de sonido y edición', nbs: '16.10' },
  '5920': { lc116: '22.10', descripcion: 'Grabación de sonido', nbs: '16.10' },
  '601': { lc116: '22.11', descripcion: 'Actividades de radio', nbs: '16.11' },
  '602': { lc116: '22.12', descripcion: 'Actividades de televisión', nbs: '16.12' },
  '611': { lc116: '22.13', descripcion: 'Telecomunicaciones (servicios)', nbs: '16.13' },
  '612': { lc116: '22.13', descripcion: 'Telefonía fija', nbs: '16.13' },
  '613': { lc116: '22.13', descripcion: 'Telefonía móvil', nbs: '16.13' },
  '614': { lc116: '22.13', descripcion: 'Internet (proveedores)', nbs: '16.13' },
  '619': { lc116: '22.13', descripcion: 'Otros servicios de telecomunicaciones', nbs: '16.13' },
  '639': { lc116: '22.14', descripcion: 'Servicios de información', nbs: '16.14' },
  '6391': { lc116: '22.14', descripcion: 'Agencias de noticias', nbs: '16.14' },
  '6399': { lc116: '22.14', descripcion: 'Otros servicios de información', nbs: '16.14' },
  '772': { lc116: '22.15', descripcion: 'Alquiler de bienes muebles', nbs: '16.15' },
  '7721': { lc116: '22.15', descripcion: 'Locación de vehículos', nbs: '16.15' },
  '7722': { lc116: '22.15', descripcion: 'Locación de objetos personales', nbs: '16.15' },
  '7723': { lc116: '22.15', descripcion: 'Locación de equipos', nbs: '16.15' },
  '7729': { lc116: '22.15', descripcion: 'Locación de otros bienes', nbs: '16.15' },
  '773': { lc116: '22.16', descripcion: 'Alquiler de máquinas y equipos', nbs: '16.16' },
  '7731': { lc116: '22.16', descripcion: 'Locación de máquinas agrícolas', nbs: '16.16' },
  '7732': { lc116: '22.16', descripcion: 'Locación de máquinas industriales', nbs: '16.16' },
  '7733': { lc116: '22.16', descripcion: 'Locación de equipos de construcción', nbs: '16.16' },
  '7734': { lc116: '22.16', descripcion: 'Locación de equipos de TI', nbs: '16.16' },
  '774': { lc116: '22.17', descripcion: 'Alquiler de propiedad intelectual', nbs: '16.17' },
  '7740': { lc116: '22.17', descripcion: 'Alquiler de propiedad intelectual', nbs: '16.17' },
  '781': { lc116: '22.18', descripcion: 'Selección y reclutamiento', nbs: '16.18' },
  '7810': { lc116: '22.18', descripcion: 'Selección y reclutamiento', nbs: '16.18' },
  '782': { lc116: '22.19', descripcion: 'Servicios de temporales', nbs: '16.19' },
  '7820': { lc116: '22.19', descripcion: 'Servicios de temporales', nbs: '16.19' },
  '783': { lc116: '22.20', descripcion: 'Gestión de RRHH', nbs: '16.20' },
  '7830': { lc116: '22.20', descripcion: 'Gestión de RRHH', nbs: '16.20' },
  '791': { lc116: '22.21', descripcion: 'Agencias de viaje', nbs: '16.21' },
  '7911': { lc116: '22.21', descripcion: 'Agencias de viaje', nbs: '16.21' },
  '7912': { lc116: '22.21', descripcion: 'Operadores turísticos', nbs: '16.21' },
  '792': { lc116: '22.22', descripcion: 'Guías de turismo', nbs: '16.22' },
  '7920': { lc116: '22.22', descripcion: 'Guías de turismo', nbs: '16.22' },
  '812': { lc116: '22.23', descripcion: 'Limpieza y conservación', nbs: '16.23' },
  '8121': { lc116: '22.23', descripcion: 'Limpieza predial', nbs: '16.23' },
  '8122': { lc116: '22.23', descripcion: 'Limpieza industrial', nbs: '16.23' },
  '8129': { lc116: '22.23', descripcion: 'Otros servicios de limpieza', nbs: '16.23' },
  '813': { lc116: '22.24', descripcion: 'Paisajismo y jardinería', nbs: '16.24' },
  '8130': { lc116: '22.24', descripcion: 'Paisajismo y jardinería', nbs: '16.24' },
  '829': { lc116: '17.08', descripcion: 'Otros servicios administrativos', nbs: '12.08' },
  '8291': { lc116: '17.08', descripcion: 'Servicios de cobranza', nbs: '12.08' },
  '8292': { lc116: '17.08', descripcion: 'Embalaje y empacado', nbs: '12.08' },
  '8293': { lc116: '17.08', descripcion: 'Servicios de fotografía', nbs: '12.08' },
  '8294': { lc116: '17.08', descripcion: 'Servicios de traducción', nbs: '12.08' },
  '8295': { lc116: '17.08', descripcion: 'Servicios de reprografía', nbs: '12.08' },
  '8296': { lc116: '17.08', descripcion: 'Servicios de grabación y sello', nbs: '12.08' },
  '8297': { lc116: '17.08', descripcion: 'Servicios de lectura y conteo', nbs: '12.08' },
  '8299': { lc116: '17.09', descripcion: 'Otros servicios diversos', nbs: '12.09' },
};

const PALABRAS_CLAVE: Record<string, string> = {
  software: '01.02', programa: '01.02', desarrollo: '01.02', sitio: '01.04',
  hospedaje: '01.04', 'mantenimiento de computador': '01.07', 'mantenimiento de equipo': '14.01',
  consultoría: '17.01', contabilidad: '17.04', abogacía: '17.02', jurídico: '17.02',
  evento: '10.05', fiesta: '10.05', feria: '17.10', congreso: '17.10',
  construcción: '7.02', obra: '7.02', arquitectura: '7.05', ingeniería: '7.05',
  proyecto: '7.05', salud: '4.01', médico: '4.02', hospital: '4.01', dentista: '4.02',
  transporte: '16.01', carga: '16.01', hotel: '21.01', restaurante: '21.03',
  alimentación: '21.03', seguridad: '19.01', vigilancia: '19.01', limpieza: '22.23',
  educación: '11.01', escuela: '11.01', curso: '11.03', enseñanza: '11.01',
  publicidad: '17.10', propaganda: '17.10', marketing: '17.10', fotografía: '17.08',
  traducción: '17.08', inmobiliario: '23.01', corretaje: '23.01', condominio: '23.02',
};

function buscarEnTabla(cnaeLimpio: string): Correlacion | null {
  // Intenta el código completo
  if (CNAE_LC116_MAP[cnaeLimpio]) {
    const item = CNAE_LC116_MAP[cnaeLimpio];
    return { lc116: item.lc116, descripcion: item.descripcion, nbs: item.nbs || '', csn: '', fuente: 'Tabla interna Wiserule (pública)' };
  }

  // Intenta con prefijos (3 dígitos)
  let prefijo = cnaeLimpio;
  while (prefijo.length >= 3) {
    prefijo = prefijo.slice(0, -1);
    if (CNAE_LC116_MAP[prefijo]) {
      const item = CNAE_LC116_MAP[prefijo];
      return { lc116: item.lc116, descripcion: item.descripcion, nbs: item.nbs || '', csn: '', fuente: 'Tabla interna Wiserule (pública)' };
    }
  }

  return null;
}

function buscarPorDescripcion(descripcion: string): Correlacion | null {
  const descLower = descripcion.toLowerCase();

  for (const [palabra, lc116] of Object.entries(PALABRAS_CLAVE)) {
    if (descLower.includes(palabra)) {
      for (const [codigo, item] of Object.entries(CNAE_LC116_MAP)) {
        if (item.lc116 === lc116 && codigo.length >= 3) {
          return { lc116: item.lc116, descripcion: item.descripcion, nbs: item.nbs || '', csn: '', fuente: 'Tabla interna Wiserule (por descripción)' };
        }
      }
    }
  }

  return null;
}

export function correlacionarPorCnae(cnaeCodigo: string, descripcionServicio = ''): Correlacion {
  const cnaeLimpio = cnaeCodigo.replace(/\D/g, '');

  // 1. Busca en tabla interna por CNAE
  const porCnae = buscarEnTabla(cnaeLimpio);
  if (porCnae) return porCnae;

  // 2. Fallback por descripción
  if (descripcionServicio) {
    const porDesc = buscarPorDescripcion(descripcionServicio);
    if (porDesc) return porDesc;
  }

  return { lc116: '', descripcion: '', nbs: '', csn: '', fuente: 'No encontrado' };
}

export function formatearCorrelacionParaLlm(correlacion: Correlacion): string {
  if (!correlacion || !correlacion.lc116) {
    return 'Correlación no encontrada en la base interna.';
  }

  const partes = [`LC 116/2003: ${correlacion.lc116} - ${correlacion.descripcion}`];
  if (correlacion.nbs) partes.push(`NBS: ${correlacion.nbs}`);
  if (correlacion.csn) partes.push(`CSN: ${correlacion.csn}`);
  partes.push(`Fuente: ${correlacion.fuente}`);

  return partes.join('\n');
}