import { describe, expect, it } from 'vitest'
import { LECTURA_VIGENTE_MS, PC_ACTIVA_MS, pcActivo } from '../src/lib/actividad'
import { describirImpresoras, duracion, INFORME_VIGENTE_MS } from '../src/lib/impresoras'
import { interpretar } from '../src/lib/voz'

describe('pcActivo (usar la PC cuenta como estar sentado)', () => {
  const ahora = 1_000_000

  it('activo si la última tecla fue hace poco', () => {
    expect(pcActivo({ idleMs: 5_000, en: ahora }, ahora)).toBe(true)
    expect(pcActivo({ idleMs: PC_ACTIVA_MS - 1, en: ahora }, ahora)).toBe(true)
  })
  it('inactivo si pasó el umbral', () => {
    expect(pcActivo({ idleMs: PC_ACTIVA_MS, en: ahora }, ahora)).toBe(false)
    expect(pcActivo({ idleMs: 10 * 60_000, en: ahora }, ahora)).toBe(false)
  })
  it('descuenta el tiempo que pasó desde el informe', () => {
    // el informe decía "hace 80 s"; pasaron 20 s más → ya son 100 s
    expect(pcActivo({ idleMs: 80_000, en: ahora - 20_000 }, ahora)).toBe(false)
    expect(pcActivo({ idleMs: 10_000, en: ahora - 20_000 }, ahora)).toBe(true)
  })
  it('sin informes (o muy viejos) no supone nada: cae a la cámara', () => {
    expect(pcActivo(null, ahora)).toBe(false)
    expect(pcActivo({ idleMs: 0, en: ahora - LECTURA_VIGENTE_MS - 1 }, ahora)).toBe(false)
    expect(pcActivo({ idleMs: 0, en: ahora + 5_000 }, ahora)).toBe(false) // reloj raro
  })
})

describe('duracion', () => {
  it('lo dice como una persona', () => {
    expect(duracion(0)).toBe('menos de un minuto')
    expect(duracion(1)).toBe('1 minuto')
    expect(duracion(35)).toBe('35 minutos')
    expect(duracion(60)).toBe('1 hora')
    expect(duracion(95)).toBe('1 hora y 35 minutos')
    expect(duracion(121)).toBe('2 horas y 1 minuto')
  })
})

describe('describirImpresoras', () => {
  const ahora = 5_000_000
  const informe = (impresoras: Parameters<typeof describirImpresoras>[0]['impresoras'], hace = 10_000) => ({
    ts: ahora - hace,
    impresoras,
  })

  it('cuenta lo que hace cada una', () => {
    const t = describirImpresoras(
      informe([
        { nombre: 'H2C', estado: 'imprimiendo', progreso: 45, restanteMin: 95 },
        { nombre: 'A1', estado: 'libre' },
        { nombre: 'Neptune', estado: 'error' },
      ]),
      ahora,
    )
    expect(t).toBe('H2C está imprimiendo, va por el 45 por ciento, faltan 1 hora y 35 minutos. A1 está libre. Neptune tiene un error.')
  })
  it('imprimiendo sin datos de avance no inventa nada', () => {
    expect(describirImpresoras(informe([{ nombre: 'H2C', estado: 'imprimiendo' }]), ahora)).toBe('H2C está imprimiendo.')
  })
  it('sin informe todavía', () => {
    expect(describirImpresoras({ ts: null, impresoras: [] }, ahora)).toBe('Todavía no tengo información de las impresoras.')
    expect(describirImpresoras(informe([]), ahora)).toBe('Todavía no tengo información de las impresoras.')
  })
  it('informe viejo: no dice algo que puede ser falso', () => {
    const t = describirImpresoras(informe([{ nombre: 'H2C', estado: 'libre' }], INFORME_VIGENTE_MS + 1), ahora)
    expect(t).toBe('No tengo datos recientes de las impresoras.')
  })
})

describe('interpretar: impresoras', () => {
  it('lo entiende de varias formas', () => {
    expect(interpretar('como van las impresoras')).toBe('impresoras')
    expect(interpretar('cuanto falta')).toBe('impresoras')
    expect(interpretar('que esta imprimiendo')).toBe('impresoras')
    expect(interpretar('como va la impresion')).toBe('impresoras')
  })
  it('no pisa los otros pedidos', () => {
    expect(interpretar('como esta el clima')).toBe('clima')
    expect(interpretar('que hora es')).toBe('hora')
    expect(interpretar('cuanto tiempo llevo sentado')).toBe('tiempoSentado')
  })
})
