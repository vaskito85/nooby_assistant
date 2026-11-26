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
