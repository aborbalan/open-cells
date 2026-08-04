# Defecto 11 — La app de ejemplo no tiene ruta 404

> **Issues sí, código no** (desde el 2026-08-03). Esta ficha se puede reportar a
> `BBVA/open-cells` como issue; lo que no se les manda es código — ni PR, ni parche, ni diff para
> pegar.

**Severidad:** media · **Área:** `packages/example/recipes-app` · **En nuestro fork:** sin
arreglar, a propósito

**Reportada:** [`BBVA/open-cells#62`](https://github.com/BBVA/open-cells/issues/62), 2026-08-03.
La primera abierta bajo la norma nueva. Se publicó con una sección de dudas al final —si `#!/…` es
la forma correcta de provocar un 404, si el `path` declarado debería ser alcanzable tal cual, y si
hay otro mecanismo que haga innecesario el flag—, porque el formato de la URL no está documentado
en ninguna parte y convenía decirlo antes que ellos.

**En una línea:** la única ruta candidata a 404 lleva `notFound: false`, así que una URL sin match
no selecciona nada y deja en pantalla lo que hubiera antes.

---

## Detalle

### What happens

`recipes-app` declares a not-found route and then switches it off. In
[`src/router/routes.ts`](https://github.com/BBVA/open-cells/blob/main/packages/example/recipes-app/src/router/routes.ts):

```ts
{
  path: '/not-found',
  name: 'not-found',
  notFound: false,          // <-- turns off the only candidate
  component: 'not-found-page',
  action: async () => {
    await import('../pages/not-found/not-found-page.js');
  },
},
```

In Open Cells the 404 page is the route flagged `notFound: true`. With the flag `false` the router
has no fallback, so an unmatched URL selects nothing at all: the previous page stays on screen and
the address bar keeps the URL that matched nothing.

The route itself still works when addressed directly — `#!/not-found` renders `not-found-page`.
That is what makes it look intentional rather than broken.

### Why it matters

This is the application everyone copies to start. A newcomer reads `notFound: false` next to a
route called `not-found` and reasonably concludes that is how you declare a 404 page, then ships an
application where mistyped URLs silently do nothing.

It also hides the framework's own feature: `notFound` is the whole mechanism, and the reference
application demonstrates it switched off.

### Reproduction

1. `npm run dev -w @open-cells/recipes-app`
2. Open `#!/` and let the home page render.
3. Navigate to `#!/no-such-page`.

Expected: the not-found page. Actual: the home page is still there, and the URL reads
`#!/no-such-page`.

### Suggested fix

```ts
notFound: true,
```

Anything asserting the current behaviour has to be turned around in the same change — see below,
because that is exactly the shape of our own test.

### Nuestro arreglo y su test

**No lo hemos arreglado, y es deliberado.** La §6 de la auditoría decidió _registrar_ el defecto en
vez de corregirlo: cambiar la app de ejemplo nos aleja de la de upstream sin ganar nada, y el
defecto es de la app, no del framework.

Lo que sí hay es un test que **fija el comportamiento actual** en vez de fingir que es correcto:

- [`navigation.spec.ts#L130-L139`](https://github.com/aborbalan/open-cells/blob/4daa2a3/packages/example/recipes-app/tests/navigation.spec.ts#L130-L139)
  — _"leaves an unmatched URL alone, because the app declares no 404 route"_

Ese test es el aviso: **si upstream arregla esto, se pondrá rojo en la siguiente sincronización** y
tendremos que darle la vuelta. Es justo lo que queremos que pase.

---

## Trazabilidad

- **Detectado en:** §6 de la auditoría · nuestro PR #13. Lo detecta también
  `open_cells_validate_routes` del `mcp-server`, que fue el primer hallazgo real de esa herramienta
  sobre código de verdad.
- **Verificado contra upstream:** `b01c489`, 2026-08-03. `routes.ts` es **idéntico** al nuestro,
  byte a byte.
- **Riesgo de conflicto al sincronizar:** bajo en el fichero — no lo tocamos. Medio en el test, que
  habrá que invertir el día que ellos lo arreglen.
- **Depende de:** nada.
