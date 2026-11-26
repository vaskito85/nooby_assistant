# Avisos de terceros

Nooby usa software de terceros, cada uno bajo su propia licencia:

- **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision`) y el modelo de detección de caras
  `blaze_face_short_range.tflite` (`public/models/`): © Google LLC, licencia Apache-2.0.
  https://github.com/google-ai-edge/mediapipe
- **Vosk** (`vosk-android`) y el modelo `vosk-model-small-es-0.42`: © Alpha Cephei Inc., licencia Apache-2.0. Reconocimiento de voz sin internet.
  https://alphacephei.com/vosk  (el modelo se baja al compilar el APK; no está en el repo)
- **JNA** (`net.java.dev.jna`): LGPL-2.1 / Apache-2.0.
- **React**, **Vite**, **Vitest** y **TypeScript**: licencias MIT / Apache-2.0 (ver cada paquete en `node_modules`).
- **Open-Meteo** (clima y buscador de ciudades): datos bajo CC BY 4.0, uso no comercial gratuito. https://open-meteo.com
- **ntfy** (opcional, para avisos por internet): https://ntfy.sh

Todas esas licencias son compatibles con la AGPL v3 de este proyecto.
