// Canal con el servidor de la PC (por USB: adb reverse). Si la web la sirve ese servidor, se usa esto;
// si no (ej. la versión de Vercel), se usa ntfy.

export interface EstadoServidor {
  nooby: true
  version: string
  puerto: number
  celus: string[]
  pantallas: number
}

/** ¿Esta página la está sirviendo el servidor local de Nooby? */
export async function estadoLocal(): Promise<EstadoServidor | null> {
  try {
    const r = await fetch('/api/estado', { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    return j?.nooby === true ? (j as EstadoServidor) : null
  } catch {
    return null
  }
}

export interface AvisoExterno {
  texto: string
  /** Si el agente lo informa: qué dibujo mostrar (terminada, error…). */
  estado?: import('./impresoras').EstadoImpresora
  impresora?: string
}

export interface Escuchas {
  /** Llegó un aviso de afuera (la impresora, un script…). */
  alAviso: (aviso: AvisoExterno) => void
  alConfig: (config: unknown) => void
  alEstado: (conectado: boolean) => void
  /** El panel de la PC pidió entrenar la frase de despertar. */
  alEntrenar?: (frase: string) => void
  /** La PC informa hace cuánto fue la última tecla o movimiento del mouse (ms). */
  alActividad?: (idleMs: number) => void
  /** El agente de las impresoras mandó un informe nuevo. */
  alImpresoras?: (informe: import('./impresoras').InformeImpresoras) => void
  /** El agente mandó una foto de una impresora (el celu la pide aparte con urlFoto). */
  alFoto?: (foto: { impresora: string; nombre: string; ts: number }) => void
}

/** Dirección de la foto de una impresora; el `ts` evita que el navegador muestre una vieja guardada. */
export const urlFoto = (clave: string, ts: number) => `/api/foto?impresora=${encodeURIComponent(clave)}&t=${ts}`

/** Escucha avisos y cambios del servidor. EventSource reconecta solo. */
export function conectarLocal(e: Escuchas): () => void {
  const es = new EventSource('/api/eventos')
  es.onopen = () => e.alEstado(true)
  es.onerror = () => e.alEstado(false)
  const al = (nombre: string, fn: (datos: Record<string, unknown>) => void) =>
    es.addEventListener(nombre, (ev) => {
      try {
        fn(JSON.parse((ev as MessageEvent).data))
      } catch {
        /* mensaje que no se entiende: se ignora */
      }
    })
  al('aviso', (d) => {
    if (typeof d.texto !== 'string') return
    e.alAviso({
      texto: d.texto,
      estado: typeof d.estado === 'string' ? (d.estado as AvisoExterno['estado']) : undefined,
      impresora: typeof d.impresora === 'string' ? d.impresora : undefined,
    })
  })
  al('actividad', (d) => {
    if (typeof d.idleMs === 'number') e.alActividad?.(d.idleMs)
  })
  al('entrenar', (d) => e.alEntrenar?.(typeof d.frase === 'string' && d.frase ? d.frase : 'che nooby'))
  al('config', (d) => e.alConfig(d))
  al('foto', (d) => {
    if (typeof d.impresora === 'string' && typeof d.ts === 'number') {
      e.alFoto?.({ impresora: d.impresora, nombre: typeof d.nombre === 'string' ? d.nombre : '', ts: d.ts })
    }
  })
  al('impresoras', (d) => {
    if (Array.isArray(d.impresoras)) e.alImpresoras?.(d as unknown as import('./impresoras').InformeImpresoras)
  })
  return () => es.close()
}

export async function leerConfigLocal(): Promise<unknown> {
  const r = await fetch('/api/config', { cache: 'no-store' })
  if (!r.ok) throw new Error(`config ${r.status}`)
  return r.json()
}

export async function guardarConfigLocal(config: unknown) {
  const r = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
}

export async function avisoLocal(texto: string) {
  const r = await fetch('/api/aviso', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texto }),
  })
  if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
}

/** Le pide al celu que arranque el entrenamiento de la frase de despertar. */
export async function entrenarLocal(frase: string) {
  const r = await fetch('/api/entrenar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ frase }),
  })
  if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
  return (await r.json()) as { ok: boolean; pantallas: number }
}

export interface Red {
  /** ¿Acepta avisos desde otras máquinas de la red (con token)? */
  lan: boolean
  puerto: number
  /** Solo viene cuando el acceso por red está activado. */
  token: string
  direcciones: string[]
}

export async function leerRed(): Promise<Red> {
  const r = await fetch('/api/red', { cache: 'no-store' })
  if (!r.ok) throw new Error(`red ${r.status}`)
  return r.json()
}

/** Abre o cierra el acceso desde la red, o genera un token nuevo. */
export async function guardarRed(cambio: { lan?: boolean; regenerarToken?: boolean }): Promise<Red> {
  const r = await fetch('/api/red', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cambio),
  })
  if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
  return r.json()
}

export async function leerImpresoras(): Promise<import('./impresoras').InformeImpresoras> {
  const r = await fetch('/api/impresoras', { cache: 'no-store' })
  if (!r.ok) throw new Error(`impresoras ${r.status}`)
  return r.json()
}
