// Listas de verdad ("compras", "pendientes", "taller"…): cada una con sus ítems, que se pueden tachar, sacar y reordenar.
// Viven en ~/.nooby/listas.json. Sin dependencias y sin red: se prueba con una carpeta temporal.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import { plano } from './bitacora.mjs'

export const LISTA_POR_DEFECTO = 'pendientes'
const MAX_LISTAS = 20
const MAX_ITEMS = 100
const MAX_TEXTO = 120

const limpio = (t, max) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** "Lista de compras" y "compras" son la misma lista. */
const clave = (nombre) => plano(limpio(nombre, 40)).replace(/^(la |mi |el )?(lista )?(de |del )?/, '').trim() || LISTA_POR_DEFECTO

export function crearListas(archivo) {
  const cargar = () => {
    try {
      const j = JSON.parse(readFileSync(archivo, 'utf8'))
      return Array.isArray(j.listas) ? j.listas : []
    } catch {
      return []
    }
  }
  let listas = cargar()
  const guardar = () => {
    try {
      if (!existsSync(dirname(archivo))) mkdirSync(dirname(archivo), { recursive: true })
      writeFileSync(archivo, JSON.stringify({ listas }, null, 2))
    } catch {
      /* sin disco: sigue en memoria */
    }
  }
  const buscar = (nombre) => listas.find((l) => l.clave === clave(nombre))
  /** Sin nombre: si hay una sola lista es esa; si no, "pendientes". */
  const elegir = (nombre) => (nombre && String(nombre).trim() ? buscar(nombre) : listas.length === 1 ? listas[0] : buscar(LISTA_POR_DEFECTO))
  const crear = (nombre) => {
    if (listas.length >= MAX_LISTAS) throw new Error('hay demasiadas listas (máximo ' + MAX_LISTAS + ')')
    const nombreLimpio = limpio(nombre, 40).replace(/^(la |mi |el )?(lista )?(de |del )?/i, '').trim() || LISTA_POR_DEFECTO
    const l = { clave: clave(nombre), nombre: nombreLimpio, items: [] }
    listas.push(l)
    return l
  }
  /** Encuentra un ítem por texto (sin tildes, y alcanza con que lo contenga) o por número ("el 2"). */
  const encontrar = (l, ref) => {
    const n = Number(ref)
    if (Number.isInteger(n) && n >= 1 && n <= l.items.length && String(ref).trim() === String(n)) return l.items[n - 1]
    const q = plano(limpio(ref, MAX_TEXTO)).trim()
    if (!q) return null
    return l.items.find((i) => plano(i.texto) === q) ?? l.items.find((i) => plano(i.texto).includes(q)) ?? l.items.find((i) => q.includes(plano(i.texto)))
  }
  /** Con nombre: esa lista. Sin nombre: la primera lista que tenga ese ítem ("tachá leche" sin decir de qué lista). */
  const localizar = (nombre, ref) => (nombre && String(nombre).trim() ? buscar(nombre) : listas.find((l) => encontrar(l, ref)))
  const vista = (l) => ({ nombre: l.nombre, items: l.items.map((i, k) => ({ n: k + 1, id: i.id, texto: i.texto, hecho: i.hecho })) })

  return {
    todas: () => listas.map(vista),

    /** Una lista (o null si no existe). */
    ver(nombre) {
      const l = elegir(nombre)
      return l ? vista(l) : null
    },

    /** Agrega ítems (crea la lista si hace falta). Devuelve la lista y cuántos se sumaron (los repetidos no). */
    agregar(nombre, items) {
      const l = buscar(nombre) ?? crear(nombre)
      let sumados = 0
      const repetidos = []
      for (const t of [].concat(items)) {
        const texto = limpio(t, MAX_TEXTO)
        if (!texto) continue
        if (l.items.some((i) => plano(i.texto) === plano(texto))) {
          repetidos.push(texto)
          continue
        }
        if (l.items.length >= MAX_ITEMS) throw new Error('la lista está llena (máximo ' + MAX_ITEMS + ')')
        l.items.push({ id: randomBytes(4).toString('hex'), texto, hecho: false })
        sumados++
      }
      guardar()
      return { ...vista(l), sumados, repetidos }
    },

    /** Tacha (o destacha) un ítem. */
    marcar(nombre, ref, hecho = true) {
      const l = localizar(nombre, ref)
      const i = l && encontrar(l, ref)
      if (!l || !i) return null
      i.hecho = Boolean(hecho)
      guardar()
      return { ...vista(l), item: i.texto }
    },

    quitar(nombre, ref) {
      const l = localizar(nombre, ref)
      const i = l && encontrar(l, ref)
      if (!l || !i) return null
      l.items = l.items.filter((x) => x !== i)
      guardar()
      return { ...vista(l), item: i.texto }
    },

    /** Reordena: 'invertir' (al revés), 'primero' o 'ultimo' (mueve un ítem). */
    reordenar(nombre, accion, ref) {
      const l = elegir(nombre)
      if (!l) return null
      if (accion === 'invertir') l.items.reverse()
      else if (accion === 'primero' || accion === 'ultimo') {
        const i = encontrar(l, ref)
        if (!i) return null
        l.items = l.items.filter((x) => x !== i)
        if (accion === 'primero') l.items.unshift(i)
        else l.items.push(i)
      } else return null
      guardar()
      return vista(l)
    },

    /** Saca los ítems ya tachados. */
    limpiarHechos(nombre) {
      const l = elegir(nombre)
      if (!l) return null
      const antes = l.items.length
      l.items = l.items.filter((i) => !i.hecho)
      guardar()
      return { ...vista(l), quitados: antes - l.items.length }
    },

    /** Deja la lista vacía (sigue existiendo). */
    vaciar(nombre) {
      const l = elegir(nombre)
      if (!l) return null
      const quitados = l.items.length
      l.items = []
      guardar()
      return { ...vista(l), quitados }
    },

    /** Borra la lista entera. */
    borrar(nombre) {
      const l = buscar(nombre)
      if (!l) return false
      listas = listas.filter((x) => x !== l)
      guardar()
      return true
    },
  }
}

/** Texto para leer una lista en voz alta: "En compras hay 3 cosas: leche, pan y huevos. Ya tachaste pan." */
export function leerLista(v) {
  if (!v) return null
  const pendientes = v.items.filter((i) => !i.hecho).map((i) => i.texto)
  const hechos = v.items.filter((i) => i.hecho).map((i) => i.texto)
  if (v.items.length === 0) return `La lista de ${v.nombre} está vacía.`
  const unir = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1])
  let t = pendientes.length === 0 ? `En ${v.nombre} ya está todo hecho.` : `En ${v.nombre} ${pendientes.length === 1 ? 'falta' : 'faltan'} ${pendientes.length === 1 ? 'una cosa' : pendientes.length + ' cosas'}: ${unir(pendientes)}.`
  if (hechos.length > 0 && pendientes.length > 0) t += ` Ya tachaste ${unir(hechos)}.`
  return t
}
