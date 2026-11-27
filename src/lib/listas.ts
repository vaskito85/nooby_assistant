// Entender pedidos de listas dichos en voz: "agregá leche y pan a la lista de compras", "tachá leche", "qué hay en la lista"…
// Todo puro (sin DOM ni red) para probarlo. La lista en sí vive en el servidor (listas.mjs).

export type AccionLista = 'agregar' | 'ver' | 'marcar' | 'quitar' | 'vaciar'

export interface PedidoLista {
  accion: AccionLista
  /** Nombre de la lista ("compras"); '' = la de siempre ("pendientes"). */
  lista: string
  /** Ítems nombrados (para agregar, marcar y quitar). */
  items: string[]
}

/** Minúsculas y sin tildes, letra por letra (así los largos coinciden con el texto original y se puede cortar el original). */
const fold = (t: string) =>
  t
    .toLowerCase()
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')

const ARTICULO = '(?:la |mi |el |esta |esa )?'
// "a la lista", "en mi lista de compras", "de la lista del taller"
// El nombre de la lista es una sola palabra ("compras", "taller"): así "a la lista de compras leche y pan" no se lleva "leche" como parte del nombre.
const MENCION = new RegExp(`\\b(?:a|en|de|del|para)\\s+${ARTICULO}lista(?:\\s+(?:de|del)\\s+([a-zñ]+))?`)
const MENCION_SUELTA = new RegExp(`\\b${ARTICULO}lista(?:\\s+(?:de|del)\\s+([a-zñ]+))?`)

const VERBOS_AGREGAR = /^(?:(?:che|nooby|por favor|dale|y)\s+)*(?:agrega|agregame|agregar|agregale|suma|sumame|sumar|anota|anotame|anotar|pone|poneme|poner|añade|anade|incluye|incluime|metele|mete)\b/
const VERBOS_MARCAR = /^(?:(?:che|nooby|por favor|dale|y)\s+)*(?:tacha|tachame|tachar|marca|marcame|marcar|completa|completame)\b/
const YA_HICE = /^(?:(?:che|nooby|por favor|y)\s+)*ya\s+(?:hice|compre|termine|puse|saque|limpie|llame|lleve|busque|pague|arme|mande)\b/
const VERBOS_QUITAR = /^(?:(?:che|nooby|por favor|dale|y)\s+)*(?:saca|sacame|sacar|sacale|quita|quitame|quitar|quitale|borra|borrame|borrar|elimina|eliminar)\b/
const VERBOS_VACIAR = /^(?:(?:che|nooby|por favor|dale|y)\s+)*(?:vacia|vaciame|vaciar|limpia|limpiame|limpiar|borra|borrame|borrar|elimina|eliminar|resetea)\s+(?:toda |todo )?(?:la |mi |el )?lista\b/
const VERBOS_VER = /\b(?:lee|leeme|leer|decime|dime|mostrame|muestrame|repasame|repasa|cuales|que)\b[^.?!]*\blista\b|\b(?:como (?:va|quedo|esta)|que (?:hay|tengo|falta|faltan|queda|quedan))\b[^.?!]*\blista\b/

/** Corta lo que sobra de un ítem: "por favor", "como hecho", artículos de relleno, espacios. */
function limpiarItem(t: string): string {
  return t
    .replace(/\s+/g, ' ')
    .replace(/\b(?:por favor|gracias)\b/gi, '')
    .replace(/\s+como\s+(?:hecho|hecha|listo|lista|completo|completa|terminado|terminada|comprado|comprada)\b/gi, '')
    .replace(/^(?:que\s+)/i, '')
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '')
    .trim()
}

/** "leche, pan y huevos" → ["leche", "pan", "huevos"]. */
function partir(t: string): string[] {
  return t
    .split(/\s*(?:,|;|\sy\s|\se\s)\s*/i)
    .map(limpiarItem)
    .filter((x) => x.length > 0)
}

function nombreDe(m: RegExpExecArray | null): string {
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Devuelve qué pidió sobre una lista, o null si no es un pedido de listas. Hace falta nombrar la lista (o usar un verbo propio de listas
 * como "tachá"): "agregá leche" a secas es otra cosa.
 */
export function entenderLista(texto: string): PedidoLista | null {
  const original = texto.replace(/\s+/g, ' ').trim()
  const f = fold(original)
  if (!f) return null
  const hayLista = /\blista\b/.test(f)

  // vaciar: el verbo va derecho con la lista ("vaciá la lista de compras")
  const vac = VERBOS_VACIAR.exec(f)
  if (vac) {
    const m = MENCION_SUELTA.exec(f)
    return { accion: 'vaciar', lista: nombreDe(m), items: [] }
  }

  // quitar: "sacá leche de la lista (de compras)"
  const q = VERBOS_QUITAR.exec(f)
  if (q && hayLista) {
    const m = MENCION.exec(f)
    if (m) {
      const items = partir(original.slice(q[0].length, m.index))
      if (items.length > 0) return { accion: 'quitar', lista: nombreDe(m), items }
    }
  }

  // agregar: "agregá leche y pan a la lista de compras" / "agregá a la lista de compras leche"
  const a = VERBOS_AGREGAR.exec(f)
  if (a && hayLista) {
    const m = MENCION.exec(f)
    if (m) {
      let items = partir(original.slice(a[0].length, m.index))
      if (items.length === 0) items = partir(original.slice(m.index + m[0].length))
      if (items.length > 0) return { accion: 'agregar', lista: nombreDe(m), items }
    }
  }

  // marcar: "tachá leche", "marcá limpiar el taller como hecho", "ya compré la leche" (esto último solo si nombra la lista)
  const mk = VERBOS_MARCAR.exec(f) ?? (hayLista ? YA_HICE.exec(f) : null)
  if (mk) {
    const m = MENCION.exec(f)
    const fin = m ? m.index : original.length
    const items = partir(original.slice(mk[0].length, fin))
    if (items.length > 0) return { accion: 'marcar', lista: nombreDe(m), items }
  }

  // ver: "qué hay en la lista de compras", "leeme la lista"
  if (hayLista && VERBOS_VER.test(f)) {
    const m = MENCION.exec(f) ?? MENCION_SUELTA.exec(f)
    return { accion: 'ver', lista: nombreDe(m), items: [] }
  }
  return null
}

/** Cómo se llama la lista para decirla en voz alta. */
export const nombreHablado = (lista: string) => lista || 'pendientes'
