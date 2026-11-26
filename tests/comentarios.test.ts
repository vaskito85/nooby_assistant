import { describe, expect, it } from 'vitest'
import { comentarioPorMovimiento, type Movimiento } from '../src/lib/comentarios'

const MIN = 60_000
const base: Movimiento = {
  estabaPresente: true,
  estaPresente: true,
  sentadoMs: 0,
  ahora: 1_000_000_000,
  vistaAnterior: 1_000_000_000,
  ultimoYaTeVas: 0,
}
const con = (p: Partial<Movimiento>): Movimiento => ({ ...base, ...p })

describe('al irte', () => {
  it('"¿Ya te vas?" si venías hace menos de 5 minutos', () => {
    expect(comentarioPorMovimiento(con({ estaPresente: false, sentadoMs: 3 * MIN }))).toBe('yaTeVas')
    expect(comentarioPorMovimiento(con({ estaPresente: false, sentadoMs: 4 * MIN + 59_000 }))).toBe('yaTeVas')
  })
  it('nada si ya llevabas 5 minutos o más', () => {
    expect(comentarioPorMovimiento(con({ estaPresente: false, sentadoMs: 5 * MIN }))).toBeNull()
    expect(comentarioPorMovimiento(con({ estaPresente: false, sentadoMs: 50 * MIN }))).toBeNull()
  })
  it('nada si fue un parpadeo del detector (menos de 30 s)', () => {
    expect(comentarioPorMovimiento(con({ estaPresente: false, sentadoMs: 10_000 }))).toBeNull()
  })
  it('no lo repite antes de 10 minutos', () => {
    const f = con({ estaPresente: false, sentadoMs: 2 * MIN })
    expect(comentarioPorMovimiento({ ...f, ultimoYaTeVas: f.ahora - 3 * MIN })).toBeNull()
    expect(comentarioPorMovimiento({ ...f, ultimoYaTeVas: f.ahora - 11 * MIN })).toBe('yaTeVas')
  })
})

describe('al volver', () => {
  const vuelve = (ausenciaMs: number) =>
    con({ estabaPresente: false, estaPresente: true, vistaAnterior: base.ahora - ausenciaMs })

  it('"Hola de nuevo" si estuviste fuera 2 minutos o más', () => {
    expect(comentarioPorMovimiento(vuelve(2 * MIN))).toBe('holaDeNuevo')
    expect(comentarioPorMovimiento(vuelve(40 * MIN))).toBe('holaDeNuevo')
  })
  it('nada si fue una ausencia corta', () => {
    expect(comentarioPorMovimiento(vuelve(30_000))).toBeNull()
    expect(comentarioPorMovimiento(vuelve(2 * MIN - 1))).toBeNull()
  })
  it('nada la primera vez que te ve (todavía no te había visto)', () => {
    expect(comentarioPorMovimiento(con({ estabaPresente: false, estaPresente: true, vistaAnterior: 0 }))).toBeNull()
  })
})

describe('sin cambios', () => {
  it('seguís sentado o seguís ausente: no dice nada', () => {
    expect(comentarioPorMovimiento(con({}))).toBeNull()
    expect(comentarioPorMovimiento(con({ estabaPresente: false, estaPresente: false }))).toBeNull()
  })
})
