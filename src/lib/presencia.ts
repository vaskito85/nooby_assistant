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

  /** true si ve al menos una cara en el cuadro actual. */
  hayCara(): boolean {
    const v = this.video
    if (!this.detector || !v || v.readyState < 2) return false
    if (v.currentTime === this.ultimoTiempoVideo) return false // cuadro repetido
    this.ultimoTiempoVideo = v.currentTime
    return this.detector.detectForVideo(v, performance.now()).detections.length > 0
  }

  detener() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.detector?.close()
    this.stream = null
    this.detector = null
  }
}
