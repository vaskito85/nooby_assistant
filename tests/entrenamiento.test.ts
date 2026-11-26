import { describe, expect, it } from 'vitest'
import { limpiarLlamadas, limpiarVariante } from '../src/lib/config'
import { detectarLlamado } from '../src/lib/voz'

describe('detectarLlamado con frases entrenadas con tu voz', () => {
  // Lo que el reconocedor escribió cuando el usuario dijo "che nooby" en el entrenamiento
  const variantes = ['china vi', 'lleno y', 'no ve']

  it('despierta cuando oye una de las variantes entrenadas', () => {
    expect(detectarLlamado('china vi', { gramatica: true, variantes }).llamado).toBe(true)
    expect(detectarLlamado('lleno y', { gramatica: true, variantes }).llamado).toBe(true)
    expect(detectarLlamado('No Ve', { gramatica: true, variantes }).llamado).toBe(true)
  })
  it('devuelve lo que se dijo después de la frase', () => {
    const r = detectarLlamado('china vi que hora es', { variantes })
    expect(r.llamado).toBe(true)
    expect(r.resto).toBe('que hora es')
  })
  it('solo cuenta palabras enteras (no una parte de otra palabra)', () => {
    expect(detectarLlamado('anoveras', { variantes }).llamado).toBe(false)
    expect(detectarLlamado('el mono ven', { variantes: ['no ve'] }).llamado).toBe(false)
  })
  it('ignora el [unk] del reconocedor', () => {
    expect(detectarLlamado('[unk] china vi [unk]', { gramatica: true, variantes }).llamado).toBe(true)
    expect(detectarLlamado('[unk]', { gramatica: true, variantes }).llamado).toBe(false)
  })
  it('sin variantes entrenadas sigue funcionando lo de siempre', () => {
    expect(detectarLlamado('che nubi', { variantes: [] }).llamado).toBe(true)
    expect(detectarLlamado('estoy mirando la tele', { variantes }).llamado).toBe(false)
  })
})

describe('limpiarVariante / limpiarLlamadas (validan lo que viene de afuera)', () => {
  it('acepta frases cortas en minúsculas, con tildes y ñ', () => {
    expect(limpiarVariante('China Vi')).toBe('china vi')
    expect(limpiarVariante('  está   la  niña ')).toBe('está la niña')
  })
  it('rechaza lo raro: símbolos, vacío, demasiado largo, demasiadas palabras', () => {
    expect(limpiarVariante('')).toBe('')
    expect(limpiarVariante('hola; drop table')).toBe('')
    expect(limpiarVariante('<script>')).toBe('')
    expect(limpiarVariante('a'.repeat(41))).toBe('')
    expect(limpiarVariante('uno dos tres cuatro cinco seis')).toBe('')
    expect(limpiarVariante(42)).toBe('')
  })
  it('sin repetidas, sin basura y con tope de 20', () => {
    expect(limpiarLlamadas(['china vi', 'China vi', 'lleno y', 5, '', '#x'])).toEqual(['china vi', 'lleno y'])
    const muchas = Array.from({ length: 40 }, (_, i) => 'palabra' + 'abcdefghijklmnopqrstuvwxyzabcdefghijklmn'[i])
    expect(limpiarLlamadas(muchas).length).toBe(20)
    expect(limpiarLlamadas('no es lista')).toEqual([])
  })
})
