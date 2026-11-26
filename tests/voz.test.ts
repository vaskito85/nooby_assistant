import { describe, expect, it } from 'vitest'
import { detectarLlamado, distancia, interpretar, normalizar } from '../src/lib/voz'

describe('normalizar', () => {
  it('saca tildes, signos y mayúsculas', () => {
    expect(normalizar('¿Qué Hora es?')).toBe('que hora es')
    expect(normalizar('  Cómo   está el CLIMA!! ')).toBe('como esta el clima')
  })
})

describe('distancia', () => {
  it('cuenta ediciones', () => {
    expect(distancia('nubi', 'nubi')).toBe(0)
    expect(distancia('nube', 'nubi')).toBe(1)
    expect(distancia('gato', 'perro')).toBe(4)
  })
})

describe('detectarLlamado', () => {
  it('te llaman con "che nooby" escrito como suena', () => {
    expect(detectarLlamado('che nubi').llamado).toBe(true)
    expect(detectarLlamado('Che Nuvi').llamado).toBe(true)
    expect(detectarLlamado('che nuby').llamado).toBe(true)
  })
  it('tolera cómo lo entiende mal el reconocedor, pero solo después de "che"', () => {
    expect(detectarLlamado('che nuevo').llamado).toBe(true)
    expect(detectarLlamado('che nube').llamado).toBe(true)
    expect(detectarLlamado('hay una nube en el cielo').llamado).toBe(false)
    expect(detectarLlamado('el nuevo auto').llamado).toBe(false)
  })
  it('devuelve lo que dijiste después', () => {
    const r = detectarLlamado('che nubi como esta el clima')
    expect(r.llamado).toBe(true)
    expect(r.resto).toBe('como esta el clima')
  })
  it('no se despierta con conversación normal', () => {
    expect(detectarLlamado('estoy mirando la tele').llamado).toBe(false)
    expect(detectarLlamado('che mira esto').llamado).toBe(false)
    expect(detectarLlamado('').llamado).toBe(false)
  })
})

describe('interpretar', () => {
  it('clima', () => {
    expect(interpretar('como esta el clima')).toBe('clima')
    expect(interpretar('va a llover hoy')).toBe('clima')
    expect(interpretar('que temperatura hace')).toBe('clima')
    expect(interpretar('como esta el tiempo')).toBe('clima')
  })
  it('hora', () => {
    expect(interpretar('que hora es')).toBe('hora')
  })
  it('"cuánto tiempo llevo sentado" no es el clima', () => {
    expect(interpretar('cuanto tiempo llevo sentado')).toBe('tiempoSentado')
    expect(interpretar('hace cuanto estoy sentado')).toBe('tiempoSentado')
  })
  it('levante, agua, chau, ayuda', () => {
    expect(interpretar('ya me levante')).toBe('levante')
    expect(interpretar('ya tome agua')).toBe('agua')
    expect(interpretar('gracias')).toBe('chau')
    expect(interpretar('que sabes hacer')).toBe('ayuda')
  })
  it('lo que no entiende da null', () => {
    expect(interpretar('poneme una pizza')).toBeNull()
    expect(interpretar('')).toBeNull()
  })
})

describe('detectarLlamado con gramática cerrada (APK)', () => {
  it('"nube" sola despierta (lo más parecido a "nooby" que conoce el modelo)', () => {
    expect(detectarLlamado('nube', { gramatica: true }).llamado).toBe(true)
    expect(detectarLlamado('nubes', { gramatica: true }).llamado).toBe(true)
    expect(detectarLlamado('che nube', { gramatica: true }).llamado).toBe(true)
  })
  it('sin gramática, "nube" sola no despierta', () => {
    expect(detectarLlamado('nube').llamado).toBe(false)
    expect(detectarLlamado('hay una nube').llamado).toBe(false)
  })
  it('"che" sola o [unk] no despierta', () => {
    expect(detectarLlamado('che', { gramatica: true }).llamado).toBe(false)
    expect(detectarLlamado('[unk]', { gramatica: true }).llamado).toBe(false)
    expect(detectarLlamado('', { gramatica: true }).llamado).toBe(false)
  })
})
