# Defecto 12 — Cinco botones de cabecera devuelven su handler en vez de llamarlo

> **Issues sí, código no** (desde el 2026-08-03). Esta ficha se puede reportar a
> `BBVA/open-cells` como issue; lo que no se les manda es código — ni PR, ni parche, ni diff para
> pegar.

**Severidad:** baja · **Área:** `packages/example/recipes-app` · **En nuestro fork:** sin arreglar,
a propósito

**En una línea:** `@click="${() => this._navigateToHome}"` devuelve el método y no lo ejecuta, así
que el handler que existe para llamar a `preventDefault()` nunca se ejecuta y navega el navegador
por el `href`.

---

## Detalle

### What happens

Five click bindings in the example application return the handler instead of calling it. The arrow
function's body is a member expression, so clicking evaluates it, discards the result, and nothing
else happens.

| File                                                  | Handler                      |
| ----------------------------------------------------- | ---------------------------- |
| `src/pages/category/category-page.ts`                 | `_navigateToHome`            |
| `src/pages/category/category-page.ts`                 | `_navigateToFavoriteRecipes` |
| `src/pages/recipe/recipe-page.ts`                     | `_navigateToHome`            |
| `src/pages/recipe/recipe-page.ts`                     | `_navigateToFavoriteRecipes` |
| `src/pages/favorite-recipes/favorite-recipes-page.ts` | `_navigateToHome`            |

From
[`category-page.ts`](https://github.com/BBVA/open-cells/blob/main/packages/example/recipes-app/src/pages/category/category-page.ts):

```ts
<md-outlined-button
  aria-label="Back to home"
  href="#!/"
  @click="${() => this._navigateToHome}"   // <-- returns the method, never calls it
>
```

The same files get it right elsewhere, which is what makes it a slip rather than a style:

```ts
@click="${(ev: CustomEvent) => this._navigateToRecipe(ev, recipe.idMeal)}"
```

### Why it matters

The handler's entire job is to stop the browser from following the `href`:

```ts
_navigateToHome(ev: CustomEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  this.pageController.navigate('home');
}
```

Because it never runs, `preventDefault()` never runs either, and the browser follows
`href="#!/"`. The user lands on the right page, which is precisely why this has gone unnoticed:
the visible outcome of the bug and of the fix are the same.

What is lost is silent. Navigation never goes through `pageController.navigate()`, so anything the
router does on a programmatic navigation is skipped; `stopPropagation()` never runs either. And a
reader copying this pattern into a component **without** an `href` — a plain `<button>` — gets a
control that does nothing at all, with no error in the console to explain it.

### Reproduction

1. `npm run dev -w @open-cells/recipes-app`
2. Open a category page and put a breakpoint in `_navigateToHome`, or add a `console.log` to it.
3. Click "Back to home".

Expected: the handler runs. Actual: it never does; the browser navigated by `href`.

To see the consequence rather than the cause, remove `href="#!/"` from the button and click it:
nothing happens.

### Suggested fix

Call the handler and hand it the event, matching the pattern the same files already use for
`_navigateToRecipe`:

```ts
@click="${(ev: CustomEvent) => this._navigateToHome(ev)}"
```

Note that the current arrow takes no parameter, so `preventDefault()` would have no event to work
on even if the call were added without one.

### Nuestro arreglo y su test

**No lo hemos arreglado, y es deliberado**, por la misma razón que el defecto 11: es de la app de
ejemplo, no del framework, y corregirlo aquí nos aleja de la suya sin ganar nada.

Y hay un matiz que conviene decir, porque afecta a cómo se prueba: **un test que sólo compruebe que
se llega a la página no detecta nada**, porque el `href` produce el mismo resultado. Para pillarlo
hay que bloquear la navegación por `href` —`preventDefault` sobre el click, o interceptar la
navegación— y comprobar que el handler se ejecutó igualmente. Eso es la ficha 3C de nuestro
backlog, y está pendiente.

---

## Trazabilidad

- **Detectado en:** §6 de la auditoría · nuestro PR #13.
- **Verificado contra upstream:** `b01c489`, 2026-08-03. Los cinco `@click` están **verbatim** en
  sus tres páginas; los dos `_navigateToRecipe` correctos también.
- **Riesgo de conflicto al sincronizar:** bajo — no tocamos esos ficheros.
- **Depende de:** nada. Nuestra 3C (el test que lo pillaría) depende de arreglarlo primero.
