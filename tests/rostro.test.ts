import { describe, expect, it } from 'vitest'
import { duracionEstimada, pasoEn, planHabla, POSES, trazoBoca, type Humor } from '../src/lib/rostro'

const TODOS: Humor[] = ['normal', 'feliz', 'dormido', 'alerta', 'hablando', 'enojado', 'atento', 'pensando', 'sorprendido', 'triste', 'confuso', 'risa', 'bostezo']

describe('poses', () => {
  it('hay una pose para cada humor, con todos los números a la vista', () => {
    for (const h of TODOS) {
      const p = POSES[h]
      expect(p, h).toBeDefined()
      for (const k of ['lid', 'lidAng', 'lift', 'ojo', 'ceja', 'cejaAng', 'cejaIzq', 'ancho', 'abre', 'sonrisa', 'redonda', 'mejilla', 'incl'] as const) {
        expect(Number.isFinite(p[k]), `${h}.${k}`).toBe(true)
      }
    }
  })
  it('los humores se distinguen en lo importante', () => {
    expect(POSES.dormido.lid).toBeGreaterThan(0.9) // ojos cerrados
    expect(POSES.feliz.sonrisa).toBeGreaterThan(0.8)
    expect(POSES.enojado.sonrisa).toBeLessThan(0)
    expect(POSES.enojado.cejaAng).toBeGreaterThan(0.5) // cejas en V
    expect(POSES.triste.cejaAng).toBeLessThan(-0.5) // puntas de adentro arriba
    expect(POSES.sorprendido.abre).toBeGreaterThan(0.6)
    expect(POSES.sorprendido.ceja).toBeGreaterThan(0.8)
    expect(POSES.pensando.miraY).toBeLessThan(0) // mira hacia arriba
    expect(POSES.risa.lift).toBeGreaterThan(0.5) // ojos en arco
  })
})

describe('trazoBoca', () => {
  const abierta = trazoBoca({ ancho: 0.8, abre: 1, sonrisa: 0, redonda: 0 })
  const cerrada = trazoBoca({ ancho: 0.8, abre: 0, sonrisa: 0, redonda: 0 })

  it('arma un contorno cerrado válido', () => {
    expect(abierta.d).toMatch(/^M[\d. -]+ Q[\d. -]+ [\d. -]+ Q[\d. -]+ [\d. -]+Z$/)
    expect(abierta.d).not.toContain('NaN')
  })
  it('abrir la boca separa los labios; cerrada no tiene apertura', () => {
    expect(cerrada.alto).toBe(0)
    expect(abierta.alto).toBeGreaterThan(60)
    expect(abierta.medioAbajo - abierta.medioArriba).toBeCloseTo(abierta.alto, 5)
  })
  it('la sonrisa sube las esquinas respecto del medio; la mueca las baja', () => {
    const sonrisa = trazoBoca({ ancho: 0.6, abre: 0, sonrisa: 1, redonda: 0 })
    const mueca = trazoBoca({ ancho: 0.6, abre: 0, sonrisa: -1, redonda: 0 })
    const esquinaY = (d: string) => Number(/^M[\d.]+ ([\d.]+)/.exec(d)![1])
    expect(esquinaY(sonrisa.d)).toBeLessThan(esquinaY(mueca.d)) // más arriba = número menor
    expect(sonrisa.medioArriba).toBeGreaterThan(mueca.medioArriba)
  })
  it('redonda hace la boca más angosta; el ancho crece con el parámetro', () => {
    const ancha = trazoBoca({ ancho: 1, abre: 0.5, sonrisa: 0, redonda: 0 })
    const o = trazoBoca({ ancho: 1, abre: 0.5, sonrisa: 0, redonda: 1 })
    expect(o.ancho).toBeLessThan(ancha.ancho)
    expect(trazoBoca({ ancho: 0, abre: 0, sonrisa: 0, redonda: 0 }).ancho).toBeLessThan(ancha.ancho)
  })
  it('valores fuera de rango no la rompen', () => {
    const t = trazoBoca({ ancho: 9, abre: -3, sonrisa: 5, redonda: 7 })
    expect(t.d).not.toContain('NaN')
    expect(t.alto).toBe(0)
  })
})

describe('planHabla', () => {
  it('una forma de boca por letra y pausas en la puntuación', () => {
    const p = planHabla('Hola, sí.')
    expect(p.length).toBe(9) // h o l a , (espacio) s i .
  })
  it('las vocales abren más que b/m/p', () => {
    const [a] = planHabla('a')
    const [m] = planHabla('m')
    expect(a.abre).toBeGreaterThan(0.8)
    expect(m.abre).toBe(0)
  })
  it('o y u son redondas; a y e no', () => {
    expect(planHabla('o')[0].redonda).toBeGreaterThan(0.5)
    expect(planHabla('u')[0].redonda).toBeGreaterThan(0.5)
    expect(planHabla('a')[0].redonda).toBe(0)
  })
  it('ignora tildes y mayúsculas', () => {
    expect(planHabla('ÁÉÍÓÚ').map((p) => p.abre)).toEqual(planHabla('aeiou').map((p) => p.abre))
  })
  it('los tiempos son consecutivos y se pueden estirar a una duración', () => {
    const p = planHabla('Buenas tardes, ¿cómo estás?', 3000)
    expect(p[0].t).toBe(0)
    for (let i = 1; i < p.length; i++) expect(p[i].t).toBeCloseTo(p[i - 1].t + p[i - 1].dur, 5)
    const fin = p[p.length - 1]
    expect(fin.t + fin.dur).toBeCloseTo(3000, 3)
  })
  it('un texto vacío no da pasos', () => {
    expect(planHabla('')).toEqual([])
    expect(planHabla('   ')).toHaveLength(3)
  })
})

describe('pasoEn', () => {
  const plan = planHabla('hola', 400)
  it('encuentra el paso de cada instante y termina en null', () => {
    expect(pasoEn(plan, 0)).toBe(plan[0])
    expect(pasoEn(plan, plan[2].t + 1)).toBe(plan[2])
    expect(pasoEn(plan, 400)).toBeNull()
    expect(pasoEn(plan, 5000)).toBeNull()
    expect(pasoEn(plan, -5)).toBeNull()
    expect(pasoEn([], 10)).toBeNull()
  })
})

describe('duracionEstimada', () => {
  it('crece con el largo del texto y tiene un mínimo', () => {
    expect(duracionEstimada('hola')).toBe(600)
    expect(duracionEstimada('x'.repeat(140))).toBe(10000)
  })
})
