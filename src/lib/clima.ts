// Clima con Open-Meteo (gratis, sin clave).

export interface Clima {
  temp: number
  sensacion: number
  max: number
  min: number
  lluvia: number
  descripcion: string
}

export function describirCodigo(c: number): string {
  if (c === 0) return 'despejado'
  if (c <= 2) return 'algo nublado'
  if (c === 3) return 'nublado'
  if (c === 45 || c === 48) return 'con niebla'
  if (c >= 51 && c <= 57) return 'con llovizna'
  if (c >= 61 && c <= 67) return 'con lluvia'
  if (c >= 71 && c <= 77) return 'con nieve'
  if (c >= 80 && c <= 82) return 'con chaparrones'
  if (c >= 95) return 'con tormenta'
  return 'variable'
}

export interface Ciudad {
  nombre: string
  detalle: string // provincia y país
  lat: number
  lon: number
}

/** Busca ciudades por nombre (Open-Meteo Geocoding, sin clave). Entiende "bahia blanca" sin tilde. */
export async function buscarCiudades(texto: string, senal?: AbortSignal): Promise<Ciudad[]> {
  const q = texto.trim()
  if (q.length < 3) return []
  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(q)}&count=6&language=es&format=json`
  const r = await fetch(url, { signal: senal })
  if (!r.ok) throw new Error(`buscador ${r.status}`)
  const d = await r.json()
  return (d.results ?? []).map((x: Record<string, unknown>) => ({
    nombre: String(x.name),
    detalle: [x.admin1, x.country].filter(Boolean).join(', '),
    lat: Number(x.latitude),
    lon: Number(x.longitude),
  }))
}

export async function pedirClima(lat: number, lon: number): Promise<Clima> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=1'
  const r = await fetch(url, { signal: AbortSignal.timeout?.(12_000) })
  if (!r.ok) throw new Error(`el servicio de clima respondió ${r.status}`)
  const d = await r.json()
  return {
    temp: Math.round(d.current.temperature_2m),
    sensacion: Math.round(d.current.apparent_temperature),
    max: Math.round(d.daily.temperature_2m_max[0]),
    min: Math.round(d.daily.temperature_2m_min[0]),
    lluvia: d.daily.precipitation_probability_max?.[0] ?? 0,
    descripcion: describirCodigo(d.current.weather_code),
  }
}

export function frase(c: Clima, ciudad: string): string {
  const lluvia = c.lluvia >= 40 ? ` Hay ${c.lluvia}% de probabilidad de lluvia.` : ''
  return `En ${ciudad} hay ${c.temp} grados, ${c.descripcion}. Hoy va de ${c.min} a ${c.max}.${lluvia}`
}
