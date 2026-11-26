import { describe, expect, it } from 'vitest'
import { cuantoFalta, pascua, tercerDomingo } from '../src/lib/fechas'

// jueves 26 de noviembre de 2026, 15:00
const ahora = new Date(2026, 10, 26, 15, 0)
const f = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

describe('fechas móviles', () => {
  it('Pascua', () => {
    expect(f(pascua(2026))).toBe('2026-4-5')
    expect(f(pascua(2027))).toBe('2027-3-28')
    expect(f(pascua(2025))).toBe('2025-4-20')
  })
  it('tercer domingo (Día del Padre = junio, Día de la Madre = octubre)', () => {
    expect(f(tercerDomingo(2026, 5))).toBe('2026-6-21')
    expect(f(tercerDomingo(2026, 9))).toBe('2026-10-18')
  })
})

describe('cuantoFalta', () => {
  it('Navidad', () => {
    expect(cuantoFalta('cuánto falta para Navidad', ahora)).toBe('Faltan 29 días para Navidad, o sea unas 4 semanas.')
  })
  it('otras fechas del año', () => {
    expect(cuantoFalta('cuánto falta para fin de año', ahora)).toContain('Faltan 35 días para fin de año')
    expect(cuantoFalta('cuántos días faltan para año nuevo', ahora)).toContain('Faltan 36 días para Año Nuevo')
    expect(cuantoFalta('cuánto falta para reyes', ahora)).toContain('Faltan 41 días para Reyes')
  })
  it('hoy y mañana', () => {
    expect(cuantoFalta('cuánto falta para navidad', new Date(2026, 11, 25, 9, 0))).toBe('Hoy es Navidad.')
    expect(cuantoFalta('cuánto falta para navidad', new Date(2026, 11, 24, 9, 0))).toBe('Mañana es Navidad.')
  })
  it('si ya pasó este año, cuenta para el que viene', () => {
    // el 26 de diciembre ya pasó la Navidad de 2026
    const t = cuantoFalta('cuánto falta para navidad', new Date(2026, 11, 26, 9, 0))
    expect(t).toContain('Faltan 364 días para Navidad')
  })
  it('una fecha cualquiera', () => {
    expect(cuantoFalta('cuántos días faltan para el 15 de marzo', ahora)).toContain('Faltan 109 días para el 15 de marzo')
    expect(cuantoFalta('cuánto falta para el viernes', ahora)).toBe('Mañana es el viernes.')
    expect(cuantoFalta('cuánto falta para el lunes', ahora)).toBe('Faltan 4 días para el lunes.')
  })
  it('una hora de hoy: lo cuenta en horas y minutos', () => {
    expect(cuantoFalta('cuánto falta para las cinco de la tarde', ahora)).toBe('Faltan 2 horas.')
    expect(cuantoFalta('cuánto falta para las cinco y media de la tarde', ahora)).toBe('Faltan 2 horas y 30 minutos.')
  })
  it('Pascua y el Día de la Madre', () => {
    expect(cuantoFalta('cuánto falta para pascua', ahora)).toContain('para Pascua')
    expect(cuantoFalta('cuánto falta para el día de la madre', ahora)).toContain('para el Día de la Madre')
  })
  it('no entiende para qué: null', () => {
    expect(cuantoFalta('cuánto falta', ahora)).toBeNull()
    expect(cuantoFalta('cuánto falta para el almuerzo', ahora)).toBeNull()
  })
})
