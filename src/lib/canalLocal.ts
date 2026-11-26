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
