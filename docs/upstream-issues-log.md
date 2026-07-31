# Registro de lo reportado a `BBVA/open-cells`

Qué hemos mandado upstream, por qué, y en qué estado está. Los borradores completos —título,
labels y cuerpo listos para pegar— están en [`upstream-issues.md`](./upstream-issues.md); este
documento es el seguimiento.

> **Estado a 2026-07-31: no se ha abierto ninguna todavía.** Las 14 están redactadas y
> verificadas, pendientes de subir. La columna _Issue_ se rellena al abrir cada una.

## El criterio: qué se manda y qué no

Se manda **solo lo que es de upstream**: defectos que existen en `BBVA/open-cells` tal cual y
sobre los que ellos pueden actuar. Nada que dependa de decisiones nuestras.

Se manda **como issue, nunca como PR** — el upstream no acepta contribuciones externas. Por eso
cada borrador es autocontenido, describe el arreglo en prosa y no enlaza a este fork: quien lo
lea no tiene acceso a nuestro repositorio.

Cada cita está verificada contra el código de upstream en el commit previo a la auditoría
(`398baed`), no reconstruida de memoria.

## Las 14

| #   | Asunto                                 | Sev.    | Issue | Detectado en | En nuestro fork  |
| --- | -------------------------------------- | ------- | ----- | ------------ | ---------------- |
| 1   | Canales muertos tras `logout()`        | Crítica | —     | §2 · PR #9   | Arreglado        |
| 2   | `_hasPublisher()` y RxJS 7             | Alta    | —     | §2 · PR #9   | Arreglado        |
| 3   | `Router.stop()` no para el router      | Alta    | —     | §2 · PR #9   | Arreglado        |
| 4   | `addCellsCoreToPrototype()` lanza      | Alta    | —     | §3 · PR #10  | Arreglado        |
| 5   | Tipos publicados no compilan           | Alta    | —     | §10 · PR #15 | Arreglado        |
| 6   | `types/` desalineados con `src/`       | Media   | —     | §10 · PR #15 | Arreglado        |
| 7   | `npm publish` fallido reporta éxito    | Alta    | —     | §7 · PR #14  | Arreglado        |
| 8   | La suite no arranca en un clon limpio  | Alta    | —     | §1 · PR #8   | Arreglado        |
| 9   | ESLint no corre desde ESLint 9         | Media   | —     | §7 · PR #14  | Arreglado        |
| 10  | Dos versiones de Playwright            | Baja    | —     | §9 · PR #15  | Arreglado        |
| 11  | La app de ejemplo no tiene 404         | Media   | —     | §6 · PR #13  | **Sin arreglar** |
| 12  | Botones que no llaman al handler       | Baja    | —     | §6 · PR #13  | **Sin arreglar** |
| 13  | El e2e usa una API de terceros en vivo | Media   | —     | §6 · PR #13  | Arreglado        |
| 14  | El e2e desactiva CSP y CORS            | Media   | —     | §6 · PR #13  | Arreglado        |

**Sev.** = severidad para upstream. **Detectado en** = sección de la auditoría y PR nuestro donde
salió. **En nuestro fork** = si nuestra rama ya lo corrige.

### Por qué 11 y 12 siguen sin arreglar aquí

§6 decidió **registrarlos en vez de corregirlos**: los tests del e2e afirman el comportamiento
actual (que una URL sin ruta deja la página anterior en pantalla, y que los botones sólo
funcionan porque además llevan `href`) en lugar de fingir que es correcto. Son defectos de la
app de ejemplo, no del framework, y cambiarlos aquí nos alejaría del ejemplo de upstream sin
ganar nada. Si upstream los arregla, nuestros tests se pondrán rojos y habrá que actualizarlos:
es el aviso que queremos.

### Por qué el resto sí está arreglado aquí

No se arreglaron _para_ mandarlos: se arreglaron porque la auditoría los encontró y los
necesitábamos verdes. Reportarlos es lo que queda por hacer, porque el arreglo vive en un fork
que upstream no acepta.

**Consecuencia a vigilar:** si upstream arregla alguno de forma distinta a la nuestra, al
sincronizar habrá conflicto en ese fichero. Los candidatos son 1, 2 y 3 (los tres en
`packages/core/src/`) y 5 y 6 (los `types/` a mano).

## Qué se consideró y **no** se manda

Todo lo siguiente salió de la auditoría y se deja fuera a propósito, porque es infraestructura
nuestra y no un defecto de upstream sobre el que puedan actuar:

| Qué                                                      | Por qué no                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Config compartida de vitest (`vitest.shared.mjs`)        | Decisión de organización nuestra, no un fallo                                                      |
| Política de navegadores (`test-browsers.mjs`, la matriz) | Ídem; upstream puede querer otra                                                                   |
| Informe de cobertura combinado                           | Herramienta nuestra                                                                                |
| Guards `test:toolchain` y `test:types`                   | Son la forma que elegimos de sostener 5, 6, 8 y 10; van descritos dentro de esos issues, no aparte |
| Umbrales de cobertura y su ratchet                       | Política de proyecto, no un defecto                                                                |
| Hooks locales (husky, commitlint, lint-staged)           | Ídem                                                                                               |
| Limpieza de calidad de tests (§4)                        | Tests que upstream ni siquiera podía ejecutar (ver issue 8); reportar el original es lo útil       |
| `prepack` de `mcp-server`                                | Paquete nuestro, no existe upstream                                                                |

La regla que aplicamos: **si el arreglo es "haced esto como nosotros", no se manda; si es "esto
está roto en vuestro código", sí.**

## Cómo mantener esto al día

Al abrir cada issue: pegar el número o la URL en la columna _Issue_ y, si upstream la cierra o
la rechaza, anotarlo en la fila. Cuando una se resuelva upstream y nos toque sincronizar, mirar
antes la columna _En nuestro fork_ — es donde está el aviso de conflicto.
