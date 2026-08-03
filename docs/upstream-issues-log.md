# Defectos de upstream: registro interno

> ## A `BBVA/open-cells`: issues sí, código no
>
> Cambiado el 2026-08-03. Antes ponía que no se les enviaba nada en ningún formato, apoyado en
> que no aceptaban nada de fuera. **Era falso, y lo desmiente nuestro propio historial:**
>
> | Issue                                                     | Abierta    | Desenlace                                             |
> | --------------------------------------------------------- | ---------- | ----------------------------------------------------- |
> | [#50](https://github.com/BBVA/open-cells/issues/50) tipos | 2026-06-29 | Cerrada COMPLETED el 30-jul: «@open-cells/core 1.2.0» |
> | [#51](https://github.com/BBVA/open-cells/issues/51) types | 2026-07-17 | Cerrada COMPLETED el 30-jul: «core-plugin 1.2.3»      |
>
> Las dos salieron de aquí, `julcasans` las arregló y las publicó, y esas son exactamente las
> versiones que trajo la sincronización del 2 de agosto. Un mes y dos semanas.
>
> Lo que **no** se les manda es código: ni pull request, ni parche, ni diff para pegar. Y un
> reporte no es una propuesta — lo que funcionó fueron defectos pequeños, reproducibles y con
> evidencia, no pedirles que adopten nuestra arquitectura.

Qué está roto en `BBVA/open-cells`, cómo nos afecta y qué hemos hecho al respecto en nuestro
fork. El detalle técnico de cada uno está en [`upstream-issues.md`](./upstream-issues.md); este
documento es el índice y el seguimiento.

Para qué sirve: para saber qué heredamos, para no volver a diagnosticar lo mismo dos veces, para
saber **qué ficheros van a dar conflicto** cuando sincronicemos — y ahora también como cola de lo
que se les puede reportar.

## Cómo se redactan

Uno cada vez, en unidades pequeñas y abarcables, y **referenciando nuestro proyecto**: cada
ficha enlaza nuestro arreglo y su test con permalinks a un SHA fijo, que es lo que convierte la
ficha en algo accionable para nosotros. Cada defecto redactado así vive en su propio fichero
bajo [`upstream/`](./upstream/); `upstream-issues.md` conserva el texto largo de los que aún no
se han pasado a ese formato.

| Redactada en formato final                       | Fichero                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1 · `Channel.unsubscribe()` deja el canal muerto | [`upstream/01-channel-unsubscribe.md`](./upstream/01-channel-unsubscribe.md) |

Las que siguen en `upstream-issues.md` y hay que trocear al pasarlas, porque hoy agrupan varios
defectos en un solo issue: la 5 (cuatro defectos de tipos), la 7 (dos), la 8 (dos) y la 9
(config de ESLint + código muerto).

## El criterio: qué entra aquí y qué no

Entra **solo lo que es de upstream**: defectos que existen en `BBVA/open-cells` tal cual y que
heredamos al hacer el fork. Nada que sea decisión nuestra.

Cada ficha es autocontenida: se entiende sin abrir otros documentos, y enlaza nuestro arreglo y
su test para que nadie tenga que buscarlos.

Cada cita está verificada contra el código de upstream en el commit previo a la auditoría
(`398baed`), no reconstruida de memoria.

## Las 14

| #   | Asunto                                 | Sev.    | Detectado en | En nuestro fork  |
| --- | -------------------------------------- | ------- | ------------ | ---------------- |
| 1   | Canales muertos tras `logout()`        | Crítica | §2 · PR #9   | Arreglado        |
| 2   | `_hasPublisher()` y RxJS 7             | Alta    | §2 · PR #9   | Arreglado        |
| 3   | `Router.stop()` no para el router      | Alta    | §2 · PR #9   | Arreglado        |
| 4   | `addCellsCoreToPrototype()` lanza      | Alta    | §3 · PR #10  | Arreglado        |
| 5   | Tipos publicados no compilan           | Alta    | §10 · PR #15 | Arreglado · ⬆️   |
| 6   | `types/` desalineados con `src/`       | Media   | §10 · PR #15 | Arreglado · ⬆️   |
| 7   | `npm publish` fallido reporta éxito    | Alta    | §7 · PR #14  | Arreglado        |
| 8   | La suite no arranca en un clon limpio  | Alta    | §1 · PR #8   | Arreglado        |
| 9   | ESLint no corre desde ESLint 9         | Media   | §7 · PR #14  | Arreglado        |
| 10  | Dos versiones de Playwright            | Baja    | §9 · PR #15  | Arreglado        |
| 11  | La app de ejemplo no tiene 404         | Media   | §6 · PR #13  | **Sin arreglar** |
| 12  | Botones que no llaman al handler       | Baja    | §6 · PR #13  | **Sin arreglar** |
| 13  | El e2e usa una API de terceros en vivo | Media   | §6 · PR #13  | Arreglado        |
| 14  | El e2e desactiva CSP y CORS            | Media   | §6 · PR #13  | Arreglado        |

**Sev.** = gravedad del defecto. **Detectado en** = sección de la auditoría y PR nuestro donde
salió. **En nuestro fork** = si nuestra rama ya lo corrige. **⬆️** = upstream también lo ha
corregido, por su cuenta y de otra forma que nosotros.

### 5 y 6 ya no existen upstream

`core@1.2.0` los corrige, y la sincronización de esta rama los trajo. Su arreglo no es el nuestro:

| Defecto | Upstream                                                      | Nosotros                                                         |
| ------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| 5       | Quita `export { Bridge } from '../src/bridge'` de `bridge.ts` | Lo mismo, pero además declara la clase con su superficie pública |
| 6       | Crea `types/index.d.ts` con los reexports                     | Ídem, más la API runtime (`startApp`, `navigate`, `publish`, …)  |

Al mezclar se conservó la nuestra por ser más estricta, tomando de la suya `let $bridge` y
`getConfig(): CellsConfig | undefined`, que describen mejor lo que hace `src/bridge.js`, y
añadiendo `getBridgeEventManager` a `BridgeAPI`, que es método nuevo de `core@1.2.0`.

### Por qué 11 y 12 siguen sin arreglar aquí

§6 decidió **registrarlos en vez de corregirlos**: los tests del e2e afirman el comportamiento
actual (que una URL sin ruta deja la página anterior en pantalla, y que los botones sólo
funcionan porque además llevan `href`) en lugar de fingir que es correcto. Son defectos de la
app de ejemplo, no del framework, y cambiarlos aquí nos alejaría del ejemplo de upstream sin
ganar nada. Si upstream los arregla, nuestros tests se pondrán rojos y habrá que actualizarlos:
es el aviso que queremos.

### Por qué el resto sí está arreglado aquí

La auditoría los encontró y los necesitábamos verdes, así que se arreglaron. El arreglo se
queda aquí: upstream seguirá teniendo el defecto mientras no lo encuentre por su cuenta.

**Consecuencia a vigilar:** si upstream arregla alguno de forma distinta a la nuestra, al
sincronizar habrá conflicto en ese fichero. Pasó exactamente eso con 5 y 6 en `core@1.2.0`, que
es el aviso funcionando. Quedan como candidatos 1, 2 y 3, los tres en `packages/core/src/`.

## Qué se consideró y **no** entra

Todo lo siguiente salió de la auditoría y queda fuera de este registro, porque es
infraestructura nuestra y no algo roto que hayamos heredado:

| Qué                                                      | Por qué no                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Config compartida de vitest (`vitest.shared.mjs`)        | Decisión de organización nuestra, no un fallo                                                      |
| Política de navegadores (`test-browsers.mjs`, la matriz) | Ídem; upstream puede querer otra                                                                   |
| Informe de cobertura combinado                           | Herramienta nuestra                                                                                |
| Guards `test:toolchain` y `test:types`                   | Son la forma que elegimos de sostener 5, 6, 8 y 10; se describen dentro de esas fichas, no aparte  |
| Umbrales de cobertura y su ratchet                       | Política de proyecto, no un defecto                                                                |
| Hooks locales (husky, commitlint, lint-staged)           | Ídem                                                                                               |
| Limpieza de calidad de tests (§4)                        | Tests que upstream ni siquiera podía ejecutar (ver ficha 8); lo que importa es el defecto original |
| `prepack` de `mcp-server`                                | Paquete nuestro, no existe upstream                                                                |

La regla que aplicamos: **si es "esto lo hemos organizado así", no entra; si es "esto viene
roto de origen", sí.**

## Cómo mantener esto al día

Cuando sincronicemos con upstream: mirar antes la columna _En nuestro fork_. Ahí está el aviso
de conflicto — si upstream ha arreglado algo que nosotros ya habíamos arreglado de otra forma,
ese fichero va a chocar.

Si alguno deja de existir upstream porque lo han corregido, se marca en su fila y se quita de
la lista de riesgos.
