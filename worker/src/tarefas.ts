/**
 * Durable Object para el manejo de tareas asíncronas de análisis.
 * Equivalente a backend/tarefas.py en Python.
 *
 * Ventajas de Durable Objects:
 * - Estado persistente (sobrevive a restarts)
 * - Aislamiento por tarea
 * - Confiable para polling
 */

export interface Tarea {
  id: string;
  status: 'aguardando' | 'procesando' | 'parcial' | 'concluido' | 'error';
  creado_em: string;
  etapa_actual: string;
  progreso: number;
  relatorio_completo: string | null;
  error: string | null;
}

export class TareaAnalisis implements DurableObject {
  private state: DurableObjectState;
  private tarea: Tarea;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.tarea = {
      id: '',
      status: 'aguardando',
      creado_em: new Date().toISOString(),
      etapa_actual: 'Iniciando análisis...',
      progreso: 0,
      relatorio_completo: null,
      error: null,
    };
  }

  async initialize(id: string): Promise<void> {
    this.tarea.id = id;
    await this.state.storage.put('tarea', this.tarea);
  }

  async actualizar(patch: Partial<Tarea>): Promise<Tarea> {
    this.tarea = { ...this.tarea, ...patch };
    await this.state.storage.put('tarea', this.tarea);
    return this.tarea;
  }

  async obtener(): Promise<Tarea> {
    const stored = await this.state.storage.get('tarea');
    if (stored) {
      this.tarea = stored as Tarea;
    }
    return this.tarea;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path.endsWith('/status')) {
      return Response.json(await this.obtener());
    }

    if (request.method === 'POST' && path.endsWith('/actualizar')) {
      const body = await request.json();
      const tarea = await this.actualizar(body as Partial<Tarea>);
      return Response.json(tarea);
    }

    return new Response('Not found', { status: 404 });
  }
}

export function generarTaskId(): string {
  // Genera un ID corto de 8 caracteres (similar al Python uuid[:8])
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8);
}