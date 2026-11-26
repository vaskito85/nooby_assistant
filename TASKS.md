# TASKS

## Hecho (v0.1)
- [x] T001 Esqueleto Vite + React + TS, build y tests andando
- [x] T002 Cara con humores
- [x] T003 Detección de presencia con cámara (MediaPipe) + contador de sentado (con tests)
- [x] T004 Avisos por ntfy con alarma, voz y mensaje
- [x] T005 Botón de clima, recordatorio de agua, ajustes plegables

## Hecho (v0.2)
- [x] Servidor local en la PC + canal USB (adb reverse) + panel en modo local
- [x] Proyecto APK (cáscara WebView) y workflow de build en GitHub Actions

## Hecho (v0.2.3)
- [x] Rediseño: layout en dos mitades fijas, cara sin gestos que desacomoden, globito pensador (PC ✓/✗), ojos en tiempo real

## Hecho (v0.3.0)
- [x] Oído offline (Vosk) + "che nooby" + comandos básicos + nombre configurable en el panel

## Hecho (v0.3.1)
- [x] Comentarios al irte ("¿Ya te vas?") y al volver ("Hola de nuevo")

## Hecho (v0.3.2)
- [x] Palabra clave con gramática cerrada (llamado/libre) y freno automático de la cámara

## Pendiente
- [ ] T016 Probar el oído en el celu: ajustar cómo entiende "che nooby" (ver window.__noobyDebug.oido)
- [ ] T017 Etapa 2: preguntas libres con una IA (evaluar plan gratis; clave en el servidor de la PC)
- [ ] T015 Verificar en el celu que el detector ve la cara (window.__noobyDebug) y ajustar ganancia de los ojos
- [ ] T012 Probar el APK en el Note 8 (instalar, cámara, reverse, arranque automático)
- [x] T013 Instalador de una línea + inicio con Windows + Release automática (falta ícono de bandeja)
- [ ] T014 Enganchar el agente del taller: POST a /api/aviso (o ntfy + puente)
- [ ] T006 Probar en el celu real (cámara, rendimiento, audio, pantalla encendida) y ajustar
- [ ] T007 Desplegar en Vercel (HTTPS, necesario para la cámara en el celu) y agregar a pantalla de inicio
- [ ] T008 Elegir ntfy público con tema secreto o ntfy propio en la Raspberry
- [ ] T009 Enganchar el agente del taller: un POST a ntfy junto al aviso de Telegram (cambio chico en `agente/src/avisos.ts` de suite_impresion_3D)
- [ ] T010 Conversación por voz (reconocimiento de voz + IA)
- [ ] T011 Más botones (a definir)
