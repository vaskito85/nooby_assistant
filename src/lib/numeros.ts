// Números en español hablado → cifras. Lógica pura (sin DOM).
// El reconocedor escribe "diez minutos", "veinticinco", "treinta y cinco", "ciento veinte", "dos mil veintiséis".
// Todo se compara con las palabras ya normalizadas (minúsculas, sin tildes).

const UNI: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
}
const DEC: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 }
const CEN: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
}

export interface NumeroLeido {
  valor: number
  /** Índice del primer token después del número. */
  hasta: number
}

function menorDeMil(n: string[], i: number): NumeroLeido | null {
  let v = 0
  let j = i
  let algo = false
  if (CEN[n[j]] !== undefined) {
    v += CEN[n[j]]
    j++
    algo = true
  }
  if (DEC[n[j]] !== undefined) {
    v += DEC[n[j]]
    j++
    algo = true
    const u = UNI[n[j + 1]]
    if (n[j] === 'y' && u !== undefined && u >= 1 && u <= 9) {
      v += u
      j += 2
    }
  } else if (UNI[n[j]] !== undefined) {
    v += UNI[n[j]]
    j++
    algo = true
  }
  return algo ? { valor: v, hasta: j } : null
}

/** Lee un número que empieza en n[i]: "20" o "veinticinco" o "dos mil veintiséis". null si ahí no hay un número. */
export function leerNumero(n: string[], i: number): NumeroLeido | null {
  if (i >= n.length) return null
  if (/^\d+$/.test(n[i])) return { valor: Number(n[i]), hasta: i + 1 }
  let valor = 0
  let j = i
  let algo = false
  const sub = menorDeMil(n, j)
  if (n[j] === 'mil') {
    valor = 1000
    j++
    algo = true
  } else if (sub && n[sub.hasta] === 'mil') {
    valor = sub.valor * 1000
    j = sub.hasta + 1
    algo = true
  }
  const resto = menorDeMil(n, j)
  if (resto) {
    valor += resto.valor
    j = resto.hasta
    algo = true
  }
  return algo ? { valor, hasta: j } : null
}

const UNIDADES_DE_TIEMPO = /^(segundo|segundos|seg|minuto|minutos|min|hora|horas|hs|hr|dia|dias|semana|semanas|mes|meses|ano|anos|cuarto)$/

/** Reemplaza los números hablados por cifras. "un"/"una" solo cuentan como 1 si siguen con una unidad de tiempo ("una hora"). */
export function digitalizar(n: string[]): string[] {
  const out: string[] = []
  let i = 0
  while (i < n.length) {
    const num = leerNumero(n, i)
    if (num) {
      const esUn = num.hasta === i + 1 && (n[i] === 'un' || n[i] === 'una' || n[i] === 'uno')
      if (!esUn || UNIDADES_DE_TIEMPO.test(n[num.hasta] ?? '')) {
        out.push(String(num.valor))
        i = num.hasta
        continue
      }
    }
    out.push(n[i])
    i++
  }
  return out
}
