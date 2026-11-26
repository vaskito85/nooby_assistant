# Nooby

Asistente personal con cara para un celu viejo. Detecta con la cámara si estás sentado, te avisa que te levantes,
que tomes agua, te dice el clima y suena cuando le llega un aviso (por ejemplo, "la impresión terminó").

```
npm install
npm run dev
```

Abrí la página en el celu (la cámara necesita HTTPS o localhost), tocá la cara y dejá el celu parado.
En **Ajustes** cargás el tema de ntfy. Para que lleguen avisos: `POST https://ntfy.sh/<tu-tema>` con el texto en el cuerpo.
Detalles en `CLAUDE.md`.

## Uso por USB (Note 8)
1. En el celu: Opciones de desarrollador → **Depuración USB**. Instalá el APK (ver `scripts/instalar-apk.ps1`).
2. En la PC: `npm install` y `npm run pc`. Abrí el panel en http://127.0.0.1:8777/#/panel.
3. Enchufá el celu por USB: el servidor comparte el puerto y abre Nooby solo.
4. Avisos desde cualquier programa de la PC: `POST http://127.0.0.1:8777/api/aviso` con `{"texto":"Che, la impresión terminó"}` (Content-Type: application/json).

## Licencia
Copyright (C) 2026 vaskito85

Este programa es software libre: podés redistribuirlo y/o modificarlo bajo los términos de la
[GNU Affero General Public License v3](LICENSE) o posterior. Se distribuye sin garantía.
Software de terceros incluido: ver [NOTICE.md](NOTICE.md).
