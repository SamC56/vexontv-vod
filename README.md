# VexonTV

App de TV para Samsung Tizen (probada en Tizen 8, QLED 2024): importa listas
**M3U** y **portales Xtream**, busca dentro de cada lista y guarda favoritos.

- **Trae una fuente de fábrica**, para que la app no arranque vacía: *Canales
  públicos del mundo*, los **12.468 canales públicos y gratuitos de
  [iptv-org](https://github.com/iptv-org/iptv) agrupados por país** (188 países).
  Se siembra una sola vez: se edita o se borra como cualquier otra fuente y, si la
  borras, no vuelve. No se descarga hasta que abres la TV.
- **Importa todos los formatos**: M3U por URL, M3U en fichero (USB), portal
  Xtream (servidor + usuario + contraseña), portal **Stalker/Ministra** (portal +
  MAC), M3U pegado como texto, o **auto-detección** de lo que te haya dado tu
  proveedor (una URL, unas credenciales o su mensaje entero).
- **Filtro por tipo** en Fuentes (Todas / M3U / Xtream / Stalker) con recuento.
- **Categorías por proveedor**: se eligen las que se ven en un panel con
  casillas, búsqueda, "Todas/Ninguna" y Guardar; el resto deja de aparecer.
- Cuatro secciones: **Fuentes**, **TV**, **Recientes** (lo último que has visto) y
  **Favoritos**.
- **Fuentes es para gestionar, no para ver**: cada fila lleva su botón **Editar** a
  la derecha (se entra a editar sin abrir nada) y pulsar la fila abre **la TV de
  esa fuente**. La pantalla que había dentro de una fuente ya no existe.
- **TV** enseña **las categorías que dejas activas** —de todas las fuentes, o de
  una sola si vienes de Fuentes— juntando las que se llaman igual, y al entrar en
  una, sus canales en su propia pantalla. Antes volcaba los 56.000 canales en una
  lista plana, que con un mando no hay quien la recorra.
- **Números de canal**: tecleas el número y Enter salta a ese canal, como en una
  TV. **Editar y borrar listas** desde la propia lista.
- **La carga se explica**: el titular dice qué fuente se está cargando (y cuánto
  lleva) y debajo va el progreso —fase y canales leídos—. Con una sola fuente no
  se repite el nombre; con varias, cada fila lleva la suya. En cuanto una fuente trae canales el aviso se retira y las
  que sigan cargando se quedan como filas dentro de la pantalla, así que nunca
  tapa algo que ya puedes usar.
- **Si un canal no arranca, se dice** — y con la fuente de fábrica pasa: parte de
  esos streams piden su propio User-Agent o están bloqueados por país, así que
  algunos no abrirán. Por eso llevan tarjeta con el motivo y reintentar, en vez de
  pantalla negra.: en vez de una pantalla negra muda (o un
  aviso que se va solo), sale una tarjeta con el canal, el motivo en castellano
  («No hay conexión con el canal», «El canal no responde», «La TV no reproduce ese
  formato»…) y botones de **Reintentar** y **Volver**. Un stream que no arranca ni
  falla se da por muerto a los 12 s, que es el caso que antes se quedaba colgado.
- **EPG "ahora"**: si el panel Xtream lo da, cada fila enfocada muestra qué están
  dando en ese canal (se pide al enfocar y se cachea 10 minutos, porque no se
  pueden pedir 200 programas de golpe) y el reproductor lo enseña con su horario.
  También en Favoritos y Recientes, que son canales en vivo igual que el resto.
- Reproducción con **AVPlay** (el player por hardware de Samsung) y `<video>`
  como respaldo si la TV no lo expone.
- Importa Xtream pidiendo su **API de canales en vivo**, así no se descarga el
  catálogo de películas y series (que en un panel reseller son cientos de MB).
  En M3U se lee **en streaming** (sin guardar el texto entero ni un array de
  líneas) y se filtran las entradas no-live. Sin tope de tamaño a propósito: una
  lista enorme puede tardar o quedarse corta de memoria, así que ahí la TV
  manda.
- Búsqueda **por lista**, persistente entre sesiones (`localStorage`).
- Navegación 100% con el mando y entrada de texto con el teclado del móvil
  (SmartThings) o el IME de la TV.

Sin build step: HTML, CSS y JS a pelo. Un `.wgt` es un zip.

## Estructura

```
index.html          las 16 etiquetas de script y las 7 hojas, en orden de carga
config.xml          manifiesto Tizen (red e inputdevice, y el id de 10 letras)
icon.png brand.png  icono de app y marca del rail (tools/make-icon.py)
css/tokens.css      colores, radios, curvas, la grilla del fondo y el filo: la identidad
css/base.css        reset, marco de la app (rail, main) y tipografía
css/lists.css       filas, listas de canales, categorías y columnas
css/forms.css       buscador, panel de alta y botones
css/player.css      reproductor, overlay y tarjeta de error
css/overlays.css    aviso de carga, aviso breve, número tecleado y confirmación
css/media.css       prefers-reduced-motion / -transparency / -contrast
js/api.js           parseo M3U, Xtream, Stalker y EPG (sin DOM ni UI)
js/store.js         estado, fuentes, navegación, categorías y reproducción
js/tv.js            motor de foco del mando (zonas por offsetTop)
js/player.js        AVPlay con <video> de reserva
js/ui/kit.js        iconos y piezas compartidas (barra, fila, buscador)
js/ui/screens/*.js  una pantalla por fichero
js/ui.js            raíz y montaje: junta el kit con las pantallas
js/app.js           zonas de foco, teclas del mando y arranque
tools/              generador de marca y empaquetador .wgt
test/               check.js (lógica), dom.js (la app en jsdom) y layout.js (maquetación)
```

Nada de esto se lista a mano en los tests: `test/*.js` y el capturador de
pantallas leen los `<script>` y los `<link>` de `index.html`, así que partir un
módulo no obliga a tocar los tests. Hay un check que exige que index.html cargue
**todos** los ficheros: uno suelto es código muerto.

## Desarrollo

```bash
npm install               # una vez: jsdom, solo para los tests
npm test                  # lógica + DOM (jsdom) + maquetación (Chrome headless)
python3 tools/make-icon.py /ruta/al/logo.png   # -> icon.png + brand.png
python3 tools/build-wgt.py   # -> dist/VexonTV.wgt
```

`test/layout.js` monta la app en Chrome headless con una categoría de 200 canales y
mide lo que jsdom no puede ver: que el armazón mida la pantalla, que la lista
scrollee de verdad y que el documento no se mueva. Existe por un fallo que solo
apareció en la TV (sin altura en el punto de montaje, nada scrolleaba).

`test/check.js` carga los módulos reales y valida parseo M3U/Xtream, el alta de
listas, la búsqueda, las categorías, los favoritos, los ids/selectores de la UI y
que nada apunte a un CDN. `test/dom.js` arranca la app entera en jsdom: pinta,
navega con el mando, añade una lista, entra en ella y busca. Ese test es el que
caza los fallos que no se ven mirando el código (un componente que sombrea un
global, un `<input>` sin autocerrar que htm no tolera...).

Ojo con htm: no es HTML5, así que los elementos vacíos (`input`, `br`, `img`) van
siempre autocerrados (`<input ... />`) o el parser se come su contenedor. Hay un
check que lo vigila.

## Instalar en la TV

1. TV en **modo desarrollador** (Apps → teclear `12345`) con la IP del PC.
2. Apps2Samsung → `Custom WGT File` → `dist/VexonTV.wgt`.

## Arranque

`index.html` pinta un **splash en línea** (estilos y marca dentro del propio HTML, sin
esperar a ninguna hoja ni a ninguna imagen, que es lo que lo hace instantáneo) y la app
lo quita con un fundido en cuanto pinta. Si la app no llegara a arrancar, se queda ese
splash, que informa más que un negro.

Lo que **no** está cubierto es el loader del lanzador de la TV, que ocurre **antes** de
que la app exista. Para eso Samsung documenta un *video splash* en `config.xml`:

```xml
<tizen:video_splash_screen ready_when="complete">
    <tizen:video src="splash.mp4" />
</tizen:video_splash_screen>
```

Necesita un MP4 **H.264** (y pequeño), que no se puede generar en este entorno: aquí no
hay encoder H.264. El día que haya clip, se deja en la raíz y se descomenta.

## Probar sin la TV

**Navegador** (UI, navegación, búsqueda, listas, favoritos): flechas = D-pad,
Enter = OK, **Escape = Volver**. No reproduce (Chrome no trae HLS/TS) y un panel
Xtream real fallará por CORS: para eso está `test/sample.m3u`, que se carga desde
el mismo origen y además demuestra que el filtro solo-live descarta las entradas
de `/movie/` y `/series/`.

```bash
python3 -m http.server 8000     # Windows: http://localhost:8000
```

Para un panel real desde el navegador hace falta saltarse CORS (perfil
desechable, solo desarrollo):

```
chrome.exe --disable-web-security --user-data-dir=%TEMP%\chromedev
```

**Simulador Tizen** (Tizen Studio → TV Web Simulator): Chromium con mando en
pantalla. Vale para UI, **no tiene AVPlay**.

**Emulador de TV**: es un Tizen completo, así que reproduce con AVPlay y tiene
las teclas de verdad. Necesita virtualización (VT-x/AMD-V) activada:

```bash
tizen install -n dist/VexonTV.wgt -t <emulador>
tizen run -p ts9k4m2w8p.VexonTV -t <emulador>
```

La TV real queda para la validación final.

### Ciclo rápido (editar sin reempaquetar)

En Chrome: DevTools → **Sources → Overrides → Enable local overrides** y apunta
a esta carpeta. Editas `js/app.js` o `css/style.css` en el propio DevTools, F5, y
ves el cambio sin tocar disco ni empaquetar nada.

Con Tizen CLI, el ciclo contra emulador o TV firmado es de 3 comandos (una vez
creado el perfil con `tizen security-profiles add`):

```bash
tizen build-web -- .
tizen package -t wgt -s <perfil> -- .buildResult
tizen install -n VexonTV.wgt -t <device> -- .buildResult
```

### Estructura

```
index.html      shell: #app + scripts (vendor y js)
js/api.js       listas: M3U en streaming (filtra no-live, tope 40 MB) y API Xtream
js/store.js     estado y acciones, sin DOM ni framework: todo lo testeable
js/ui.js        componentes Preact + htm
js/tv.js        foco D-pad (zonas como filas de elementos) + IME de la TV
js/player.js    AVPlay con <video> de respaldo
js/app.js       zonas, teclas del mando y arranque
vendor/         preact + hooks + htm, 20 KB, sin modificar
```

### Preact + htm, sin build step

UI de componentes con `htm` (plantillas por tagged templates: nada de JSX ni
transpilador) y las librerías **vendorizadas**: 20 KB dentro del paquete y cero
peticiones de red en runtime. Un `<script src>` a un CDN es justo el fallo de
hls.js que dejaba la TV en negro, así que no entra.

La separación es deliberada: `store.js` no toca el DOM y se prueba en node;
`ui.js` solo pinta lo que hay en el store. El foco sigue siendo imperativo
(`tv.js`) porque en una TV el foco y el scroll no se dejan gobernar por
re-renders: Preact pinta y, justo después, el store indica a qué zona ir.

## Mando

| Tecla | Acción |
|-------|--------|
| Flechas | Navegar (izquierda sale al rail) |
| OK | Seleccionar / abrir el teclado en un campo |
| ↓ desde un campo | Salir del teclado |
| 0-9 y OK | Saltar al canal de ese número en la lista que ves |
| Volver | Atrás; con número tecleado, lo borra; en Inicio, cierra la app |
| Rojo | Guardar o quitar de favoritos; en Inicio, borrar la lista enfocada |
| Canal +/- , ◀ ▶ (reproduciendo) | Cambiar de canal |
| Play/Pausa | Pausa |

Fuera de alcance a propósito: VOD/películas y series (esto es un reproductor de
**TV en vivo**), descargas, y portales Stalker/Ministra.
