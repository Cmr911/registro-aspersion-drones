# Registro de aplicaciones de aspersión con drones

Herramienta web gratuita y de código abierto para que operadores y técnicos de drones pulverizadores registren cada aplicación, consulten su historial, exporten sus datos y entreguen al cliente una **constancia de aplicación** imprimible o en PDF.

Hecha por **Datos de Occidente** (Cali, Colombia). Funciona en el celular, no necesita cuenta y no envía datos a ningún servidor.

## Cómo usarla

- Abre la URL publicada (por ejemplo, `https://cmr911.github.io/registro-aspersion-drones/`) o el archivo `index.html` descargado.
- **+ Nuevo**: registra fecha, cliente, área, productos, condiciones y observaciones. Puedes escribir decimales con coma o con punto. Solo se guarda cuando pulsas **Guardar**.
- **Historial**: busca por cliente, predio, cultivo o producto y filtra por rango de fechas. El resumen muestra hectáreas, hectáreas por cliente, producto total aplicado por nombre (sin mezclar L con kg) e ingreso estimado.
- **Ver**: abre la constancia. **Imprimir / PDF** usa la impresión del navegador (elige "Guardar como PDF").
- **Mi perfil**: tu nombre o empresa, identificación tributaria, contacto y certificación. Aparecen en el encabezado de la constancia.

> **Importante:** los datos se guardan por navegador **y por dirección web**. Si abres la herramienta desde otra URL, desde otro navegador o desde otro dispositivo, no verás tus registros. Usa siempre la misma URL y haz respaldos.

## Respaldo y restauración

- **Respaldo → Descargar respaldo (JSON)**: guarda todos tus registros y tu perfil. Envíatelo por correo o súbelo a tu nube.
- **Restaurar**: elige el archivo JSON (máx. 2 MB y 5000 registros) y escoge una opción:
  - **Combinar**: agrega los registros nuevos. Si un registro está en ambos lados, gana la versión editada más recientemente.
  - **Reemplazar todo**: borra lo actual y deja solo lo del archivo. Pide escribir una palabra de confirmación.
- La app te avisa si nunca has hecho un respaldo o si el último tiene más de 30 días.
- Si los datos guardados se dañan, la app **no los sobrescribe**: guarda una copia de rescate (`ddo.registro-aspersion.v1.corrupto.<fecha>`) y te ofrece descargarla.

## Formatos

**CSV** (Exportar CSV, filtro actual): UTF-8 con BOM (se abre bien en Excel), separador `;`, decimales con coma, fechas `AAAA-MM-DD`. Hay **una fila por producto** y los datos del registro se repiten en cada fila. Un registro sin productos ocupa una fila. Las celdas de texto que empiezan con `=`, `+`, `-`, `@`, tabulación o retorno se prefijan con `'` para evitar inyección de fórmulas.

**JSON** (respaldo):

```json
{
  "app": "ddo.registro-aspersion",
  "schemaVersion": 1,
  "exportadoEn": "2026-10-05T15:00:00.000Z",
  "perfil": { "nombre": "…", "idTributaria": "…", "telefono": "…", "correo": "…", "ciudad": "…", "certificacion": "…", "moneda": "COP" },
  "registros": [{
    "id": "…", "fecha": "2026-10-05", "horaInicio": "07:00", "horaFin": "09:30",
    "cliente": "…", "predio": "…", "cultivo": "…", "ubicacion": "…",
    "areaHa": 10, "volumenLHa": 15, "operador": "…", "dron": "…",
    "agronomo": "…", "numeroReceta": "…", "alturaVueloM": 2.5, "boquilla": "…",
    "productos": [{ "nombre": "…", "dosis": 0.5, "unidad": "L/ha", "loteProducto": "…" }],
    "temperaturaC": 28, "humedadPct": 70, "vientoKmh": 6,
    "tarifaPorHa": 90000, "moneda": "COP", "observaciones": "…",
    "creadoEn": "…", "actualizadoEn": "…"
  }]
}
```

Unidades de dosis: `L/ha`, `mL/ha`, `kg/ha`, `g/ha`. Producto total = dosis × área (mL→L y g→kg).

## Privacidad y responsabilidad sobre los datos

- Sin cuentas, sin analítica, sin cookies, sin telemetría y sin peticiones de red: todo se queda en el `localStorage` de tu navegador, bajo la clave `ddo.registro-aspersion.v1`.
- Los nombres de clientes y otros datos que registres pueden ser **datos personales**. La herramienta solo los guarda en tu dispositivo. **Tú eres responsable** de los datos que registras, de su uso, de compartir la constancia y de guardar tus respaldos.
- Esta herramienta no afirma cumplir ninguna norma.

## Aviso legal

Herramienta de apoyo con fines informativos. Verifica siempre dosis y compatibilidad con la etiqueta del producto, un ingeniero agrónomo y la normativa aplicable. Sin garantía de ningún tipo.

La constancia es un documento informativo que genera el operador con sus propios datos. No constituye certificación, informe oficial, acto administrativo ni factura. El "ingreso estimado" es solo una referencia (tarifa × área). Las advertencias de clima usan referencias generales (viento > 11 km/h, temperatura > 35 °C, humedad < 50 %) y no reemplazan la etiqueta del producto.

## Configuración

Edita `js/config.js`:

| Clave | Uso |
|---|---|
| `urlFeedback` | WhatsApp (`https://wa.me/57XXXXXXXXXX`) o correo (`mailto:…`) para "¿Qué otra herramienta te serviría?" y las preguntas en contexto (constancia, tras exportar, ingreso estimado). Cada pregunta prellena un mensaje distinto. Mientras diga `TODO_CONFIGURAR`, quedan ocultos. |
| `urlMarca` | Enlace de "Hecho por Datos de Occidente". Con `TODO_CONFIGURAR` se muestra sin enlace. |
| `urlCalculadora`, `urlSitio`, `urlRepositorio` | Enlaces a la calculadora, al sitio publicado y al código. |
| `monedaPorDefecto`, `diasAvisoRespaldo` | Moneda inicial y días para el aviso de respaldo. |

Solo se aceptan URLs `https://` o `mailto:`.

## Pruebas

Requiere Node.js 18 o superior, sin dependencias:

```
node --test
```

## Publicación en GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio (por ejemplo, `registro-aspersion-drones`).
2. Ve a *Settings → Pages → Deploy from a branch*, elige `main` y la carpeta `/ (root)`.
3. En 1–2 minutos queda en `https://<usuario>.github.io/registro-aspersion-drones/`. Comparte siempre esa misma URL.

## Estructura

```
index.html          Interfaz (CSP restrictiva, sin recursos externos)
css/styles.css      Estilos mobile-first e impresión A4
js/config.js        Marca, contacto y enlaces (editable)
js/model.js         Validación, normalización y totales (lógica pura)
js/storage.js       Persistencia con adaptador inyectable
js/exporter.js      CSV, respaldo JSON e importación segura
js/ui.js            DOM y eventos (sin innerHTML con datos)
tests/              Pruebas con node --test
```

## Contribuir

Propuestas e issues son bienvenidos. Reglas: JavaScript vanilla, cero dependencias en tiempo de ejecución, sin `type="module"` (debe funcionar con `file://`), nada de `innerHTML` con datos del usuario, y `node --test` en verde.

## Otras herramientas de Datos de Occidente

Gratuitas y de código abierto; los enlaces aparecen también dentro de la app (pie de página y en el paso donde son útiles).

- [Calculadora de aspersión](https://cmr911.github.io/calculadora-aspersion-drones/): mezcla, cargas y costos antes de volar.
- [Lector de bitácoras de vuelo](https://cmr911.github.io/lector-bitacoras-drones/): convierte la exportación de vuelos del dron en un reporte imprimible.

## Licencia

MIT © Datos de Occidente. Ver [LICENSE](LICENSE).
