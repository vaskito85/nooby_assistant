// Qué foto de impresora corresponde a un aviso. Lógica pura (sin DOM).
//
// El agente manda la foto y el aviso por separado (la foto puede llegar un poco antes o un poco después). Se emparejan por
// cercanía en el tiempo —medida con el reloj del celu, así no depende de que la PC y el celu tengan la misma hora— y por
// impresora, si el aviso dice cuál.

export interface FotoRecibida {
  /** Clave normalizada de la impresora ('general' si la foto no dice de cuál). */
  clave: string
  nombre: string
  url: string
  /** Cuándo llegó al celu (Date.now() del celu). */
  recibidaEn: number
}

/** Una foto es "de este aviso" si llegó hasta 90 segundos antes o después. */
export const VENTANA_FOTO_MS = 90_000

/** Debe coincidir con la del servidor: minúsculas, sin símbolos. "Bambu H2C" → "bambu-h2c". */
export function claveImpresora(nombre: string | undefined): string {
  const c = (nombre ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ_-]+/g, '-')
    .slice(0, 40)
  return c || 'general'
}

export function elegirFoto(fotos: FotoRecibida[], avisoEn: number, impresora?: string): FotoRecibida | null {
  const cerca = fotos.filter((f) => Math.abs(f.recibidaEn - avisoEn) <= VENTANA_FOTO_MS)
  if (cerca.length === 0) return null
  const clave = impresora ? claveImpresora(impresora) : null
  // Si el aviso dice de qué impresora es, vale la foto de esa impresora o una sin dueño; la de otra impresora no.
  const candidatas = clave ? cerca.filter((f) => f.clave === clave || f.clave === 'general') : cerca
  if (candidatas.length === 0) return null
  return candidatas.reduce((mejor, f) => (Math.abs(f.recibidaEn - avisoEn) < Math.abs(mejor.recibidaEn - avisoEn) ? f : mejor))
}
