# Control de Ventas de Plataformas (Offline / PWA)

Sistema local, sin internet, para registrar clientes, servicios (CANVA, CAPCUT, NETFLIX, etc.), planes (mensual/anual), fechas de inicio/fin, precios en ARS, y **renovaciones**. Incluye **calendario** con colores por estado, **historial de movimientos**, **exportación a CSV, Excel (.xls)** y **PDF** (vista de impresión), **respaldo** en JSON, y **cifrado** de contraseñas con clave maestra (opcional) usando WebCrypto.

## Carpeta
- `index.html` — App principal
- `app.js` — Lógica (IndexedDB, UI, exportadores, calendario)
- `service-worker.js` — Offline
- `manifest.webmanifest` — PWA
- `icons/` — Íconos
- `assets/` — Recursos opcionales
- `vendor/` — (vacío; no se requieren librerías externas)

## Uso local (rápido)
1. Abre `index.html` con doble click. (Para instalar como App PWA y cachear offline, es mejor servirla desde http).
2. Registra servicios y clientes.
3. Opcional: define una **clave maestra** en *Ajustes* para cifrar contraseñas entregadas.
4. Exporta CSV/XLS o PDF cuando necesites reportes.

> Nota: el Service Worker requiere servir la app (no funciona al abrir el archivo directamente).

## Publicar en GitHub Pages
1. Crea un repo nuevo en GitHub: por ejemplo `ventas-plataformas`.
2. Sube todos estos archivos (o arrastra el ZIP descomprimido).
3. En **Settings → Pages**, en **Source** elige **Deploy from a branch**, **Branch: main / root**.
4. Espera a que GitHub Pages quede activo. Abre la URL (https://tuusuario.github.io/ventas-plataformas/).
5. En el navegador, usa la opción **Instalar App** para PWA y que funcione 100% offline (tras la primera carga).

## Exportar a Excel
Se genera un archivo **.xls** usando SpreadsheetML (formato compatible con Excel). También puedes usar **CSV** para abrir en Excel.

## Seguridad
- Las contraseñas se cifran si estableces una **clave maestra** en *Ajustes*. Si no, se almacenan en base64 (no seguro).
- El respaldo **no incluye** la clave maestra. Si restauras en otro equipo, introduce la misma clave para leer las contraseñas.
