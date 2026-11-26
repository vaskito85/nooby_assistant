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

/** Escucha avisos y cambios de config del servidor. EventSource reconecta solo. */
export function conectarLocal(
  alAviso: (texto: string) => void,
  alConfig: (config: unknown) => void,
  alEstado: (conectado: boolean) => void,
  /** El panel de la PC pidió entrenar la frase de despertar. */
  alEntrenar?: (frase: string) => void,
  /** La PC informa hace cuánto fue la última tecla o movimiento del mouse (ms). */
  alActividad?: (idleMs: number) => void,
): () => void {
  const es = new EventSource('/api/eventos')
  es.onopen = () => alEstado(true)
  es.onerror = () => alEstado(false)
  es.addEventListener('aviso', (e) => {
    try {
      const { texto } = JSON.parse((e as MessageEvent).data)
      if (typeof texto === 'string') alAviso(texto)
    } catch {
      /* se ignora */
    }
  })
  es.addEventListener('actividad', (e) => {
    try {
      const { idleMs } = JSON.parse((e as MessageEvent).data)
      if (typeof idleMs === 'number') alActividad?.(idleMs)
    } catch {
      /* se ignora */
    }
  })
  es.addEventListener('entrenar', (e) => {
    try {
      const { frase } = JSON.parse((e as MessageEvent).data)
      alEntrenar?.(typeof frase === 'string' && frase ? frase : 'che nooby')
    } catch {
      /* se ignora */
    }
  })
  es.addEventListener('config', (e) => {
    try {
      alConfig(JSON.parse((e as MessageEvent).data))
    } catch {
      /* se ignora */
    }
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
