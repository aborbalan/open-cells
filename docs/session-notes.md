# Notas de sesión — open-cells (fork)

> Documento vivo para retomar el trabajo en futuras sesiones.
> Consolida descubrimientos, estado y mejoras pendientes del fork.
> Última actualización: 2026-07-27

## Contexto del fork

- `origin` = `aborbalan/open-cells` (fork del usuario) — **todos los PRs van aquí**.
- `upstream` = `BBVA/open-cells` — **nunca se abren PRs contra BBVA** (no aceptan externos).
- Monorepo de web components (npm workspaces + wireit). Paquetes en `packages/*`.

## Servidor MCP (`packages/mcp-server`)

**Mergeado en `main`** (PR #5). Paquete `@open-cells/mcp-server`, servidor Model Context Protocol
(stdio) para aplicaciones Open Cells. TypeScript + `@modelcontextprotocol/sdk` + zod; el análisis
del proyecto usa el AST de TypeScript, sin type checker.

| Herramienta | Qué hace |
|---|---|
| `open_cells_list_routes` | Rutas: nombre, patrones, componente, `:params`, wildcard, 404, imports diferidos |
| `open_cells_validate_routes` | Nombres/paths duplicados, tags inválidos o no definidos, `action` que no resuelve, falta de ruta 404, nombres desconocidos en `persistentPages`/`commonPages` |
| `open_cells_list_channels` | Mapa de canales: quién publica y quién se suscribe (fichero:línea), canales huérfanos, nombres casi idénticos |
| `open_cells_scaffold_page` | Genera la página y registra la ruta; `dry_run: true` por defecto (devuelve contenido + diff) |
| `open_cells_create_app` | Ejecuta `@open-cells/create-app` sin prompts |
| `open_cells_api_reference` / `open_cells_docs_search` | API y guías de los 8 paquetes |

Recursos MCP: `opencells://api/{module}` y `opencells://guide/{topic}`.

**Estado:** 49 tests en verde (vitest, incluye cliente MCP in-memory), `tsc` limpio, prettier limpio,
enganchado a `wireit` (build + test) del raíz y con changeset `tidy-pandas-shake.md` (minor) todavía
sin consumir — el paquete **no está publicado en npm** (`npm view` da 404), así que hasta que se
publique solo se puede usar desde el checkout.

**Cómo lo consume una sesión de Claude Code:** `.mcp.json` en la raíz lo registra apuntando a
`packages/mcp-server/dist/index.js` con `--project-root packages/example/recipes-app`. Requiere
`npm run build -w @open-cells/mcp-server` una vez, porque arranca desde `dist/`. `CLAUDE.md` en la
raíz documenta el monorepo, las convenciones del framework y lo que está rojo de antes.

**Hallazgo real del propio análisis:** `recipes-app` declara `notFound: false` en su ruta
`not-found`, así que la app de ejemplo se queda sin página 404 efectiva (`validate_routes` lo avisa).

## Objetivo en curso

Rama `fix/build-break`: hacer **usables los tipos publicados** de `@open-cells/core`.
El paquete apuntaba `"types"` a un glob (`types/**/*.ts`) sin enviar `.d.ts`, así que
los consumidores estrictos recibían `TS7016`.

## Estado (hecho)

| Cambio | Commit / PR | Estado |
|--------|-------------|--------|
| Renombrar `types/index.ts` → `index.d.ts` + declarar API runtime de core | `ee249f7` | En `origin/main` |
| `package.json` de core: `"types"` → `types/index.d.ts` | `ee249f7` | En `origin/main` |
| Changeset (patch) `.changeset/young-suns-joke.md` | `ee249f7` | En `origin/main` |
| Newline final en `types/index.d.ts` | `2803b14` · PR #2 | En rama `fix/build-break` |
| Borrar stub `open-cells-fork/package-lock.json` (fuera del repo) | — | Hecho en disco |

**Verificado:** `vite build` de core OK (✓ 250 módulos, `dist/` generado).
El `index.d.ts` compila sin errores propios. `npm run typchk` está en rojo por errores
**pre-existentes** (ver #4).

## Descubrimientos / mejoras pendientes

Ordenadas por prioridad. Las 1–3 son del mismo dominio que el arreglo de tipos y conviene
cerrarlas en el mismo esfuerzo; 4–7 son pre-existentes en upstream.

### 1 · [Alta] `core-plugin` apunta `types` a ruta absoluta
`packages/core-plugin/package.json` → `"types": "/types/index.d.ts"`. La barra inicial hace
que TS lo resuelva como ruta absoluta del filesystem → `TS7016`. **Mismo bug que se arregló en
core.** Fix: quitar la `/` (`"types": "types/index.d.ts"`).

### 2 · [Media] Paquetes sin declaraciones de tipos
`page-mixin`, `page-transitions`, `localize` no tienen campo `types` ni ningún `.d.ts` →
`TS7016` al importarlos. Fix: añadir `types/index.d.ts` + campo `types` en cada uno.

### 3 · [Media] `Bridge`: valor en runtime, solo tipo en `.d.ts`
`src/index.js` exporta `Bridge` como valor (clase), pero `types/index.d.ts` lo expone dentro de
`export type { … }` (type-only) → `new Bridge()` / `instanceof` no compilan. Fix: si es API
pública, `export declare class Bridge {…}`; si es interno, quitarlo del index.

### 4 · [Media] `typchk` en rojo (tipos a mano desincronizados)
`tsc -p tsconfig-typchk.json` reporta ~10 errores. El clave: dos definiciones de `Channel`
(`types/state/channel.ts` vs `src/state/channel`) que no coinciden (a la de `types/` le faltan
`stoped`, `close`). Pre-existente. Fix ideal: alinear `types/` con `src/` o generar los `.d.ts`.

### 5 · [Baja] Build genera `dist/` pero se publica `src/`
`vite build` produce `dist/core.*`, pero `main` → `src/index.js` y `files` no incluye `dist`.
El output del build no se usa. Decidir: (a) enviar fuente y el build sobra, o (b) publicar el
bundle (mover `main`/`exports` a `dist`, incluir `dist` en `files`).

### 6 · [Baja] `core` sin mapa `exports`
El subpath `@open-cells/core/types` (usado por core-plugin) resuelve por directorio, no por
`exports`. Fix: añadir `"exports"` con `"."` y `"./types"` explícitos.

### 7 · [Baja] Higiene
- Newline final en `types/index.d.ts` → **resuelto** en PR #2.
- Stub `package-lock.json` en la raíz del contenedor → **borrado** (estaba fuera del repo).

## Cómo retomar

```bash
cd open-cells
git fetch origin
git switch fix/build-break            # rama de trabajo de tipos
npm run build  -w @open-cells/core    # vite build — debe seguir verde
npm run typchk -w @open-cells/core    # rojo esperado (pre-existente, ver #4)

# Al abrir PRs: SIEMPRE al fork, nunca a BBVA
gh pr create --repo aborbalan/open-cells --base main --head <rama>
```

## Decisiones abiertas

- ¿Alcance del branch de tipos = solo `core` o todo el monorepo? Recomendación: incluir al
  menos el #1 (idéntico al bug ya arreglado en core).
- ¿Se distribuye `src/` (fuente ESM) o `dist/` (bundle)? Aclararlo antes de tocar `exports`/`files`.
