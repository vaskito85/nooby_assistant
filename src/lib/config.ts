// Ajustes guardados en el celu (localStorage). Nada sale de acá salvo lo que vos configures.

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

const CLAVE = 'nooby.ajustes'

export const porDefecto: Ajustes = {
  servidor: 'https://ntfy.sh',
  tema: '',
  sentadoMin: 60,
  aguaMin: 45,
  ciudad: 'Buenos Aires',
  lat: -34.6,
  lon: -58.4,
  voz: true,
}

export function cargarAjustes(): Ajustes {
  try {
    const crudo = localStorage.getItem(CLAVE)
    const a = { ...porDefecto, ...(crudo ? JSON.parse(crudo) : {}) } as Ajustes
    // Permite configurar el tema por URL la primera vez: ?tema=taller-xxxx
    const url = new URLSearchParams(location.search).get('tema')
    if (url) a.tema = url
    return a
  } catch {
    return { ...porDefecto }
  }
}

export function guardarAjustes(a: Ajustes) {
  localStorage.setItem(CLAVE, JSON.stringify(a))
}
