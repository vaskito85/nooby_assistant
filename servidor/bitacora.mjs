// Bitácora (lo que hablás con Nooby) y memoria (datos que le pedís que recuerde). Todo vive en la PC, en archivos de texto:
//   ~/.nooby/bitacora/AAAA-MM-DD.md   un archivo por día, en markdown (se puede abrir, copiar o llevar a otro lado)
//   ~/.nooby/memoria.json             lista de datos ("mi hermano se llama Pablo")
// Sin dependencias y sin tocar la red: se puede probar con una carpeta temporal.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

const DIA_OK = /^\d{4}-\d{2}-\d{2}$/
const pad = (n) => String(n).padStart(2, '0')

/** "2026-11-27": solo esta forma llega a tocar el disco (así no se puede escapar de la carpeta con "../"). */
export const esDia = (s) => typeof s === 'string' && DIA_OK.test(s) && !Number.isNaN(Date.parse(s))
export const claveDia = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const horaCorta = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
/** Minúsculas y sin tildes, para buscar sin que importen. */
export const plano = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const titulo = (dia) => {
  const [a, m, d] = dia.split('-').map(Number)
  const f = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full' }).format(new Date(a, m - 1, d))
  return `# Bitácora — ${f}\n\n`
}

/** Una línea del archivo → { hora, rol, texto } (o null si no es una entrada). */
export function leerLinea(linea) {
  const m = /^- \*\*(\d\d:\d\d)\*\* (?:\*\*(.+?):\*\* |📝 )(.*)$/.exec(linea)
  if (!m) return null
  const quien = m[2]
  const rol = quien === undefined ? 'nota' : quien === 'Nooby' ? 'nooby' : 'yo'
  return { hora: m[1], rol, quien: quien ?? '', texto: m[3] }
}

export function crearBitacora(carpeta, { ahora = () => new Date() } = {}) {
  const archivo = (dia) => join(carpeta, `${dia}.md`)
  const limpio = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000)

  return {
    /** Agrega una entrada al día de hoy. rol: 'yo' | 'nooby' | 'nota'. Devuelve false si no hay nada que guardar. */
    anotar(rol, texto, nombre = 'Yo') {
      const t = limpio(texto)
      if (!t || !['yo', 'nooby', 'nota'].includes(rol)) return false
      const d = ahora()
      const dia = claveDia(d)
      mkdirSync(carpeta, { recursive: true })
      if (!existsSync(archivo(dia))) writeFileSync(archivo(dia), titulo(dia))
      const quien = rol === 'nota' ? '📝' : `**${rol === 'nooby' ? 'Nooby' : limpio(nombre).replace(/\*/g, '') || 'Yo'}:**`
      appendFileSync(archivo(dia), `- **${horaCorta(d)}** ${quien} ${t}\n`)
      return true
    },

    entradas(dia) {
      if (!esDia(dia) || !existsSync(archivo(dia))) return []
      return readFileSync(archivo(dia), 'utf8').split(/\r?\n/).map(leerLinea).filter(Boolean)
    },

    /** El archivo markdown tal cual (para descargarlo). null si ese día no existe. */
    markdown(dia) {
      return esDia(dia) && existsSync(archivo(dia)) ? readFileSync(archivo(dia), 'utf8') : null
    },

    /** Los días que tienen bitácora, del más nuevo al más viejo, con cuántas entradas hay. */
    dias() {
      if (!existsSync(carpeta)) return []
      return readdirSync(carpeta)
        .map((n) => /^(\d{4}-\d{2}-\d{2})\.md$/.exec(n)?.[1])
        .filter((d) => d && esDia(d))
        .sort()
        .reverse()
        .map((dia) => ({ dia, entradas: this.entradas(dia).length }))
    },

    borrarDia(dia) {
      if (!esDia(dia) || !existsSync(archivo(dia))) return false
      unlinkSync(archivo(dia))
      return true
    },

    /** Borra la última entrada de hoy que sea de ese rol (para "borrá lo último"). */
    quitarUltimas(cantidad = 2) {
      const dia = claveDia(ahora())
      if (!existsSync(archivo(dia))) return 0
      const lineas = readFileSync(archivo(dia), 'utf8').split(/\r?\n/)
      let quitadas = 0
      for (let i = lineas.length - 1; i >= 0 && quitadas < cantidad; i--) {
        if (leerLinea(lineas[i])) {
          lineas.splice(i, 1)
          quitadas++
        }
      }
      writeFileSync(archivo(dia), lineas.join('\n'))
      return quitadas
    },

    /** Busca texto (sin importar tildes ni mayúsculas) en todos los días. Más nuevo primero. */
    buscar(consulta, max = 30) {
      const q = plano(consulta).trim()
      if (!q) return []
      const out = []
      for (const { dia } of this.dias()) {
        for (const e of this.entradas(dia)) {
          if (plano(e.texto).includes(q)) out.push({ dia, ...e })
          if (out.length >= max) return out
        }
      }
      return out
    },

    /** Texto compacto de un rango de días (para que la IA lo lea): "[2026-11-27 18:05] Ger: ...". Se queda con lo más reciente si es largo. */
    rango(desde, hasta, maxCaracteres = 7000, maxDias = 14) {
      if (!esDia(desde)) return ''
      const fin = esDia(hasta) ? hasta : desde
      const partes = []
      let n = 0
      for (const { dia } of [...this.dias()].reverse()) {
        if (dia < desde || dia > fin) continue
        if (++n > maxDias) break
        for (const e of this.entradas(dia)) {
          partes.push(`[${dia} ${e.hora}] ${e.rol === 'nota' ? 'Nota' : e.rol === 'nooby' ? 'Nooby' : e.quien || 'Yo'}: ${e.texto}`)
        }
      }
      let t = partes.join('\n')
      if (t.length > maxCaracteres) t = '…' + t.slice(t.length - maxCaracteres)
      return t
    },
  }
}

const MEMORIA_MAX = 60

/** Datos que Nooby tiene que recordar siempre ("mi hermano se llama Pablo"). */
export function crearMemoria(archivo, { ahora = () => Date.now() } = {}) {
  const cargar = () => {
    try {
      const j = JSON.parse(readFileSync(archivo, 'utf8'))
      return Array.isArray(j) ? j.filter((x) => x && typeof x.texto === 'string' && typeof x.id === 'string') : []
    } catch {
      return []
    }
  }
  const guardar = (lista) => {
    mkdirSync(join(archivo, '..'), { recursive: true })
    writeFileSync(archivo, JSON.stringify(lista, null, 2))
  }
  return {
    listar: cargar,
    agregar(texto) {
      const t = String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
      if (!t) return null
      const lista = cargar()
      const igual = lista.find((x) => plano(x.texto) === plano(t))
      if (igual) return igual
      if (lista.length >= MEMORIA_MAX) lista.shift() // se olvida lo más viejo
      const item = { id: randomBytes(4).toString('hex'), texto: t, creado: ahora() }
      lista.push(item)
      guardar(lista)
      return item
    },
    /** Olvida los datos que contengan ese texto. Devuelve cuántos. */
    olvidar(texto) {
      const q = plano(texto).trim()
      if (!q) return 0
      const lista = cargar()
      const quedan = lista.filter((x) => !plano(x.texto).includes(q))
      if (quedan.length !== lista.length) guardar(quedan)
      return lista.length - quedan.length
    },
    borrarId(id) {
      const lista = cargar()
      const quedan = lista.filter((x) => x.id !== id)
      if (quedan.length !== lista.length) guardar(quedan)
      return lista.length - quedan.length
    },
  }
}
