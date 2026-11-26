// Entender tiempos en español hablado: duraciones ("diez minutos", "media hora"), momentos ("mañana a las nueve",
// "en veinte minutos", "el viernes a las seis de la tarde") y de qué es el recordatorio. Lógica pura (sin DOM).
import { leerNumero } from './numeros'
import { normalizar } from './voz'

export interface Tok {
  /** Como lo escribió el reconocedor (con tildes): para mostrar y decir. */
  o: string
  /** Normalizado (sin tildes, minúsculas): para entender. */
  n: string
}

export function tokenizar(texto: string): Tok[] {
  return texto
    .toLowerCase()
    .replace(/[¿?¡!.,;:"]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((o) => ({ o, n: normalizar(o) }))
    .filter((t) => t.n)
}

const MS = { seg: 1000, min: 60_000, hora: 3_600_000, dia: 86_400_000, semana: 604_800_000 }
const UNIDAD_MS: Record<string, number> = {
  segundo: MS.seg, segundos: MS.seg, seg: MS.seg,
  minuto: MS.min, minutos: MS.min, min: MS.min,
  hora: MS.hora, horas: MS.hora, hs: MS.hora, hr: MS.hora,
  dia: MS.dia, dias: MS.dia,
  semana: MS.semana, semanas: MS.semana,
}

export interface DuracionLeida {
  ms: number
  hasta: number
}

/** "diez minutos", "una hora y media", "media hora", "un cuarto de hora", "1 hora y 30 minutos". */
export function leerDuracion(n: string[], i: number): DuracionLeida | null {
  let j = i
  let ms = 0
  let algo = false
  for (;;) {
    if (n[j] === 'media' && n[j + 1] === 'hora') {
      ms += MS.hora / 2
      j += 2
      algo = true
      continue
    }
    if (n[j] === 'hora' && n[j + 1] === 'y' && n[j + 2] === 'media') {
      ms += MS.hora * 1.5
      j += 3
      algo = true
      continue
    }
    if ((n[j] === 'un' || n[j] === 'tres') && n[j + 1] === 'cuartos' && n[j + 2] === 'de' && n[j + 3] === 'hora') {
      ms += (n[j] === 'un' ? 1 : 3) * (MS.hora / 4)
      j += 4
      algo = true
      continue
    }
    if (n[j] === 'un' && n[j + 1] === 'cuarto' && n[j + 2] === 'de' && n[j + 3] === 'hora') {
      ms += MS.hora / 4
      j += 4
      algo = true
      continue
    }
    if (n[j] === 'cuarto' && n[j + 1] === 'de' && n[j + 2] === 'hora') {
      ms += MS.hora / 4
      j += 3
      algo = true
      continue
    }
    const num = leerNumero(n, j)
    const unidad = num ? UNIDAD_MS[n[num.hasta]] : undefined
    if (num && unidad !== undefined) {
      ms += num.valor * unidad
      j = num.hasta + 1
      algo = true
      // "una hora y media", "dos horas y cuarto"
      if (n[j] === 'y' && n[j + 1] === 'media') {
        ms += unidad / 2
        j += 2
      } else if (n[j] === 'y' && n[j + 1] === 'cuarto') {
        ms += unidad / 4
        j += 2
      } else if (n[j] === 'y' && leerNumero(n, j + 1) && UNIDAD_MS[n[leerNumero(n, j + 1)!.hasta]] !== undefined) {
        j++ // "1 hora y 30 minutos": sigue con la parte siguiente
      }
      continue
    }
    break
  }
  return algo ? { ms, hasta: j } : null
}

// ---------- horas y días ----------
export type Parte = 'manana' | 'tarde' | 'noche' | 'madrugada' | 'mediodia'

interface HoraLeida {
  h: number
  m: number
  parte?: Parte
  hasta: number
}

const PARTES: Record<string, Parte> = { manana: 'manana', tarde: 'tarde', noche: 'noche', madrugada: 'madrugada' }

/** "a las nueve", "a las 9 y media", "a las seis de la tarde", "a las diez menos cuarto", "a la una". */
function leerHora(n: string[], i: number): HoraLeida | null {
  if ((n[i] !== 'a' && n[i] !== 'para') || (n[i + 1] !== 'las' && n[i + 1] !== 'la')) return null
  let j = i + 2
  const hn = leerNumero(n, j)
  if (!hn || hn.valor > 24) return null
  let h = hn.valor
  let m = 0
  j = hn.hasta
  if (n[j] === 'y') {
    if (n[j + 1] === 'media') {
      m = 30
      j += 2
    } else if (n[j + 1] === 'cuarto') {
      m = 15
      j += 2
    } else {
      const mn = leerNumero(n, j + 1)
      if (mn && mn.valor < 60 && UNIDAD_MS[n[mn.hasta]] === undefined) {
        m = mn.valor
        j = mn.hasta
      }
    }
  } else if (n[j] === 'menos') {
    if (n[j + 1] === 'cuarto') {
      m = 45
      h = h - 1
      j += 2
    } else {
      const mn = leerNumero(n, j + 1)
      if (mn && mn.valor < 60) {
        m = 60 - mn.valor
        h = h - 1
        j = mn.hasta
      }
    }
  } else {
    const mn = leerNumero(n, j)
    if (mn && mn.valor < 60 && UNIDAD_MS[n[mn.hasta]] === undefined && n[mn.hasta] !== 'de') {
      m = mn.valor // "a las nueve cuarenta y cinco"
      j = mn.hasta
    }
  }
  let parte: Parte | undefined
  if (n[j] === 'de' && n[j + 1] === 'la' && PARTES[n[j + 2]]) {
    parte = PARTES[n[j + 2]]
    j += 3
  } else if (n[j] === 'del' && n[j + 1] === 'mediodia') {
    parte = 'mediodia'
    j += 2
  } else if (n[j] === 'am') {
    parte = 'manana'
    j++
  } else if (n[j] === 'pm') {
    parte = 'tarde'
    j++
  }
  if (h < 0) h += 24
  return { h, m, parte, hasta: j }
}

const SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sumarDias = (d: Date, k: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k)

interface DiaLeido {
  fecha: Date
  parte?: Parte
  hasta: number
}

function leerDia(n: string[], i: number, ahora: Date): DiaLeido | null {
  const hoy = inicioDelDia(ahora)
  const w = n[i]
  // "esta noche", "a la tarde", "por la mañana"
  if ((w === 'esta' || (w === 'a' && n[i + 1] === 'la') || (w === 'por' && n[i + 1] === 'la')) && true) {
    const k = w === 'esta' ? i + 1 : i + 2
    if (PARTES[n[k]]) return { fecha: hoy, parte: PARTES[n[k]], hasta: k + 1 }
  }
  if (w === 'al' && n[i + 1] === 'mediodia') return { fecha: hoy, parte: 'mediodia', hasta: i + 2 }
  if (w === 'hoy') return { fecha: hoy, hasta: i + 1 }
  if (w === 'pasado' && n[i + 1] === 'manana') return { fecha: sumarDias(hoy, 2), hasta: i + 2 }
  if (w === 'manana') {
    // "de la mañana" es una parte del día, no el día de mañana
    if (n[i - 1] === 'la' && (n[i - 2] === 'de' || n[i - 2] === 'a' || n[i - 2] === 'por')) return null
    return { fecha: sumarDias(hoy, 1), hasta: i + 1 }
  }
  // "el viernes", "este viernes", "el próximo lunes"
  let k = i
  if (w === 'el' || w === 'este' || w === 'proximo') k = i + 1
  if (n[k] === 'proximo') k++
  const wd = SEMANA.indexOf(n[k])
  if (wd >= 0) {
    const falta = (wd - hoy.getDay() + 7) % 7 || 7 // siempre hacia adelante
    return { fecha: sumarDias(hoy, falta), hasta: k + 1 }
  }
  // "el 15 de marzo", "el 15"
  if (w === 'el') {
    const num = leerNumero(n, i + 1)
    if (num && num.valor >= 1 && num.valor <= 31) {
      let j = num.hasta
      let mes = -1
      if (n[j] === 'de' && MESES.includes(n[j + 1])) {
        mes = MESES.indexOf(n[j + 1])
        j += 2
      }
      if (mes >= 0) {
        let f = new Date(hoy.getFullYear(), mes, num.valor)
        if (f < hoy) f = new Date(hoy.getFullYear() + 1, mes, num.valor)
        return { fecha: f, hasta: j }
      }
      // sin mes: ese día de este mes, o del que viene
      if (UNIDAD_MS[n[j]] !== undefined) return null // "el 15 minutos" no es una fecha
      let f = new Date(hoy.getFullYear(), hoy.getMonth(), num.valor)
      if (f < hoy) f = new Date(hoy.getFullYear(), hoy.getMonth() + 1, num.valor)
      return { fecha: f, hasta: j }
    }
  }
  return null
}

export interface Momento {
  cuando: Date
  /** Qué tokens del texto eran la expresión de tiempo (para sacarlos del texto del recordatorio). */
  usados: Set<number>
  /** true = "en 20 minutos". */
  relativo: boolean
  /** true = la hora pedida ya pasó hoy. */
  pasado: boolean
}

function aplicarParte(h: number, p: Parte): number {
  if (p === 'tarde' || p === 'noche') return h < 12 ? h + 12 : h === 12 && p === 'noche' ? 0 : h
  if (p === 'mediodia') return 12
  return h === 12 ? 0 : h
}

const HORA_POR_DEFECTO: Record<Parte, number> = { manana: 9, tarde: 17, noche: 21, mediodia: 12, madrugada: 6 }

/** Busca en el texto "cuándo": una duración ("en veinte minutos") o un día y/o una hora ("mañana a las nueve"). */
export function extraerMomento(toks: Tok[], ahora: Date): Momento | null {
  const n = toks.map((t) => t.n)
  const usados = new Set<number>()
  const marcar = (a: number, b: number) => {
    for (let k = a; k < b; k++) usados.add(k)
  }

  // 1) Duración relativa: "en/dentro de <duración>"
  for (let i = 0; i < n.length; i++) {
    const ini = n[i] === 'en' ? i + 1 : n[i] === 'dentro' && n[i + 1] === 'de' ? i + 2 : -1
    if (ini < 0) continue
    const d = leerDuracion(n, ini)
    if (d) {
      marcar(i, d.hasta)
      return { cuando: new Date(ahora.getTime() + d.ms), usados, relativo: true, pasado: false }
    }
  }

  // 2) Día y/o hora
  let dia: Date | null = null
  let hora: HoraLeida | null = null
  let parteSuelta: Parte | undefined
  for (let i = 0; i < n.length; i++) {
    if (usados.has(i)) continue
    if (!hora) {
      const h = leerHora(n, i)
      if (h) {
        hora = h
        marcar(i, h.hasta)
        i = h.hasta - 1
        continue
      }
    }
    if (!dia) {
      const d = leerDia(n, i, ahora)
      if (d) {
        dia = d.fecha
        parteSuelta = d.parte ?? parteSuelta
        marcar(i, d.hasta)
        i = d.hasta - 1
        continue
      }
    }
    // "esta noche" sin otro día
    if (!parteSuelta) {
      const d = leerDia(n, i, ahora)
      if (d?.parte) {
        parteSuelta = d.parte
        marcar(i, d.hasta)
        i = d.hasta - 1
      }
    }
  }
  if (!hora && !dia && !parteSuelta) return null

  const hoy = inicioDelDia(ahora)
  const fecha = dia ?? hoy
  let h: number
  let m = 0
  if (hora) {
    m = hora.m
    const p = hora.parte ?? parteSuelta
    if (p) h = aplicarParte(hora.h, p)
    else if (dia) h = hora.h >= 1 && hora.h <= 6 ? hora.h + 12 : hora.h // con día: 1–6 = tarde, 7–11 = mañana
    else {
      // sin día: la próxima vez que sea esa hora
      const cands = hora.h >= 1 && hora.h < 12 ? [hora.h, hora.h + 12] : [hora.h === 24 ? 0 : hora.h]
      const prox = cands.find((c) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), c, m) > ahora)
      if (prox !== undefined) h = prox
      else {
        const manana = sumarDias(fecha, 1)
        return {
          cuando: new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), cands[0], m),
          usados,
          relativo: false,
          pasado: false,
        }
      }
    }
  } else {
    h = HORA_POR_DEFECTO[parteSuelta ?? 'manana']
  }
  let cuando = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), h === 24 ? 0 : h, m)
  // Sin día dicho, una hora que ya pasó hoy es la de mañana ("a las nueve de la mañana" a las 15:00). Con "hoy" explícito, se avisa.
  if (!dia && cuando <= ahora) cuando = new Date(cuando.getFullYear(), cuando.getMonth(), cuando.getDate() + 1, cuando.getHours(), cuando.getMinutes())
  return { cuando, usados, relativo: false, pasado: cuando <= ahora }
}

// ---------- el texto del recordatorio ----------
const DISPARADORES = new Set([
  'nooby', 'che', 'recordame', 'recuerdame', 'acordame', 'avisame', 'agendame', 'anotame', 'creame', 'crea', 'hace', 'haceme',
  'agregame', 'agrega', 'programame', 'programa', 'poneme', 'pone', 'un', 'una', 'nuevo', 'nueva', 'recordatorio', 'aviso',
  'favor', 'por', 'quiero', 'necesito', 'podes', 'me',
])
const CONECTORES = new Set(['que', 'de', 'para', 'a', 'el', 'la', 'en'])

/** Lo que hay que recordar, sin las palabras de pedido ("recordame", "creame un recordatorio de") ni la expresión de tiempo. */
export function textoDelRecordatorio(toks: Tok[], usados: Set<number>): string {
  const resto = toks.filter((_, i) => !usados.has(i))
  let i = 0
  while (i < resto.length && DISPARADORES.has(resto[i].n)) i++
  if (i < resto.length && ['que', 'de', 'para'].includes(resto[i].n)) i++
  let fin = resto.length
  while (fin > i && CONECTORES.has(resto[fin - 1].n)) fin--
  return resto.slice(i, fin).map((t) => t.o).join(' ')
}

export interface RecordatorioEntendido {
  texto: string
  momento: Momento | null
}

export function entenderRecordatorio(texto: string, ahora: Date): RecordatorioEntendido {
  const toks = tokenizar(texto)
  const momento = extraerMomento(toks, ahora)
  return { texto: textoDelRecordatorio(toks, momento?.usados ?? new Set()), momento }
}

// ---------- temporizador ----------
const SOBRAN_EN_TEMPORIZADOR = new Set([
  'nooby', 'che', 'poneme', 'pone', 'ponete', 'crea', 'creame', 'programa', 'programame', 'haceme', 'hace', 'un', 'una',
  'temporizador', 'timer', 'cronometro', 'cuenta', 'regresiva', 'avisame', 'recordame', 'favor', 'por', 'quiero', 'necesito',
  'en', 'dentro', 'de', 'durante', 'con', 'me',
])

export interface TemporizadorEntendido {
  ms: number
  /** Para qué es ("los huevos"), si lo dijo. */
  etiqueta: string
}

export function entenderTemporizador(texto: string): TemporizadorEntendido | null {
  const toks = tokenizar(texto)
  const n = toks.map((t) => t.n)
  for (let i = 0; i < n.length; i++) {
    const d = leerDuracion(n, i)
    if (!d) continue
    const resto = toks.filter((_, k) => k < i || k >= d.hasta)
    let a = 0
    while (a < resto.length && SOBRAN_EN_TEMPORIZADOR.has(resto[a].n)) a++
    if (a < resto.length && resto[a].n === 'para') a++
    let b = resto.length
    while (b > a && ['de', 'para', 'que', 'a', 'el', 'la'].includes(resto[b - 1].n)) b--
    return { ms: d.ms, etiqueta: resto.slice(a, b).map((t) => t.o).join(' ') }
  }
  return null
}

// ---------- decir un momento ----------
/** "15" → "15"; 17:30 → "17 y 30". */
const horaHablada = (d: Date) => (d.getMinutes() === 0 ? `${d.getHours()}` : `${d.getHours()} y ${d.getMinutes()}`)

export function minutosHablados(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} segundos`
  const total = Math.round(ms / 60_000)
  if (total < 60) return total === 1 ? '1 minuto' : `${total} minutos`
  const h = Math.floor(total / 60)
  const r = total % 60
  const horas = h === 1 ? '1 hora' : `${h} horas`
  return r === 0 ? horas : `${horas} y ${r === 1 ? '1 minuto' : `${r} minutos`}`
}

/** "en 20 minutos", "hoy a las 17 y 30", "mañana a las 9", "el viernes a las 18", "el 15 de marzo a las 9". */
export function describirMomento(cuando: Date, ahora: Date): string {
  const dif = cuando.getTime() - ahora.getTime()
  if (dif < 60 * 60_000) return `en ${minutosHablados(Math.max(dif, 60_000))}`
  const dias = Math.round((inicioDelDia(cuando).getTime() - inicioDelDia(ahora).getTime()) / MS.dia)
  const a = `a las ${horaHablada(cuando)}`
  if (dias === 0) return `hoy ${a}`
  if (dias === 1) return `mañana ${a}`
  if (dias < 7) return `el ${SEMANA[cuando.getDay()].replace('miercoles', 'miércoles').replace('sabado', 'sábado')} ${a}`
  return `el ${cuando.getDate()} de ${MESES[cuando.getMonth()]} ${a}`
}
