// Ajustes. Se editan en el PANEL (en tu PC) y el celu solo los recibe por ntfy.
// Nada de esto contiene secretos salvo el `tema`, que se comparte con el celu por link.

export interface Ajustes {
  /** Servidor ntfy (el público o el de tu Raspberry). */
  servidor: string
  /** Tema secreto de ntfy: si alguien lo adivina, puede mandarte avisos. Que sea largo. */
  tema: string
  /** Minutos sentado antes de avisar. */
  sentadoMin: number
  /** Minutos entre recordatorios de agua. 0 = apagado. */
  aguaMin: number
  /** Para el clima. */
  ciudad: string
  lat: number
  lon: number
  /** Hablar en voz alta además del sonido. */
  voz: boolean
}

/** Lo que viaja de la PC al celu (todo menos servidor y tema, que el celu ya conoce). */
export type ConfigRemota = Omit<Ajustes, 'servidor' | 'tema'>

const CLAVE_CELU = 'nooby.ajustes'
const CLAVE_PANEL = 'nooby.panel'

export const porDefecto: Ajustes = {
  servidor: 'https://ntfy.sh',
  tema: '',
  sentadoMin: 60,
  aguaMin: 45,
  ciudad: 'Bahía Blanca',
  lat: -38.72,
  lon: -62.27,
  voz: true,
}

/** Tema de configuración: va en un canal aparte para no mezclarse con las alarmas. */
export const temaConfig = (tema: string) => `${tema}-cfg`

function leer(clave: string): Ajustes {
  try {
    const crudo = localStorage.getItem(clave)
    return { ...porDefecto, ...(crudo ? JSON.parse(crudo) : {}) } as Ajustes
  } catch {
    return { ...porDefecto }
  }
}

/** Celu: lee lo guardado y toma servidor/tema del link (?tema=…&servidor=…) la primera vez. */
export function cargarAjustes(): Ajustes {
  const a = leer(CLAVE_CELU)
  const p = new URLSearchParams(location.search)
  const tema = p.get('tema')
  const servidor = p.get('servidor')
  if (tema || servidor) {
    if (tema) a.tema = tema.trim()
    if (servidor) a.servidor = servidor.trim()
    guardarAjustes(a)
    history.replaceState(null, '', location.pathname + location.hash) // saca el secreto de la barra
  }
  return a
}

export function guardarAjustes(a: Ajustes) {
  localStorage.setItem(CLAVE_CELU, JSON.stringify(a))
}

/** Panel (PC): sus ajustes son la fuente de verdad. */
export const cargarPanel = () => leer(CLAVE_PANEL)
export const guardarPanel = (a: Ajustes) => localStorage.setItem(CLAVE_PANEL, JSON.stringify(a))

export function aRemota(a: Ajustes): ConfigRemota {
  return {
    sentadoMin: a.sentadoMin,
    aguaMin: a.aguaMin,
    ciudad: a.ciudad,
    lat: a.lat,
    lon: a.lon,
    voz: a.voz,
  }
}

const num = (v: unknown, min: number, max: number, def: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def

/** Valida lo recibido (viene de afuera): ignora lo raro y limita los rangos. */
export function aplicarRemota(actual: Ajustes, crudo: unknown): Ajustes {
  if (typeof crudo !== 'object' || crudo === null) return actual
  const c = crudo as Record<string, unknown>
  return {
    ...actual,
    sentadoMin: num(c.sentadoMin, 1, 600, actual.sentadoMin),
    aguaMin: num(c.aguaMin, 0, 600, actual.aguaMin),
    ciudad: typeof c.ciudad === 'string' && c.ciudad.length <= 80 ? c.ciudad : actual.ciudad,
    lat: num(c.lat, -90, 90, actual.lat),
    lon: num(c.lon, -180, 180, actual.lon),
    voz: typeof c.voz === 'boolean' ? c.voz : actual.voz,
  }
}
