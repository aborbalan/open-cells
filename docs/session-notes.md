# Notas de sesión — open-cells (fork)

> Documento vivo para retomar el trabajo en futuras sesiones.
> Consolida descubrimientos, estado y mejoras pendientes del fork.
> Última actualización: 2026-08-02

## Contexto del fork

- `origin` = `aborbalan/open-cells` (fork del usuario) — **todos los PRs van aquí**.
- `upstream` = `BBVA/open-cells` — **issues sí, código no** (decidido el 2026-08-03). Se les
  puede reportar un defecto suyo y seguir la conversación; no se les manda un PR, ni un parche,
  ni un diff para pegar.
  La norma anterior decía que no se les enviaba absolutamente nada, apoyada en que no aceptaban
  nada de fuera. **Eso era falso**: las issues [#50](https://github.com/BBVA/open-cells/issues/50)
  y [#51](https://github.com/BBVA/open-cells/issues/51) salieron de aquí en junio y julio, y
  `julcasans` las arregló y publicó las dos — `@open-cells/core@1.2.0` y
  `@open-cells/core-plugin@1.2.3`, que son exactamente las versiones que trajo la sincronización
  del 2 de agosto. Tardaron un mes y dos semanas respectivamente.
  Lo que sigue en pie es la otra mitad: **nuestro código es nuestro** y la divergencia no se
  negocia con ellos. Su URL de push sigue puesta a `DISABLED` a propósito y **no se restaura**:
  es lo que impide que el código se vaya por donde no debe. Y `gh pr create` en un fork apunta
  al repo padre por defecto, así que hay que pasarle siempre `--repo aborbalan/open-cells`.
- **Un reporte no es una propuesta.** Lo que funcionó allí fueron defectos pequeños,
  reproducibles y con evidencia. Proponerles que adopten nuestra arquitectura —el `mcp-server`,
  los gates, la auditoría— es otra conversación y no cabe dentro de un parte de fallo.
- Monorepo de web components (npm workspaces + wireit). Paquetes en `packages/*`.
- `main` lleva ya el `mcp-server` **y** la auditoría de tests, integrados en esa dirección.

## Servidor MCP (`packages/mcp-server`)

**Mergeado en `main`** (PR #5). Paquete `@open-cells/mcp-server`, servidor Model Context Protocol
(stdio) para aplicaciones Open Cells. TypeScript + `@modelcontextprotocol/sdk` + zod; el análisis
del proyecto usa el AST de TypeScript, sin type checker.

| Herramienta                                           | Qué hace                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open_cells_list_routes`                              | Rutas: nombre, patrones, componente, `:params`, wildcard, 404, imports diferidos                                                                              |
| `open_cells_validate_routes`                          | Nombres/paths duplicados, tags inválidos o no definidos, `action` que no resuelve, falta de ruta 404, nombres desconocidos en `persistentPages`/`commonPages` |
| `open_cells_list_channels`                            | Mapa de canales: quién publica y quién se suscribe (fichero:línea), canales huérfanos, nombres casi idénticos                                                 |
| `open_cells_scaffold_page`                            | Genera la página y registra la ruta; `dry_run: true` por defecto (devuelve contenido + diff)                                                                  |
| `open_cells_create_app`                               | Ejecuta `@open-cells/create-app` sin prompts                                                                                                                  |
| `open_cells_api_reference` / `open_cells_docs_search` | API y guías de los 8 paquetes                                                                                                                                 |

Recursos MCP: `opencells://api/{module}` y `opencells://guide/{topic}`.

**Estado:** 55 tests en verde (vitest, incluye cliente MCP in-memory), `tsc` limpio, prettier
limpio, con puerta de cobertura desde la integración (82 líneas / 68 ramas) y con changeset
`tidy-pandas-shake.md` (minor) todavía sin consumir — el paquete **no está publicado en npm**
(`npm view` da 404), así que hasta que se publique solo se puede usar desde el checkout.
El `build` sigue enganchado a `wireit`; el `test` ya no, porque el `test` del raíz corre los
workspaces en secuencia (wireit los lanzaba en paralelo y nueve navegadores a la vez agotaban
la memoria de la máquina).

**Cómo lo consume una sesión de Claude Code:** `.mcp.json` en la raíz lo registra apuntando a
`packages/mcp-server/dist/index.js` con `--project-root packages/example/recipes-app`. Requiere
`npm run build -w @open-cells/mcp-server` una vez, porque arranca desde `dist/`. `CLAUDE.md` en la
raíz documenta el monorepo, las convenciones del framework y lo que está rojo de antes.

**Hallazgo real del propio análisis:** `recipes-app` declara `notFound: false` en su ruta
`not-found`, así que la app de ejemplo se queda sin página 404 efectiva (`validate_routes` lo avisa).

## Sincronización con upstream — 2026-08-02

Primera desde la auditoría, en `chore/sync-upstream` (PR #19). Trae `core@1.2.0`,
`core-plugin`/`page-mixin@1.2.3`, el arreglo de publicación en npm y el paquete experimental
`packages/labs/pwbrouser`.

Lo que conviene recordar de cómo se resolvió:

- **Upstream ha corregido por su cuenta los defectos 5 y 6** del registro, de otra forma que
  nosotros. Se conservó la nuestra por más estricta, tomando de la suya `let $bridge` y
  `getConfig(): CellsConfig | undefined`. El detalle, en
  [`upstream-issues-log.md`](./upstream-issues-log.md).
- **Sus `overrides` rompen el build si se aceptan tal cual.** Fuerzan majors enteros sobre
  consumidores incompatibles y `brace-expansion@5.0.9`, que es ESM y tumba wireit, que importa el
  default. Quedaron reexpresados en la forma precisa `pkg@rango` que ya usaba el fichero.
- **eslint se queda en 9.** Upstream sube a 10, pero la flat config está calibrada para la 9.
  Pendiente como decisión aparte, no dentro de un merge de sincronización.
- **`packages/labs/*` entra en workspaces** y trae su propio toolchain (pnpm, biome, TS 6 beta).
  `check-test-toolchain.mjs` ignora ahora ese árbol, que es lo que ya hacía su otra mitad.

## Auditoría de tests — completada

Las diez secciones de la auditoría de julio de 2026 están en 10/10. El detalle, con la salida
de cada comando que lo demuestra, está en [`testing-scorecard.md`](./testing-scorecard.md);
aquí solo queda el índice de por dónde entró cada cosa.

| §    | Sección                                  | Rama                                       | PR  |
| ---- | ---------------------------------------- | ------------------------------------------ | --- |
| 1    | Suite ejecutable                         | `test/s1-runnable-suite`                   | #8  |
| 2    | Cobertura `core`                         | `test/s2-core-coverage`                    | #9  |
| 3    | Cobertura por paquete                    | `test/s3-package-coverage`                 | #10 |
| 4    | Calidad de tests                         | `test/s4-test-quality`                     | #11 |
| 5    | `localize`                               | `test/s5-localize`                         | #12 |
| 6    | E2E                                      | `test/s6-e2e`                              | #13 |
| 7    | CI y quality gates                       | `test/s7-ci-gates`                         | #14 |
| 8–10 | Infraestructura, deps y contrato público | `claude/test-audit-worktree-status-3vvdim` | #15 |

**Total: 3.1 → 10.0.** 920 tests en la matriz completa (866 con un solo navegador),
96.11 % de líneas combinadas.

### Lo que dejó de estar en rojo

Estas tres cosas estaban documentadas en `CLAUDE.md` como «known red, do not chase». Ya no lo
están, y `CLAUDE.md` está actualizado:

- `npm run build -w @open-cells/recipes-app` → verde desde §1 (`tsc` exit 0).
- `npm run typchk -w @open-cells/core` → verde desde §10 (eran 13 errores).
- `npm run lint` → funciona desde §7 (hay `eslint.config.js`); 0 errores, 29 warnings.

### Gates que hay que mantener verdes

Los tres corren dentro de `npm test`, antes que las suites:

```sh
npm run test:toolchain   # una sola versión de cada runner, sin imports sin declarar
npm run test:types       # typchk de core + types-contract/ + los .d.ts van en el tarball
npm run coverage:report  # informe combinado (--check en CI)
```

### Navegadores

Los tres runners (vitest, web-test-runner, Playwright) leen las mismas dos variables desde
`test-browsers.mjs`:

```sh
OPEN_CELLS_BROWSERS=chromium,webkit          # matriz; e2e usa las tres por defecto
OPEN_CELLS_CHROMIUM_EXECUTABLE=/ruta/chrome  # binario ya provisionado por la imagen
```

La segunda es la que permite correr la suite en entornos sin acceso a la CDN de Playwright.

## Estado del fork: tipos publicados

Cerrado en §10. De la lista de mejoras que arrastraba este documento:

| #   | Hallazgo                                        | Estado                                     |
| --- | ----------------------------------------------- | ------------------------------------------ |
| 1   | `core-plugin` con `types` en ruta absoluta      | Resuelto                                   |
| 2   | Paquetes sin declaraciones                      | Resuelto: los 7 publicables tienen `.d.ts` |
| 3   | `Bridge` valor en runtime, solo tipo en `.d.ts` | Resuelto en §10                            |
| 4   | `typchk` en rojo por tipos desincronizados      | Resuelto en §10                            |
| 5   | El build genera `dist/` pero se publica `src/`  | **Abierto** — ver abajo                    |
| 6   | `core` sin mapa `exports`                       | **Abierto** — ver abajo                    |
| 7   | Higiene (newline, stub de lockfile)             | Resuelto                                   |

## Pendiente

El backlog desglosado en unidades pequeñas está en [`backlog.html`](./backlog.html): 24 issues
en 8 grupos, cada una con su criterio de cierre y sus dependencias. Ninguna está abierta todavía.

Se publica como artefacto en
<https://claude.ai/code/artifact/5cd79bc6-1e6e-45ca-a7f4-63b399cecf78>. **Para actualizarlo hay
que pasar esa URL al republicar**; republicar sin ella crea un artefacto nuevo en vez de
actualizar ese. El fuente vive en el repositorio precisamente para que una sesión futura pueda
editarlo sin reconstruirlo.

### Qué ficheros edita el arreglo de cada ficha — 2026-08-03

Cada ficha del backlog lleva marcada la procedencia, verificada fichero a fichero contra
`upstream/main` (`b01c489`), no por parecido de nombres. **El eje es qué ficheros hay que editar,
no de quién es el defecto**: esto es un fork, así que todo lo heredado está en los dos árboles a
la vez. «Heredado» no significa «suyo y no nuestro» — el primer corte usaba esa palabra y se leyó
justo al revés.

| Procedencia                                         | Fichas | Cuáles                                                    |
| --------------------------------------------------- | ------ | --------------------------------------------------------- |
| **heredado** — el arreglo sólo edita ficheros suyos | 8      | 1A · 1B · 1C · 1D · 1E · 2B · 2C · 3B                     |
| **mixta** — edita de los dos lados                  | 4      | 3A · 4B · 5A · 5B                                         |
| **propio** — sólo ficheros que sólo existen aquí    | 12     | 2A · 3C · 4A · 4C · 6A · 6B · 6C · 7A · 7B · 8A · 8B · 8C |

Los dos casos que fijan el criterio: **3A es mixta**, porque hay que tocar su `routes.ts` y
nuestro `navigation.spec.ts` en el mismo PR; y **7A es propia** aunque `external/event-emitter.js`
sea byte a byte idéntico al suyo, porque upstream no tiene ningún test para ese fichero y lo que
se amplía es `packages/core/test/external/event-emitter.test.js`, que es nuestro.

Lo que sostiene el reparto: `scripts/check-public-types.mjs` no existe en upstream, y su
`package.json` no declara `test:types` ni `test:toolchain` — su `test` es un `wireit` pelado. El
`web-test-runner.config.js` de `localize` tiene allí `coverage: true` **sin** `threshold`, así que
el ratchet del 95 % que revienta en worktree es nuestro. Lo heredado, en cambio, sigue aquí tal
cual: nuestro `routes.ts` conserva el `notFound: false` en la línea 39, los cinco `@click` siguen
devolviendo el método, nuestro `core` lleva el `prepublish` en la línea 12 y no declara `exports`
—ni él ni `core-plugin`, `element-controller`, `page-controller` y `page-mixin`—, y el
`.prettierrc.json` coincide byte a byte, de modo que los 67 ficheros sin formatear son de los dos.

**Las ocho heredadas viven en los grupos 1, 2 y 3**, que es además el orden del documento y
respeta la única dependencia que cruza grupos (1B → 2B). Los grupos 6 y 8 son íntegramente
propios: ahí no hay nada que enseñar fuera.

**Hay que reverificarlo en cada sincronización con upstream.** Un fichero que hoy sólo existe aquí
puede aparecer allí mañana, y el reparto dejaría de ser cierto sin que nada avise.

### `packages/labs` es de upstream, no nuestro — decisión de 8C, 2026-08-03

Sale de `workspaces`, de los `ignores` de eslint y del nuevo `.prettierignore`. Se gestiona con su
propio `pnpm`, que es como está escrito: `packageManager: pnpm@10.33.4`, biome, TypeScript 6 beta y
su `pnpm-lock.yaml`.

Lo que lo decidió no fue una preferencia, fue una factura ya pagada: **nuestro prettier reformateó
15 de sus ficheros `.ts` al llegar en la sincronización del 2 de agosto**, sólo cambiando el estilo
de comillas. Comprobado pasando la versión de upstream por nuestro prettier: los 15 salen byte a
byte idénticos a lo que quedó mergeado. Cada uno de esos ficheros conflictúa ahora en cada cambio
que ellos hagan, a cambio de nada. Y `npm test` corría su suite con `vitest ^4.1.9` mientras
`test:toolchain` pinea la familia a `4.0.18` exacto a propósito.

Las cinco herramientas de la tabla de la ficha coinciden ya con la decisión: `test:toolchain` y
`coverage:report` no lo alcanzaban y siguen sin hacerlo; `npm test`, `eslint .` y
`prettier --check .` han dejado de hacerlo. **Sacarlo de `workspaces` no bastaba**: eslint y
prettier recorren el disco, no la lista de workspaces.

Efecto colateral que conviene no malinterpretar: `prettier --check .` pasa de **67 ficheros sin
formatear a 47**. No es que se haya formateado nada — son los 20 de labs que dejan de contarse.

Lo de abajo es el detalle de lo que arrastramos de antes.

### `core` sin mapa `exports` (#6)

Sigue resolviendo subpaths por directorio. Añadir `"exports"` es correcto pero **rompe cuatro
suites** si se hace sin cuidado: `core-plugin`, `element-controller`, `page-controller` y
`page-mixin` importan el fixture compartido como
`@open-cells/core/test/helpers/bridge-fixture.js`, y `core-plugin` importa
`@open-cells/core/types`. Un mapa `exports` tiene que declarar `"."`, `"./types"` y
`"./test/*"` o mover el fixture a otro sitio primero.

### `dist/` vs `src/` (#5)

`vite build` produce `dist/core.*`, pero `main` apunta a `src/index.js` y `files` no incluye
`dist`. Decidir si se distribuye fuente ESM o bundle antes de tocar `exports`/`files`.

### Los gates no corren igual fuera de CI (8A y 8B)

Salieron los dos al sincronizar con upstream, y ninguno es una regresión de ese merge: los dos
se reprodujeron con `main` sin tocar. Comparten causa de fondo — el gate se escribió contra el
entorno de CI, que es Linux y un checkout plano, y falla en cuanto se sale de ahí.

- **`test:types` no arranca en Windows.** `scripts/check-public-types.mjs` lanza `npx` y
  `npm.cmd` con `execFileSync` sin `shell: true`, y Node en Windows no puede lanzar un `.cmd`
  directamente. Todo muere con `spawnSync npm.cmd EINVAL`, pero se presenta como si fallara la
  comprobación: «types-contract does not compile» con el error vacío, y un «could not pack» por
  paquete. Los dos son falsos — a mano, `npx tsc -p types-contract/tsconfig.json` sale con 0 y
  `typchk` está limpio.

- **La cobertura de `localize` se hunde en un worktree anidado.** Los 46 tests pasan, pero el
  total cae de 98,72 % a 50,19 % y revienta el ratchet del 95 %. `web-test-runner` no deshace el
  prefijo `__wds-outside-root__` con el que sirve lo que queda fuera de su `rootDir`, y acaba
  contando `sinon-esm.js` como fuente sin cubrir. Pasa cuando el worktree cuelga de otro checkout
  que ya tiene `node_modules` por encima, que es exactamente lo que es `.claude/worktrees/*`.

El detalle y el criterio de cierre de cada uno, en [`backlog.html`](./backlog.html). **El umbral
del 95 % no se toca**: es un ratchet.

### Avisos de `npm audit`

35 advisories, casi todos transitivos vía eslint y vite. Se dejaron fuera de §9 a propósito:
no son dependencias que este repositorio eligiera y merecen su propio cambio.

### Formato como gate de CI

`prettier --check` falla en 67 ficheros anteriores a la configuración. `lint-staged` formatea
cada fichero que se toca, así que el repositorio converge solo; convertirlo en gate es una
decisión aparte.

### Protección de rama

No es un fichero, es un ajuste del repositorio. El check al que apuntar ya existe: activar
_Require status checks to pass_ en `develop` para el job `build`.

## Cómo retomar

```sh
git fetch origin
git switch main
npm ci
npx playwright install --with-deps chromium firefox webkit   # una sola vez, una sola versión

npm test                    # gates + las diez suites
npm run coverage:report     # informe combinado

# Al abrir PRs: SIEMPRE al fork. A BBVA no se le manda nada, en ningún formato.
gh pr create --repo aborbalan/open-cells --base main --head <rama>
```

`main` tiene ya el `mcp-server` y la auditoría completa. `develop` queda como rama de
integración por si vuelve a hacer falta encadenar trabajo por secciones.

### Lo que sacó a la luz integrar el `mcp-server`

Los gates de §8–§10 nunca habían visto ese paquete, y al juntarlos aparecieron tres cosas:

- **`mcp-server` publicaba desde `dist/` sin construirlo.** No tenía `prepack` ni `prepare`, así
  que un `npm publish` desde un clon limpio subía un tarball sin `main`, sin `types` y sin
  `bin`. Funcionaba solo porque `publish.yml` construye antes. Ahora lleva `prepack`.
- **El checker de toolchain daba falsos positivos.** Leía los `import` que hay dentro de los
  template literals con los que `test/helpers.ts` genera proyectos de prueba, y pedía declarar
  dependencias que el paquete no carga. Ahora descarta comentarios y template literals.
- **No tenía puerta de cobertura.** Ya la tiene, puesta donde la suite llega de verdad
  (82 líneas / 68 ramas): `index.ts` es el entry point stdio y `scaffold/create-app.ts` lanza el
  generador real como proceso hijo, así que ninguno de los dos se ejecuta dentro del test.
