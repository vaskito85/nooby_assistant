// Recibe avisos por ntfy (https://ntfy.sh). Cualquier cosa que publique en el tema llega acá.

export interface MensajeNtfy {
  titulo?: string
  mensaje: string
}

/** Se suscribe al tema por SSE. Devuelve una función para cortar. EventSource reconecta solo. */
export function conectarNtfy(
  servidor: string,
  tema: string,
  alMensaje: (m: MensajeNtfy) => void,
  alEstado: (conectado: boolean) => void,
  /** Con `since=latest` el tema entrega al conectar el último mensaje guardado (lo usa la configuración). */
  ultimo = false,
): () => void {
  const base = servidor.replace(/\/+$/, '')
  const es = new EventSource(`${base}/${encodeURIComponent(tema)}/sse${ultimo ? '?since=latest' : ''}`)
  es.onopen = () => alEstado(true)
  es.onerror = () => alEstado(false)
  es.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data)
      if (d.event === 'message' && typeof d.message === 'string') {
        alMensaje({ titulo: d.title, mensaje: d.message })
      }
    } catch {
      /* mensaje que no es JSON: se ignora */
    }
  }
  return () => es.close()
}

/** Manda un aviso de prueba al mismo tema (para verificar que todo llega). */
export async function enviarNtfy(servidor: string, tema: string, mensaje: string) {
  const base = servidor.replace(/\/+$/, '')
  const r = await fetch(`${base}/${encodeURIComponent(tema)}`, { method: 'POST', body: mensaje })
  if (!r.ok) throw new Error(`ntfy respondió ${r.status}`)
}
