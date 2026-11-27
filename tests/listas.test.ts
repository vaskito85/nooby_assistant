// @ts-ignore — módulos de node (el proyecto no trae @types/node)
import { mkdtempSync, rmSync } from 'node:fs'
// @ts-ignore
import { tmpdir } from 'node:os'
// @ts-ignore
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-ignore — módulo .mjs del servidor, sin tipos
import { crearListas, leerLista } from '../servidor/listas.mjs'
import { entenderLista } from '../src/lib/listas'
import { interpretar } from '../src/lib/voz'

let carpeta = ''
beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'nooby-listas-'))
})
afterEach(() => rmSync(carpeta, { recursive: true, force: true }))
const nueva = () => crearListas(join(carpeta, 'listas.json'))

describe('entenderLista (lo que decís)', () => {
  it('agregar uno o varios ítems', () => {
    expect(entenderLista('agregá leche y pan a la lista de compras')).toEqual({ accion: 'agregar', lista: 'compras', items: ['leche', 'pan'] })
    expect(entenderLista('anotá limpiar el taller en la lista')).toEqual({ accion: 'agregar', lista: '', items: ['limpiar el taller'] })
    expect(entenderLista('poné filamento negro, filamento blanco y boquillas en la lista de compras por favor')).toEqual({
      accion: 'agregar',
      lista: 'compras',
      items: ['filamento negro', 'filamento blanco', 'boquillas'],
    })
  })
  it('agregar con los ítems después de nombrar la lista', () => {
    expect(entenderLista('agregá a la lista de compras leche y huevos')).toEqual({ accion: 'agregar', lista: 'compras', items: ['leche', 'huevos'] })
  })
  it('conserva tildes y mayúsculas de lo que anotás', () => {
    expect(entenderLista('agregá Café y azúcar a la lista de compras')?.items).toEqual(['Café', 'azúcar'])
  })
  it('leer una lista', () => {
    expect(entenderLista('qué hay en la lista de compras')).toEqual({ accion: 'ver', lista: 'compras', items: [] })
    expect(entenderLista('leeme la lista')).toEqual({ accion: 'ver', lista: '', items: [] })
    expect(entenderLista('cómo va la lista del taller')).toEqual({ accion: 'ver', lista: 'taller', items: [] })
  })
  it('tachar', () => {
    expect(entenderLista('tachá leche')).toEqual({ accion: 'marcar', lista: '', items: ['leche'] })
    expect(entenderLista('marcá limpiar el taller como hecho')).toEqual({ accion: 'marcar', lista: '', items: ['limpiar el taller'] })
    expect(entenderLista('ya compré la leche de la lista de compras')).toEqual({ accion: 'marcar', lista: 'compras', items: ['la leche'] })
  })
  it('sacar y vaciar', () => {
    expect(entenderLista('sacá el pan de la lista de compras')).toEqual({ accion: 'quitar', lista: 'compras', items: ['el pan'] })
    expect(entenderLista('vaciá la lista de compras')).toEqual({ accion: 'vaciar', lista: 'compras', items: [] })
    expect(entenderLista('borrá la lista')).toEqual({ accion: 'vaciar', lista: '', items: [] })
  })
  it('lo que no es de listas devuelve null', () => {
    for (const t of ['qué hora es', 'agregá leche', 'anotá en la bitácora que terminé el soporte', 'poneme un temporizador de cinco minutos', 'ya compré la leche', 'hola cómo estás', 'quiero hacer una lista de objetivos para el año que viene']) {
      expect(entenderLista(t), t).toBeNull()
    }
  })
  it('interpretar las manda a su orden y no pisa la bitácora ni los recordatorios', () => {
    expect(interpretar('agregá leche a la lista de compras')).toBe('listaAgregar')
    expect(interpretar('tachá leche')).toBe('listaMarcar')
    expect(interpretar('anotá en la bitácora que terminé el soporte')).toBe('anotarBitacora')
    expect(interpretar('anotame que mañana tengo turno')).toBe('recordatorio')
    expect(interpretar('borrá los recordatorios')).toBe('cancelarAgenda')
  })
})

describe('listas (en el servidor)', () => {
  it('agrega ítems, crea la lista y no repite', () => {
    const l = nueva()
    const r = l.agregar('compras', ['Leche', 'pan'])
    expect(r.nombre).toBe('compras')
    expect(r.sumados).toBe(2)
    const otra = l.agregar('la lista de compras', ['leche', 'huevos']) // misma lista, "leche" repetida
    expect(otra.sumados).toBe(1)
    expect(otra.repetidos).toEqual(['leche'])
    expect(l.ver('compras').items.map((i: { texto: string }) => i.texto)).toEqual(['Leche', 'pan', 'huevos'])
    expect(l.todas()).toHaveLength(1)
  })
  it('sin nombre usa "pendientes"', () => {
    const l = nueva()
    expect(l.agregar('', ['limpiar el taller']).nombre).toBe('pendientes')
    expect(l.ver('pendientes').items).toHaveLength(1)
  })
  it('tacha por texto parcial, sin tildes ni mayúsculas, o por número', () => {
    const l = nueva()
    l.agregar('compras', ['Café molido', 'pan', 'leche'])
    expect(l.marcar('compras', 'cafe').item).toBe('Café molido')
    expect(l.marcar('compras', '3').item).toBe('leche')
    expect(l.ver('compras').items.map((i: { hecho: boolean }) => i.hecho)).toEqual([true, false, true])
    expect(l.marcar('compras', 'leche', false).item).toBe('leche')
    expect(l.marcar('compras', 'zapatillas')).toBeNull()
    expect(l.marcar('nada', 'pan')).toBeNull()
  })
  it('sin decir de qué lista, busca el ítem en todas', () => {
    const l = nueva()
    l.agregar('compras', ['leche', 'pan'])
    l.agregar('taller', ['limpiar', 'calibrar'])
    expect(l.marcar('', 'calibrar').item).toBe('calibrar')
    expect(l.quitar('', 'pan').item).toBe('pan')
    expect(l.ver('taller').items.find((i: { texto: string }) => i.texto === 'calibrar').hecho).toBe(true)
    expect(l.ver('compras').items).toHaveLength(1)
    expect(l.marcar('', 'zapatillas')).toBeNull()
  })
  it('sin nombre: si hay una sola lista es esa; si hay varias, "pendientes"', () => {
    const una = nueva()
    una.agregar('compras', ['leche'])
    expect(una.ver('').nombre).toBe('compras')
    una.agregar('pendientes', ['limpiar'])
    expect(una.ver('').nombre).toBe('pendientes')
    expect(una.reordenar('', 'invertir').nombre).toBe('pendientes')
  })
  it('saca ítems y limpia los tachados', () => {
    const l = nueva()
    l.agregar('compras', ['a1', 'b2', 'c3'])
    l.marcar('compras', 'a1')
    expect(l.limpiarHechos('compras').quitados).toBe(1)
    expect(l.quitar('compras', 'b2').item).toBe('b2')
    expect(l.ver('compras').items.map((i: { texto: string }) => i.texto)).toEqual(['c3'])
    expect(l.quitar('compras', 'zzz')).toBeNull()
  })
  it('reordena: al revés y mover un ítem', () => {
    const l = nueva()
    l.agregar('tareas', ['imprimir lámparas', 'limpiar el taller', 'pedir filamento'])
    expect(l.reordenar('tareas', 'invertir').items.map((i: { texto: string }) => i.texto)).toEqual(['pedir filamento', 'limpiar el taller', 'imprimir lámparas'])
    expect(l.reordenar('tareas', 'primero', 'imprimir').items[0].texto).toBe('imprimir lámparas')
    expect(l.reordenar('tareas', 'ultimo', 'imprimir').items[2].texto).toBe('imprimir lámparas')
    expect(l.reordenar('tareas', 'raro')).toBeNull()
    expect(l.reordenar('inexistente', 'invertir')).toBeNull()
  })
  it('vacía y borra', () => {
    const l = nueva()
    l.agregar('compras', ['a', 'b'])
    expect(l.vaciar('compras').quitados).toBe(2)
    expect(l.ver('compras').items).toEqual([])
    expect(l.borrar('compras')).toBe(true)
    expect(l.borrar('compras')).toBe(false)
    expect(l.ver('compras')).toBeNull()
  })
  it('se guarda en el archivo y se recupera', () => {
    nueva().agregar('compras', ['leche'])
    expect(nueva().ver('compras').items[0].texto).toBe('leche')
  })
  it('respeta los topes de listas y de ítems', () => {
    const l = nueva()
    for (let i = 0; i < 20; i++) l.agregar('lista' + i, ['x'])
    expect(() => l.agregar('una más', ['x'])).toThrow(/demasiadas/)
    const m = crearListas(join(carpeta, 'otras.json'))
    const muchos = Array.from({ length: 100 }, (_, i) => 'item' + i)
    m.agregar('lista0', muchos)
    expect(() => m.agregar('lista0', ['uno más'])).toThrow(/llena/)
  })
})

describe('leerLista (para decirla en voz alta)', () => {
  it('cuenta lo que falta y lo ya tachado', () => {
    const l = nueva()
    l.agregar('compras', ['leche', 'pan', 'huevos'])
    l.marcar('compras', 'pan')
    expect(leerLista(l.ver('compras'))).toBe('En compras faltan 2 cosas: leche y huevos. Ya tachaste pan.')
  })
  it('singular, vacía y todo hecho', () => {
    const l = nueva()
    l.agregar('taller', ['limpiar'])
    expect(leerLista(l.ver('taller'))).toBe('En taller falta una cosa: limpiar.')
    l.marcar('taller', 'limpiar')
    expect(leerLista(l.ver('taller'))).toBe('En taller ya está todo hecho.')
    l.vaciar('taller')
    expect(leerLista(l.ver('taller'))).toBe('La lista de taller está vacía.')
    expect(leerLista(null)).toBeNull()
  })
})
