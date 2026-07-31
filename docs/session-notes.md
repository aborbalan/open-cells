# Notas de sesión — open-cells (fork)

> Documento vivo para retomar el trabajo en futuras sesiones.
> Consolida descubrimientos, estado y mejoras pendientes del fork.
> Última actualización: 2026-07-31

## Contexto del fork

- `origin` = `aborbalan/open-cells` (fork del usuario) — **todos los PRs van aquí**.
- `upstream` = `BBVA/open-cells` — **nunca se abren PRs contra BBVA** (no aceptan externos).
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

### Avisos de `npm audit`

34 advisories, casi todos transitivos vía eslint y vite. Se dejaron fuera de §9 a propósito:
no son dependencias que este repositorio eligiera y merecen su propio cambio.

### Formato como gate de CI

`prettier --check` falla en 62 ficheros anteriores a la configuración. `lint-staged` formatea
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

# Al abrir PRs: SIEMPRE al fork, nunca a BBVA
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
