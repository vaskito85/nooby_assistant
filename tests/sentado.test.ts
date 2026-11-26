import { describe, expect, it } from 'vitest'
import { Sentado } from '../src/lib/sentado'

const MIN = 60_000
const cfg = { limiteMs: 60 * MIN, graciaMs: 10_000, ausenciaResetMs: 5 * MIN, repetirMs: 10 * MIN }

/** Simula `ms` de tiempo en pasos de 1 s. */
function correr(s: Sentado, desde: number, ms: number, visible: boolean) {
  let avisos = 0
  let t = desde
  for (; t < desde + ms; t += 1000) if (s.tick(t, visible).avisar) avisos++
  return { t, avisos }
}

describe('Sentado', () => {
  it('avisa al llegar al límite', () => {
    const s = new Sentado(cfg)
    const a = correr(s, 1000, 59 * MIN, true)
    expect(a.avisos).toBe(0)
    const b = correr(s, a.t, 2 * MIN, true)
    expect(b.avisos).toBe(1)
  })

  it('repite el aviso cada 10 min si seguís sentado', () => {
    const s = new Sentado(cfg)
    const r = correr(s, 1000, 85 * MIN, true)
    expect(r.avisos).toBe(3) // 60, 70, 80
  })

  it('una pausa corta no reinicia, una larga sí', () => {
    const s = new Sentado(cfg)
    let r = correr(s, 1000, 30 * MIN, true)
    r = correr(s, r.t, 2 * MIN, false) // se paró 2 min
    expect(s.sentadoMs).toBeGreaterThan(29 * MIN)
    r = correr(s, r.t, 6 * MIN, false) // 8 min en total ausente
    expect(s.sentadoMs).toBe(0)
  })

  it('no cuenta tiempo si no te ve', () => {
    const s = new Sentado(cfg)
    correr(s, 1000, 20 * MIN, false)
    expect(s.sentadoMs).toBe(0)
  })

  it('un salto grande de reloj no suma horas de golpe', () => {
    const s = new Sentado(cfg)
    s.tick(1000, true)
    s.tick(1000 + 3 * 60 * MIN, true)
    expect(s.sentadoMs).toBeLessThanOrEqual(5000)
  })
})
