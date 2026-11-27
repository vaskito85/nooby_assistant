// La cara de Nooby, en datos: cada humor es una "pose" (qué tan abiertos están los ojos, dónde están las cejas, cómo está la boca…)
// y la boca se arma con una curva a partir de unos pocos números. Todo puro (sin DOM) para poder probarlo; quien lo dibuja y lo anima
// es rostroVivo.ts.

export type Humor =
  | 'normal'
  | 'feliz'
  | 'dormido'
  | 'alerta'
  | 'hablando'
  | 'enojado'
  | 'atento'
  | 'pensando'
  | 'sorprendido'
  | 'triste'
  | 'confuso'
  | 'risa'
  | 'bostezo'

export interface Pose {
  /** Párpado de arriba: 0 abierto … 1 cerrado. */
  lid: number
  /** Inclinación del párpado en grados (+ = enojado: baja hacia la nariz; − = triste). */
  lidAng: number
  /** Párpado de abajo subido: 0 … 1 (ojos felices en arco, ^_^). */
  lift: number
  /** Tamaño de los ojos. */
  ojo: number
  /** Altura de las cejas: −1 bajas … 1 altas. */
  ceja: number
  /** −1 triste (puntas de adentro arriba) … +1 enojado (puntas de adentro abajo). */
  cejaAng: number
  /** Ceja izquierda más arriba (curiosidad, duda). */
  cejaIzq: number
  /** Boca: ancho 0 … 1. */
  ancho: number
  /** Boca: apertura 0 … 1. */
  abre: number
  /** −1 mueca triste … 1 sonrisa. */
  sonrisa: number
  /** Boca redonda ("o", "u"): 0 … 1. */
  redonda: number
  /** Rubor de las mejillas: 0 … 1. */
  mejilla: number
  /** Inclinación de la cabeza en grados. */
  incl: number
  /** Si está, los ojos miran ahí (−1 … 1) en vez de seguir a la persona. */
  miraX?: number
  miraY?: number
}

const base: Pose = {
  lid: 0.04,
  lidAng: 0,
  lift: 0,
  ojo: 1,
  ceja: 0,
  cejaAng: 0,
  cejaIzq: 0,
  ancho: 0.55,
  abre: 0,
  sonrisa: 0.35,
  redonda: 0,
  mejilla: 0.1,
  incl: 0,
}

const de = (p: Partial<Pose>): Pose => ({ ...base, ...p })

export const POSES: Record<Humor, Pose> = {
  normal: de({}),
  feliz: de({ lid: 0.05, lift: 0.62, ceja: 0.35, cejaAng: -0.1, ancho: 0.8, abre: 0.25, sonrisa: 1, mejilla: 0.8, incl: 2 }),
  dormido: de({ lid: 0.97, ceja: -0.1, ancho: 0.3, sonrisa: 0.1, mejilla: 0 }),
  alerta: de({ lid: 0, ojo: 1.15, ceja: 0.7, cejaAng: -0.6, ancho: 0.35, abre: 0.5, sonrisa: -0.2, redonda: 0.8, mejilla: 0 }),
  hablando: de({ ceja: 0.1, ancho: 0.6, sonrisa: 0.3, mejilla: 0.15 }),
  enojado: de({ lid: 0.35, lidAng: 18, ceja: -0.35, cejaAng: 1, ancho: 0.5, sonrisa: -0.8, mejilla: 0.5 }),
  atento: de({ lid: 0, ojo: 1.1, ceja: 0.45, cejaAng: -0.1, cejaIzq: 0.25, ancho: 0.45, abre: 0.08, sonrisa: 0.2, incl: 3 }),
  pensando: de({ lid: 0.15, ceja: 0.3, cejaAng: 0.1, cejaIzq: 0.45, ancho: 0.35, sonrisa: -0.05, incl: -4, miraX: -0.7, miraY: -0.75 }),
  sorprendido: de({ lid: 0, ojo: 1.2, ceja: 0.95, cejaAng: -0.2, ancho: 0.4, abre: 0.85, sonrisa: 0, redonda: 0.9, mejilla: 0.05 }),
  triste: de({ lid: 0.3, lidAng: -10, ceja: -0.1, cejaAng: -1, ancho: 0.4, sonrisa: -0.9, mejilla: 0, incl: -3, miraY: 0.5 }),
  confuso: de({ lid: 0.1, ceja: 0.25, cejaAng: 0.4, cejaIzq: 0.5, ancho: 0.5, abre: 0.12, sonrisa: -0.25, incl: 6, miraX: 0.5, miraY: -0.3 }),
  risa: de({ lid: 0.1, lift: 0.75, ceja: 0.5, ancho: 0.95, abre: 0.9, sonrisa: 1, mejilla: 1, incl: -3 }),
  bostezo: de({ lid: 0.85, ceja: 0.2, cejaAng: -0.3, ancho: 0.5, abre: 1, sonrisa: 0, redonda: 0.7, incl: -2 }),
}

const acotar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Centro de la boca dentro del dibujo de 500 × 400. */
export const BOCA_X = 250
export const BOCA_Y = 302

export interface TrazoBoca {
  /** Contorno de la boca (labios). Se usa para dibujarla y para recortar dientes y lengua. */
  d: string
  ancho: number
  /** Altura de la apertura en unidades del dibujo (0 = cerrada). */
  alto: number
  medioArriba: number
  medioAbajo: number
}

/** Arma la curva de la boca. Dos arcos (labio de arriba y de abajo) que se separan al abrir; los extremos suben con la sonrisa. */
export function trazoBoca(p: Pick<Pose, 'ancho' | 'abre' | 'sonrisa' | 'redonda'>): TrazoBoca {
  const red = acotar(p.redonda, 0, 1)
  const W = (70 + 110 * acotar(p.ancho, 0, 1)) * (1 - 0.42 * red)
  const S = acotar(p.sonrisa, -1, 1) * (1 - 0.5 * red)
  const alto = acotar(p.abre, 0, 1) * 78 * (1 + 0.35 * red)
  const izq = BOCA_X - W / 2
  const der = BOCA_X + W / 2
  const esquina = BOCA_Y - 20 * S
  const medioArriba = BOCA_Y + 8 * S - acotar(p.abre, 0, 1) * 6 // el labio de arriba sube un poco al abrir
  const medioAbajo = medioArriba + alto
  // En una curva cuadrática el punto medio es (extremos + 2·control) / 4: de ahí sale el control para llegar al medio pedido.
  const ctrlArriba = 2 * medioArriba - esquina
  const ctrlAbajo = 2 * medioAbajo - esquina
  const f = (n: number) => n.toFixed(1)
  const d = `M${f(izq)} ${f(esquina)} Q${f(BOCA_X)} ${f(ctrlArriba)} ${f(der)} ${f(esquina)} Q${f(BOCA_X)} ${f(ctrlAbajo)} ${f(izq)} ${f(esquina)}Z`
  return { d, ancho: W, alto, medioArriba, medioAbajo }
}

// ---------- hablar: la boca sigue las letras ----------

export interface Paso {
  /** Cuándo empieza, en ms desde que empezó a hablar. */
  t: number
  dur: number
  abre: number
  ancho: number
  redonda: number
}

/** Forma de la boca para cada vocal: [apertura, ancho, redondez]. */
const VOCALES: Record<string, [number, number, number]> = {
  a: [0.9, 0.8, 0],
  e: [0.55, 0.75, 0],
  i: [0.28, 0.85, 0],
  o: [0.6, 0.5, 0.85],
  u: [0.35, 0.4, 1],
}

const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Pasa un texto a una lista de formas de boca (una por letra, con pausas en la puntuación). Las vocales abren, b/m/p cierran los labios,
 * f/v los muerden un poco. Si se pasa `totalMs` el plan se estira o se achica para durar justo eso (lo que se estima que tarda la voz).
 */
export function planHabla(texto: string, totalMs?: number): Paso[] {
  const t = sinTildes(texto)
  const pasos: Paso[] = []
  let ms = 0
  const MS = 66
  const poner = (abre: number, ancho: number, redonda: number, dur: number) => {
    pasos.push({ t: ms, dur, abre, ancho, redonda })
    ms += dur
  }
  for (const c of t) {
    if (c in VOCALES) {
      const [a, w, r] = VOCALES[c]
      poner(a, w, r, MS * 1.4)
    } else if ('bmp'.includes(c)) poner(0, 0.55, 0, MS * 0.8)
    else if ('fv'.includes(c)) poner(0.12, 0.6, 0, MS * 0.8)
    else if (c === 'q' || c === 'w') poner(0.3, 0.45, 0.7, MS * 0.9)
    else if (/[a-z]/.test(c)) poner(0.2, 0.6, 0, MS * 0.8)
    else if (/[0-9]/.test(c)) poner(0.4, 0.6, 0.3, MS)
    else if (',;:'.includes(c)) poner(0.03, 0.55, 0, 220)
    else if ('.?!…'.includes(c)) poner(0.03, 0.55, 0, 420)
    else if (/\s/.test(c)) poner(0.05, 0.55, 0, MS * 0.6)
  }
  if (totalMs && ms > 0) {
    const k = totalMs / ms
    for (const p of pasos) {
      p.t *= k
      p.dur *= k
    }
  }
  return pasos
}

/** El paso que corresponde al instante `ms` (null si el plan ya terminó). */
export function pasoEn(plan: Paso[], ms: number): Paso | null {
  if (plan.length === 0 || ms < 0) return null
  let a = 0
  let b = plan.length - 1
  if (ms >= plan[b].t + plan[b].dur) return null
  while (a < b) {
    const m = (a + b + 1) >> 1
    if (plan[m].t <= ms) a = m
    else b = m - 1
  }
  return plan[a]
}

/** Cuánto se estima que tarda la voz en decir el texto (ms): unas 14 letras por segundo, con un mínimo. */
export const duracionEstimada = (texto: string) => Math.max(600, Math.round((texto.length / 14) * 1000))
