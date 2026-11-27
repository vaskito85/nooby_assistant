// @ts-ignore — módulos de node (el proyecto no trae @types/node)
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
// @ts-ignore
import { tmpdir } from 'node:os'
// @ts-ignore
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-ignore — módulo .mjs del servidor, sin tipos
import { claveDia, crearBitacora, crearMemoria, esDia, leerLinea, plano } from '../servidor/bitacora.mjs'
import { extraerNota, interpretar } from '../src/lib/voz'

let carpeta = ''
let hora = new Date(2026, 10, 27, 18, 5)
beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'nooby-bit-'))
  hora = new Date(2026, 10, 27, 18, 5)
})
afterEach(() => rmSync(carpeta, { recursive: true, force: true }))

const nueva = () => crearBitacora(join(carpeta, 'bitacora'), { ahora: () => hora })

describe('días', () => {
  it('solo acepta AAAA-MM-DD (nada de ../ para escapar de la carpeta)', () => {
    expect(esDia('2026-11-27')).toBe(true)
    for (const x of ['../config', '2026-13-45', '2026-1-1', '', null, undefined, '2026-11-27/../x']) expect(esDia(x)).toBe(false)
    expect(claveDia(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('bitácora', () => {
  it('guarda lo que se habla y lo lee de vuelta', () => {
    const b = nueva()
    expect(b.anotar('yo', 'Poneme un temporizador', 'Ger')).toBe(true)
    hora = new Date(2026, 10, 27, 18, 6)
    expect(b.anotar('nooby', 'Listo, diez minutos.')).toBe(true)
    expect(b.anotar('nota', 'Terminé el soporte')).toBe(true)
    expect(b.entradas('2026-11-27')).toEqual([
      { hora: '18:05', rol: 'yo', quien: 'Ger', texto: 'Poneme un temporizador' },
      { hora: '18:06', rol: 'nooby', quien: 'Nooby', texto: 'Listo, diez minutos.' },
      { hora: '18:06', rol: 'nota', quien: '', texto: 'Terminé el soporte' },
    ])
  })

  it('el archivo es markdown legible, con título del día', () => {
    const b = nueva()
    b.anotar('yo', 'hola', 'Ger')
    const md = readFileSync(join(carpeta, 'bitacora', '2026-11-27.md'), 'utf8')
    expect(md).toMatch(/^# Bitácora — .*2026/)
    expect(md).toContain('- **18:05** **Ger:** hola')
    expect(b.markdown('2026-11-27')).toBe(md)
    expect(b.markdown('2026-11-26')).toBeNull()
  })

  it('no guarda vacíos ni roles raros, y aplana saltos de línea', () => {
    const b = nueva()
    expect(b.anotar('yo', '   ')).toBe(false)
    expect(b.anotar('otro', 'hola')).toBe(false)
    expect(b.anotar('nota', 'línea 1\n- **99:99** línea 2')).toBe(true)
    expect(b.entradas('2026-11-27')).toHaveLength(1)
  })

  it('lista los días (el más nuevo primero) con su cantidad', () => {
    const b = nueva()
    b.anotar('yo', 'a')
    hora = new Date(2026, 10, 28, 9, 0)
    b.anotar('yo', 'b')
    b.anotar('nooby', 'c')
    expect(b.dias()).toEqual([
      { dia: '2026-11-28', entradas: 2 },
      { dia: '2026-11-27', entradas: 1 },
    ])
  })

  it('busca sin importar tildes ni mayúsculas, más nuevo primero', () => {
    const b = nueva()
    b.anotar('yo', 'Imprimí la pieza en la H2C')
    hora = new Date(2026, 10, 28, 9, 0)
    b.anotar('nota', 'La H2C quedó con error')
    const r = b.buscar('h2c')
    expect(r.map((x: { dia: string }) => x.dia)).toEqual(['2026-11-28', '2026-11-27'])
    expect(b.buscar('impri')[0].texto).toContain('pieza')
    expect(b.buscar('  ')).toEqual([])
    expect(b.buscar('zzz')).toEqual([])
  })

  it('arma el texto de un rango para la IA y recorta lo viejo si es largo', () => {
    const b = nueva()
    b.anotar('yo', 'primero', 'Ger')
    hora = new Date(2026, 10, 29, 9, 0)
    b.anotar('nooby', 'segundo')
    expect(b.rango('2026-11-27', '2026-11-29')).toBe('[2026-11-27 18:05] Ger: primero\n[2026-11-29 09:00] Nooby: segundo')
    expect(b.rango('2026-11-28', '2026-11-28')).toBe('')
    expect(b.rango('mal')).toBe('')
    const corto = b.rango('2026-11-27', '2026-11-29', 30)
    expect(corto.length).toBeLessThanOrEqual(31)
    expect(corto.startsWith('…')).toBe(true)
    expect(corto).toContain('segundo')
  })

  it('borra un día y las últimas entradas', () => {
    const b = nueva()
    b.anotar('yo', 'uno')
    b.anotar('nooby', 'dos')
    b.anotar('yo', 'tres')
    b.anotar('nooby', 'cuatro')
    expect(b.quitarUltimas(2)).toBe(2)
    expect(b.entradas('2026-11-27').map((e: { texto: string }) => e.texto)).toEqual(['uno', 'dos'])
    expect(b.borrarDia('2026-11-27')).toBe(true)
    expect(b.borrarDia('2026-11-27')).toBe(false)
    expect(b.borrarDia('../x')).toBe(false)
    expect(b.dias()).toEqual([])
    expect(b.quitarUltimas(2)).toBe(0)
  })
})

describe('leerLinea', () => {
  it('ignora el título y las líneas que no son entradas', () => {
    expect(leerLinea('# Bitácora')).toBeNull()
    expect(leerLinea('')).toBeNull()
    expect(leerLinea('- **18:05** 📝 algo')).toMatchObject({ rol: 'nota', texto: 'algo' })
  })
})

describe('memoria', () => {
  it('guarda datos sin repetir, los olvida por texto y por id', () => {
    const m = crearMemoria(join(carpeta, 'memoria.json'), { ahora: () => 1 })
    const a = m.agregar('Mi hermano se llama Pablo')
    expect(m.agregar('mi hermano se llama pablo').id).toBe(a.id)
    m.agregar('Prefiero el café sin azúcar')
    expect(m.listar()).toHaveLength(2)
    expect(m.agregar('  ')).toBeNull()
    expect(m.olvidar('HERMANO')).toBe(1)
    expect(m.listar().map((x: { texto: string }) => x.texto)).toEqual(['Prefiero el café sin azúcar'])
    expect(m.borrarId(m.listar()[0].id)).toBe(1)
    expect(m.listar()).toEqual([])
    expect(m.olvidar('')).toBe(0)
  })

  it('con un archivo roto empieza de cero', () => {
    expect(crearMemoria(join(carpeta, 'no-existe.json')).listar()).toEqual([])
  })
})

describe('plano', () => {
  it('saca tildes y mayúsculas', () => {
    expect(plano('Bitácora ÑANDÚ')).toBe('bitacora nandu')
  })
})

describe('pedidos de bitácora por voz', () => {
  it('entiende anotar, pausar, retomar y borrar lo último', () => {
    expect(interpretar('anotá en la bitácora que terminé el soporte')).toBe('anotarBitacora')
    expect(interpretar('anotá en la bitácora que estuve sentado todo el día')).toBe('anotarBitacora')
    expect(interpretar('no guardes esto')).toBe('pausarBitacora')
    expect(interpretar('modo privado')).toBe('pausarBitacora')
    expect(interpretar('salí del modo privado')).toBe('retomarBitacora')
    expect(interpretar('seguí guardando')).toBe('retomarBitacora')
    expect(interpretar('borrá lo último')).toBe('borrarUltimo')
  })
  it('no confunde con otros pedidos', () => {
    expect(interpretar('anotame que mañana tengo turno')).toBe('recordatorio')
    expect(interpretar('cancelá el temporizador')).toBe('cancelarAgenda')
    expect(interpretar('qué hora es')).toBe('hora')
  })
})

describe('extraerNota', () => {
  it('saca lo que hay que anotar', () => {
    expect(extraerNota('Anotá en la bitácora que terminé el soporte')).toBe('terminé el soporte')
    expect(extraerNota('guardá en el diario: hoy imprimí la A1')).toBe('hoy imprimí la A1')
    expect(extraerNota('anotá que llamé a Juan en la bitácora')).toBe('llamé a Juan')
  })
  it('si no dijo qué anotar devuelve vacío', () => {
    expect(extraerNota('anotá en la bitácora')).toBe('')
    expect(extraerNota('hola')).toBe('')
  })
})
