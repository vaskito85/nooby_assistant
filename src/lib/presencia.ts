// Detecta si hay una cara frente a la cámara. El video se procesa acá, en el celu: no se graba ni se sube.
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

export class Presencia {
  private detector: FaceDetector | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private ultimoTiempoVideo = -1

  async iniciar(video: HTMLVideoElement) {
    this.video = video
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    })
    video.srcObject = this.stream
    await video.play()

    const wasm = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    this.detector = await FaceDetector.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate: 'CPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
    })
  }

  /**
   * Posición de la cara en el cuadro, de -1 a 1 (x: derecha de la pantalla = +, y: abajo = +),
   * o null si no hay cara. Devuelve `undefined` si el cuadro no cambió (no hay dato nuevo).
   */
  buscarCara(): { x: number; y: number } | null | undefined {
    const v = this.video
    if (!this.detector || !v || v.readyState < 2) return null
    if (v.currentTime === this.ultimoTiempoVideo) return undefined // cuadro repetido
    this.ultimoTiempoVideo = v.currentTime
    const caras = this.detector.detectForVideo(v, performance.now()).detections
    const box = caras[0]?.boundingBox
    if (!box || !v.videoWidth || !v.videoHeight) return caras.length ? { x: 0, y: 0 } : null
    const cx = (box.originX + box.width / 2) / v.videoWidth
    const cy = (box.originY + box.height / 2) / v.videoHeight
    // La cámara frontal no se espeja: lo que está a la izquierda de la imagen está a la derecha de la pantalla.
    return { x: (0.5 - cx) * 2, y: (cy - 0.5) * 2 }
  }

  detener() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.detector?.close()
    this.stream = null
    this.detector = null
  }
}
