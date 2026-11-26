// Copia el WASM de MediaPipe a public/ para servirlo desde el mismo origen (sin CDN).
import { cpSync, existsSync, mkdirSync } from 'node:fs'

const origen = 'node_modules/@mediapipe/tasks-vision/wasm'
const destino = 'public/mediapipe/wasm'

if (existsSync(origen)) {
  mkdirSync(destino, { recursive: true })
  cpSync(origen, destino, { recursive: true })
  console.log('WASM de MediaPipe copiado a', destino)
} else {
  console.log('Aún no está @mediapipe/tasks-vision; se omite la copia.')
}
