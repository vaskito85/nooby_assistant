import { describe, expect, it } from 'vitest'
import { capitalizar, escenaClima } from '../src/lib/escenas'

describe('escenaClima', () => {
  it('despejado: sol de día, luna de noche', () => {
    expect(escenaClima(0, true)).toBe('sol')
    expect(escenaClima(1, true)).toBe('sol')
    expect(escenaClima(0, false)).toBe('luna')
  })
  it('algo nublado: sol (o luna) con una nube', () => {
    expect(escenaClima(2, true)).toBe('solNubes')
    expect(escenaClima(2, false)).toBe('lunaNubes')
  })
  it('nublado, igual de día o de noche', () => {
    expect(escenaClima(3, true)).toBe('nubes')
    expect(escenaClima(3, false)).toBe('nubes')
  })
  it('niebla', () => {
    expect(escenaClima(45, true)).toBe('niebla')
    expect(escenaClima(48, false)).toBe('niebla')
  })
  it('llovizna, lluvia y chaparrones son lluvia', () => {
    for (const c of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]) expect(escenaClima(c, true), String(c)).toBe('lluvia')
  })
  it('nieve', () => {
    for (const c of [71, 73, 75, 77, 85, 86]) expect(escenaClima(c, true), String(c)).toBe('nieve')
  })
  it('tormenta', () => {
    for (const c of [95, 96, 99]) expect(escenaClima(c, false), String(c)).toBe('tormenta')
  })
  it('un código raro cae a nubes: nunca rompe', () => {
    expect(escenaClima(-1, true)).toBe('nubes')
    expect(escenaClima(42, true)).toBe('nubes')
  })
})

describe('capitalizar', () => {
  it('pone la primera en mayúscula', () => {
    expect(capitalizar('despejado')).toBe('Despejado')
    expect(capitalizar('')).toBe('')
  })
})
