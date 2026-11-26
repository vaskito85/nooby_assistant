import { describe, expect, it } from 'vitest'
import { digitalizar, leerNumero } from '../src/lib/numeros'
import {
  describirMomento,
  entenderRecordatorio,
  entenderTemporizador,
  extraerMomento,
  leerDuracion,
  minutosHablados,
  tokenizar,
} from '../src/lib/tiempo'

const n = (t: string) => tokenizar(t).map((x) => x.n)
const MIN = 60_000

describe('leerNumero', () => {
  const v = (t: string) => leerNumero(n(t), 0)?.valor
  it('cifras y palabras', () => {
    expect(v('10')).toBe(10)
    expect(v('diez')).toBe(10)
    expect(v('quince')).toBe(15)
    expect(v('veinticinco')).toBe(25)
    expect(v('treinta y cinco')).toBe(35)
    expect(v('cuarenta y cinco')).toBe(45)
    expect(v('cien')).toBe(100)
    expect(v('ciento veinte')).toBe(120)
    expect(v('doscientos cinco')).toBe(205)
    expect(v('mil')).toBe(1000)
    expect(v('dos mil veintiseis')).toBe(2026)
  })
  it('lo que no es número da null', () => {
    expect(v('hola')).toBeUndefined()
  })
  it('no se come el "y" si no sigue una unidad', () => {
    const r = leerNumero(n('treinta y media'), 0)
    expect(r?.valor).toBe(30)
    expect(r?.hasta).toBe(1)
  })
})

describe('digitalizar', () => {
  it('cambia los números por cifras y respeta "un" artículo', () => {
    expect(digitalizar(n('poneme un temporizador de diez minutos')).join(' ')).toBe('poneme un temporizador de 10 minutos')
    expect(digitalizar(n('en una hora')).join(' ')).toBe('en 1 hora')
  })
})

describe('leerDuracion', () => {
  const d = (t: string) => leerDuracion(n(t), 0)?.ms
  it('minutos, horas y segundos', () => {
    expect(d('diez minutos')).toBe(10 * MIN)
    expect(d('10 minutos')).toBe(10 * MIN)
    expect(d('un minuto')).toBe(MIN)
    expect(d('30 segundos')).toBe(30_000)
    expect(d('dos horas')).toBe(120 * MIN)
  })
  it('medias y cuartos', () => {
    expect(d('media hora')).toBe(30 * MIN)
    expect(d('una hora y media')).toBe(90 * MIN)
    expect(d('dos horas y media')).toBe(150 * MIN)
    expect(d('un cuarto de hora')).toBe(15 * MIN)
    expect(d('tres cuartos de hora')).toBe(45 * MIN)
    expect(d('una hora y cuarto')).toBe(75 * MIN)
  })
  it('combinadas', () => {
    expect(d('una hora y treinta minutos')).toBe(90 * MIN)
    expect(d('1 hora y 30 minutos')).toBe(90 * MIN)
  })
  it('sin unidad no es una duración', () => {
    expect(d('diez perros')).toBeUndefined()
  })
})

describe('entenderTemporizador', () => {
  it('con y sin etiqueta', () => {
    expect(entenderTemporizador('poné un temporizador de diez minutos')).toEqual({ ms: 10 * MIN, etiqueta: '' })
    expect(entenderTemporizador('temporizador de media hora')).toEqual({ ms: 30 * MIN, etiqueta: '' })
    expect(entenderTemporizador('poneme un timer de cinco minutos para los huevos')).toEqual({ ms: 5 * MIN, etiqueta: 'los huevos' })
    expect(entenderTemporizador('cuenta regresiva de 5 minutos')).toEqual({ ms: 5 * MIN, etiqueta: '' })
    expect(entenderTemporizador('avisame en quince minutos')).toEqual({ ms: 15 * MIN, etiqueta: '' })
  })
  it('sin duración da null', () => {
    expect(entenderTemporizador('poneme un temporizador')).toBeNull()
  })
})

describe('extraerMomento', () => {
  // jueves 26 de noviembre de 2026, 15:00
  const ahora = new Date(2026, 10, 26, 15, 0)
  const cuando = (t: string) => extraerMomento(tokenizar(t), ahora)
  const hm = (d: Date | undefined) => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`

  it('en N minutos / horas', () => {
    expect(hm(cuando('en veinte minutos')?.cuando)).toBe('2026-11-26 15:20')
    expect(hm(cuando('dentro de dos horas')?.cuando)).toBe('2026-11-26 17:00')
    expect(cuando('en veinte minutos')?.relativo).toBe(true)
  })
  it('mañana a las nueve', () => {
    expect(hm(cuando('mañana a las nueve')?.cuando)).toBe('2026-11-27 9:00')
    expect(hm(cuando('mañana a las 9 y media')?.cuando)).toBe('2026-11-27 9:30')
    expect(hm(cuando('mañana a las cinco')?.cuando)).toBe('2026-11-27 17:00') // con día, 1–6 = tarde
  })
  it('"de la mañana" es parte del día, no el día de mañana', () => {
    expect(hm(cuando('a las nueve de la mañana')?.cuando)).toBe('2026-11-27 9:00') // ya pasaron las 9 de hoy
    expect(hm(cuando('mañana a las ocho de la mañana')?.cuando)).toBe('2026-11-27 8:00')
  })
  it('hora suelta: la próxima vez que sea esa hora', () => {
    expect(hm(cuando('a las cinco')?.cuando)).toBe('2026-11-26 17:00') // son las 15: las 5 de la tarde
    expect(hm(cuando('a las nueve')?.cuando)).toBe('2026-11-26 21:00')
    expect(hm(cuando('a las 18')?.cuando)).toBe('2026-11-26 18:00')
    expect(hm(cuando('a las dos')?.cuando)).toBe('2026-11-27 2:00') // las 2 y las 14 ya pasaron: mañana a las 2
  })
  it('partes del día', () => {
    expect(hm(cuando('a las seis de la tarde')?.cuando)).toBe('2026-11-26 18:00')
    expect(hm(cuando('a las diez de la noche')?.cuando)).toBe('2026-11-26 22:00')
    expect(hm(cuando('esta noche')?.cuando)).toBe('2026-11-26 21:00')
    expect(hm(cuando('mañana a la mañana')?.cuando)).toBe('2026-11-27 9:00')
  })
  it('menos cuarto, y cuarto, y media', () => {
    expect(hm(cuando('mañana a las diez menos cuarto')?.cuando)).toBe('2026-11-27 9:45')
    expect(hm(cuando('mañana a las ocho y cuarto')?.cuando)).toBe('2026-11-27 8:15')
  })
  it('días de la semana y fechas', () => {
    expect(hm(cuando('el viernes a las seis de la tarde')?.cuando)).toBe('2026-11-27 18:00')
    expect(hm(cuando('el lunes a las nueve')?.cuando)).toBe('2026-11-30 9:00')
    expect(hm(cuando('el jueves a las nueve')?.cuando)).toBe('2026-12-3 9:00') // hoy es jueves: el próximo
    expect(hm(cuando('el 15 de marzo a las diez')?.cuando)).toBe('2027-3-15 10:00')
    expect(hm(cuando('pasado mañana a las ocho de la mañana')?.cuando)).toBe('2026-11-28 8:00')
  })
  it('sin tiempo da null', () => {
    expect(cuando('llamar a juan')).toBeNull()
  })
  it('una hora de hoy que ya pasó, con día explícito, se avisa', () => {
    expect(cuando('hoy a las diez de la mañana')?.pasado).toBe(true)
  })
})

describe('entenderRecordatorio (qué y cuándo)', () => {
  const ahora = new Date(2026, 10, 26, 15, 0)
  const e = (t: string) => entenderRecordatorio(t, ahora)
  const hm = (d: Date | undefined) => d && `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`

  it('recordame + qué + cuándo', () => {
    const r = e('recordame llamar a Juan mañana a las nueve')
    expect(r.texto).toBe('llamar a juan')
    expect(hm(r.momento?.cuando)).toBe('11-27 9:00')
  })
  it('creame un recordatorio de ...', () => {
    expect(e('creame un recordatorio de comprar pan').texto).toBe('comprar pan')
    expect(e('creame un recordatorio de comprar pan').momento).toBeNull()
  })
  it('acordame en 20 minutos de ...', () => {
    const r = e('acordame en veinte minutos de apagar el horno')
    expect(r.texto).toBe('apagar el horno')
    expect(hm(r.momento?.cuando)).toBe('11-26 15:20')
  })
  it('avisame mañana que ...', () => {
    const r = e('avisame mañana que tengo turno con el dentista')
    expect(r.texto).toBe('tengo turno con el dentista')
    expect(hm(r.momento?.cuando)).toBe('11-27 9:00')
  })
  it('respeta las tildes y la ñ de lo que dijo', () => {
    expect(e('recordame que tengo que sacar la niña del jardín el viernes a las cinco').texto).toBe('tengo que sacar la niña del jardín')
  })
  it('solo la hora, sin qué', () => {
    const r = e('recordame mañana a las nueve')
    expect(r.texto).toBe('')
    expect(r.momento).not.toBeNull()
  })
})

describe('minutosHablados / describirMomento', () => {
  const ahora = new Date(2026, 10, 26, 15, 0)
  it('duraciones', () => {
    expect(minutosHablados(10 * MIN)).toBe('10 minutos')
    expect(minutosHablados(MIN)).toBe('1 minuto')
    expect(minutosHablados(90 * MIN)).toBe('1 hora y 30 minutos')
    expect(minutosHablados(120 * MIN)).toBe('2 horas')
    expect(minutosHablados(30_000)).toBe('30 segundos')
  })
  it('momentos', () => {
    expect(describirMomento(new Date(2026, 10, 26, 15, 20), ahora)).toBe('en 20 minutos')
    expect(describirMomento(new Date(2026, 10, 26, 17, 30), ahora)).toBe('hoy a las 17 y 30')
    expect(describirMomento(new Date(2026, 10, 27, 9, 0), ahora)).toBe('mañana a las 9')
    expect(describirMomento(new Date(2026, 10, 30, 9, 0), ahora)).toBe('el lunes a las 9')
    expect(describirMomento(new Date(2027, 2, 15, 10, 0), ahora)).toBe('el 15 de marzo a las 10')
  })
})

describe('"para las cinco" también es una hora', () => {
  const ahora = new Date(2026, 10, 26, 15, 0)
  it('en un recordatorio', () => {
    const r = entenderRecordatorio('recordame comprar pan para las cinco', ahora)
    expect(r.texto).toBe('comprar pan')
    expect(r.momento?.cuando.getHours()).toBe(17)
  })
})
