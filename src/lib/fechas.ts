// "¿Cuánto falta para Navidad?" y otras fechas. Lógica pura (sin DOM).
import { extraerMomento, minutosHablados, tokenizar } from './tiempo'
import { normalizar } from './voz'

const MS_DIA = 86_400_000
const SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** Días de calendario entre dos fechas (sin que el cambio de hora los desarme). */
const diasEntre = (a: Date, b: Date) =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / MS_DIA)

/** El N-ésimo domingo del mes (mes 0–11). El Día del Padre/Madre/Niño en Argentina caen en el 3.er domingo. */
export function tercerDomingo(anio: number, mes: number): Date {
  const primero = new Date(anio, mes, 1)
  const primerDomingo = 1 + ((7 - primero.getDay()) % 7)
  return new Date(anio, mes, primerDomingo + 14)
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
export function pascua(anio: number): Date {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(anio, mes - 1, dia)
}

/** La próxima vez que ocurre algo: este año si todavía no pasó (hoy cuenta), si no el que viene. */
const proximaVez = (f: (anio: number) => Date) => (ahora: Date) => {
  const hoy = inicio(ahora)
  let x = f(hoy.getFullYear())
  if (x < hoy) x = f(hoy.getFullYear() + 1)
  return x
}
const fija = (mes: number, dia: number) => proximaVez((anio) => new Date(anio, mes, dia))

interface Evento {
  /** Cómo se lo nombra (normalizado). */
  claves: string[]
  titulo: string
  fecha: (ahora: Date) => Date
}

const EVENTOS: Evento[] = [
  { claves: ['nochebuena'], titulo: 'Nochebuena', fecha: fija(11, 24) },
  { claves: ['navidad'], titulo: 'Navidad', fecha: fija(11, 25) },
  { claves: ['fin de ano', 'fin del ano', 'nochevieja'], titulo: 'fin de año', fecha: fija(11, 31) },
  { claves: ['ano nuevo'], titulo: 'Año Nuevo', fecha: fija(0, 1) },
  { claves: ['reyes'], titulo: 'Reyes', fecha: fija(0, 6) },
  { claves: ['san valentin', 'enamorados'], titulo: 'San Valentín', fecha: fija(1, 14) },
  { claves: ['pascua', 'pascuas'], titulo: 'Pascua', fecha: proximaVez(pascua) },
  { claves: ['dia del padre'], titulo: 'el Día del Padre', fecha: proximaVez((a) => tercerDomingo(a, 5)) },
  { claves: ['dia de la madre'], titulo: 'el Día de la Madre', fecha: proximaVez((a) => tercerDomingo(a, 9)) },
  { claves: ['dia del nino', 'dia de la ninez'], titulo: 'el Día del Niño', fecha: proximaVez((a) => tercerDomingo(a, 7)) },
  { claves: ['dia del amigo'], titulo: 'el Día del Amigo', fecha: fija(6, 20) },
]

/** Una fecha dicha como se diría: "el viernes", "el 15 de marzo". */
function describirFecha(f: Date, ahora: Date): string {
  const dias = diasEntre(ahora, f)
  if (dias > 0 && dias < 7) return `el ${SEMANA[f.getDay()]}`
  return `el ${f.getDate()} de ${MESES[f.getMonth()]}`
}

/** "Faltan 29 días para Navidad." / "Mañana es Navidad." / "Hoy es Navidad." null si no se entiende para qué. */
export function cuantoFalta(texto: string, ahora: Date): string | null {
  const t = normalizar(texto)
  let titulo: string | null = null
  let fecha: Date | null = null

  const ev = EVENTOS.flatMap((e) => e.claves.map((c) => ({ e, c })))
    .sort((a, b) => b.c.length - a.c.length)
    .find(({ c }) => t.includes(c))
  if (ev) {
    titulo = ev.e.titulo
    fecha = ev.e.fecha(ahora)
  } else {
    const mom = extraerMomento(tokenizar(texto), ahora)
    if (!mom || mom.relativo) return null
    // Una hora de hoy ("cuánto falta para las cinco"): se cuenta en horas y minutos.
    const dif = mom.cuando.getTime() - ahora.getTime()
    if (dif > 0 && diasEntre(ahora, mom.cuando) === 0) return `Faltan ${minutosHablados(dif)}.`
    fecha = inicio(mom.cuando)
    titulo = describirFecha(fecha, ahora)
  }

  const dias = diasEntre(ahora, fecha)
  if (dias <= 0) return `Hoy es ${titulo}.`
  if (dias === 1) return `Mañana es ${titulo}.`
  const semanas = dias >= 14 ? `, o sea unas ${Math.round(dias / 7)} semanas` : ''
  return `Faltan ${dias} días para ${titulo}${semanas}.`
}
