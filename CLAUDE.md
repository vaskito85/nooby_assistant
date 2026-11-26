# nooby_asistente — asistente personal con cara para un celu viejo

Web app de una pantalla (Vite + React + TS, sin backend) que se abre a pantalla completa en un celu viejo.
**Proyecto independiente**: no depende de `suite_impresion_3D`; los avisos le llegan por ntfy.

## Qué hace
- Cara animada (ojos que parpadean, humores: normal, feliz, dormido, alerta, hablando).
- Cámara frontal + MediaPipe FaceDetector (CPU, en el celu): detecta si estás sentado. Avisa a los N min seguidos
  (`lib/sentado.ts`, lógica pura con tests) y recuerda tomar agua.
- Avisos externos por **ntfy** (SSE): cualquier mensaje al tema suena como alarma y aparece en la cara
  ("Che, la impresión terminó"). Quien avisa (el agente del taller, un script…) solo hace un POST a ntfy.
- Botón de clima (Open-Meteo, sin clave). Voz con `speechSynthesis` (es-AR).

## Comandos
```
npm run dev      # http://localhost:5173 (la cámara exige https o localhost)
npm test         # vitest (lib/sentado)
npm run build    # tsc --noEmit && vite build
```

## Estructura
```
src/App.tsx        orquesta: inicio por toque, bucle de presencia, ntfy, botones, ajustes
src/Cara.tsx       la cara (CSS en estilos.css, data-humor)
src/lib/           sentado.ts (contador), presencia.ts (MediaPipe), ntfy.ts, clima.ts, audio.ts, config.ts (localStorage)
public/models/     blaze_face_short_range.tflite (modelo de MediaPipe, versionado)
public/mediapipe/  WASM copiado de node_modules por scripts/copiar-wasm.mjs (postinstall; no se versiona)
```

## Reglas
- NUNCA scroll horizontal (probar en 375 px). Ajustes plegables.
- El video no se graba ni se sube: solo se analiza cuadro a cuadro en el celu.
- El tema de ntfy es un secreto: no commitearlo; se guarda en localStorage (o `?tema=` en la URL la primera vez).
- Audio, cámara y wake lock exigen un toque del usuario: por eso la pantalla de inicio.
- Autor de commits: `vaskito85 <vasko85@gmail.com>` (config local).

## Estado
Ver `TASKS.md` y `bitacora.md`.
