import { describe, expect, it } from 'vitest'
import { claveImpresora, elegirFoto, VENTANA_FOTO_MS, type FotoRecibida } from '../src/lib/fotos'

const foto = (clave: string, recibidaEn: number): FotoRecibida => ({ clave, nombre: clave, url: `/api/foto?impresora=${clave}`, recibidaEn })
const AVISO = 1_000_000

describe('claveImpresora', () => {
  it('normaliza igual que el servidor', () => {
    expect(claveImpresora('H2C')).toBe('h2c')
    expect(claveImpresora('Bambu H2C')).toBe('bambu-h2c')
    expect(claveImpresora('')).toBe('general')
    expect(claveImpresora(undefined)).toBe('general')
    expect(claveImpresora('A'.repeat(60)).length).toBe(40)
  })
})

describe('elegirFoto', () => {
  it('la foto que llegó justo antes o después del aviso es la suya', () => {
    expect(elegirFoto([foto('h2c', AVISO - 5_000)], AVISO, 'H2C')?.clave).toBe('h2c')
    expect(elegirFoto([foto('h2c', AVISO + 8_000)], AVISO, 'H2C')?.clave).toBe('h2c')
  })
  it('una foto vieja de otra impresión no se muestra', () => {
    expect(elegirFoto([foto('h2c', AVISO - VENTANA_FOTO_MS - 1)], AVISO, 'H2C')).toBeNull()
    expect(elegirFoto([], AVISO, 'H2C')).toBeNull()
  })
  it('no mezcla impresoras', () => {
    expect(elegirFoto([foto('a1', AVISO)], AVISO, 'H2C')).toBeNull()
  })
  it('una foto sin impresora ("general") sirve para cualquier aviso', () => {
    expect(elegirFoto([foto('general', AVISO)], AVISO, 'H2C')?.clave).toBe('general')
  })
  it('si el aviso no dice de qué impresora es, sirve la más cercana', () => {
    const f = elegirFoto([foto('a1', AVISO - 60_000), foto('h2c', AVISO - 2_000)], AVISO)
    expect(f?.clave).toBe('h2c')
  })
  it('entre varias de la misma impresora, la más cercana al aviso', () => {
    const f = elegirFoto([foto('h2c', AVISO - 50_000), foto('h2c', AVISO + 3_000)], AVISO, 'H2C')
    expect(f?.recibidaEn).toBe(AVISO + 3_000)
  })
})
