# Defecto 15 — Las suscripciones manuales no se limpian nunca

> ⛔ **Documento interno.** No se envía nada a `BBVA/open-cells` — ni issues, ni PRs, ni
> comentarios. Esta ficha existe para nosotros.

**Severidad:** media · **Área:** `@open-cells/element-controller`, `@open-cells/page-mixin`,
`@open-cells/core` · **En nuestro fork:** **sin arreglar** (documentado a propósito, ver
[Por qué no lo arreglamos](#por-qué-no-lo-arreglamos-todavía))

**En una línea:** `hostDisconnected()` sólo desuscribe los canales declarados en
`inbounds`/`outbounds`; todo lo que el componente suscribió llamando a `subscribe()` sigue vivo
después de que el elemento salga del DOM, y su nodo se queda retenido en un `Map` fuerte del
core.

---

## Detalle

### What happens

`ElementController` keeps exactly one list of subscriptions, and only the declarative binder
writes to it. In
[`packages/element-controller/src/ElementController.js`](https://github.com/BBVA/open-cells/blob/main/packages/element-controller/src/ElementController.js):

```js
_inOut(propertyName, outChannelName, inChannelName, skipUpdate = false, action) {
  // ...
  this.subscriptions.push({ channel: inChannelName, action: internalSubscriberAction }); // L86
}

hostConnected() {
  for (const subscription of this.subscriptions) {          // L103-107
    this.subscribe(subscription.channel, subscription.action);
  }
}

hostDisconnected() {
  for (const subscription of this.subscriptions) {          // L109-113
    this.unsubscribe(subscription.channel);
  }
}
```

`this.subscriptions` is populated **only** from `_inOut()`, which runs from
`_definedBoundedProperties()` over `static inbounds` / `static outbounds`. A component that
subscribes imperatively —

```js
this.elementController.subscribe('liked-recipes', data => {
  this._liked = data;
});
```

— goes straight through `CorePlugin`'s `subscribe` service to
`ComponentConnector.addSubscription()`. Nothing records it on the controller, so neither
`hostConnected()` nor `hostDisconnected()` knows it exists.

`PageMixin` is the same story with less machinery: it calls `plugCellsCore(this)` in the
constructor and defines no `disconnectedCallback` at all, so **no** subscription it makes is ever
cleaned up automatically — not even the page's own private `__oc_page_*` channel.

### Why it matters

Two separate consequences, and the second one is the one that bites.

**1. The callback keeps firing on a detached node.** The RxJS subscription is still attached to
the channel, so every `publish()` still reaches a component that is no longer in the document.
For a Lit host that means `requestUpdate()` on a detached element on every publish; for a
callback that touches `shadowRoot` or a queried child, it means acting on a tree nobody is
looking at.

**2. The node itself cannot be collected.** In
[`packages/core/src/component-connector.js`](https://github.com/BBVA/open-cells/blob/main/packages/core/src/component-connector.js),
subscriptors are held in a **strong** `Map` keyed by the node:

```js
this.subscriptors = new Map();          // L83

getSubscriptor(node) {                  // L101-111
  let subscriptor = this.subscriptors.get(node);
  if (!subscriptor) {
    subscriptor = new Subscriptor(node, this.channelPrefix);
    this.subscriptors.set(node, subscriptor);
  }
  return subscriptor;
}
```

`Subscriptor` also stores `this.node = node`, and the callback registered on the channel is the
one built by `wrapCallback()`, which closes over the node and carries it on a `node` property.
So a detached element is referenced from three directions at once.

The only thing that removes a `Map` entry is `unregisterComponent()` (L379), and it is called
from exactly two places in `bridge.js`: `_disconnectCrossComponents()` (L1148, cross-components
only) and the reset path behind `logout()`. **There is no per-node cleanup when an ordinary
component leaves the DOM.**

Note that half of this hits the declarative path too: `ComponentConnector.unsubscribe()` (L350)
filters `subscriptor.subscriptions` but never deletes the `Map` entry, and never drops the
`Subscriptor`'s own `node` reference. So even a well-behaved component that unsubscribes
correctly leaves its node retained; the manual case just adds a live subscription on top.

### Why nobody notices

Navigating does not disconnect anything. `Template.activate()` / `deactivate()` in
[`packages/core/src/template.js`](https://github.com/BBVA/open-cells/blob/main/packages/core/src/template.js)
only flip an attribute:

```js
activate()   { this._setAttribute('state', 'active');   }   // L93-95
deactivate() { this._setAttribute('state', 'inactive'); }   // L101-103
```

Page nodes stay in the document, which is why they are reused and why `firstUpdated` does not run
again. As a result `disconnectedCallback` — and therefore `hostDisconnected()` — is almost never
reached during normal navigation. The manual `unsubscribe()` calls in the example app's pages
(`home-page.ts`, `page-layout.ts`) are effectively dead code in the navigation flow, and pages
keep receiving values while hidden, which is what you want.

So the leak does not show up where you would look for it — on the pages. It shows up in
**components created and destroyed inside a page**: list items, dialogs, cards, anything rendered
from a repeat. Each mount registers a subscription and a `Map` entry that nothing ever removes.

### Why the obvious fix is wrong

"Just unsubscribe in `hostDisconnected()`" breaks reparenting. Moving an element in the DOM fires
`disconnectedCallback` followed by `connectedCallback`; the declarative path survives that because
`hostConnected()` re-subscribes from `this.subscriptions`. A manual subscription has no such
record, so auto-unsubscribing without auto-re-subscribing would leave the component silently deaf
— no error, no warning, just a channel that never arrives again.

Any fix has to be a **symmetric pair**: record `(channel, callback)` on subscribe, tear down on
disconnect, replay on connect.

### A constraint any fix has to respect

`Subscriptor.hasSubscription()` de-duplicates per **node + channel**, not per callback, in
[`packages/core/src/state/subscriptor.js`](https://github.com/BBVA/open-cells/blob/main/packages/core/src/state/subscriptor.js):

```js
hasSubscription(channel) {                                       // L60-62
  return this.subscriptions.filter(d => d.channel === channel).length > 0;
}

subscribe(channel, fn, previousState, bind) {                    // L192
  if (!this.hasSubscription(channel)) { /* ... */ }              // L193 — otherwise: no-op
}
```

Two consequences that make the naive fix dangerous:

- A second `subscribe()` to the same channel from the same host is a **silent no-op**. The second
  callback is never registered and never called.
- A single `unsubscribe(channel)` removes the one subscription that exists, so it cuts delivery
  for whoever else on that host thought they had one.

A component that declares `inbounds: { _x: { channel: 'foo' } }` **and** also calls
`subscribe('foo', …)` therefore shares a single subscription today. Turning on auto-unsubscribe
without addressing this turns a latent oddity into a source of diffuse bugs.

### Suggested fix

Record manual subscriptions in the controller and treat them like the declarative ones on both
hooks. The wrapping has to happen in the constructor, where `subscribe` is bound to the host —
that binding is what makes the bridge register the host node, so it must be preserved:

```js
constructor(host) {
  this.subscriptions = [];
  this.__manual = new Map();                  // channel -> callback
  plugCellsCore(this);

  const boundSubscribe = this.subscribe.bind(host);
  const boundUnsubscribe = this.unsubscribe.bind(host);

  this.subscribe = (channel, callback) => {
    this.__manual.set(channel, callback);
    return boundSubscribe(channel, callback);
  };
  this.unsubscribe = channel => {
    this.__manual.delete(channel);
    return boundUnsubscribe(channel);
  };
  // ...
}
```

…and iterate `__manual` in `hostConnected()` and `hostDisconnected()` alongside
`this.subscriptions`. `PageMixin` needs the equivalent in `pluginCellsCoreAPI()` plus a
`disconnectedCallback`, since it has no controller lifecycle to hang off.

Two things that belong with it:

- A `console.warn` when a host subscribes twice to the same channel, so the de-duplication above
  stops being silent.
- An opt-out (`new ElementController(this, { autoUnsubscribe: false })`) rather than an opt-in:
  the default should be the one that does not leak.

Independently of the controller change, `ComponentConnector.unsubscribe()` should drop the
`Map` entry when a subscriptor has no subscriptions left, which is what actually releases the
node.

### Reproduction

Both halves, against the real bridge (`useBridge()` from
`packages/core/test/helpers/bridge-fixture.js`):

```js
// 1 — the manual subscription keeps delivering to a detached host
const host = document.createElement('some-host'); // ElementController attached
document.body.appendChild(host);
const controller = new ElementController(host);
const seen = [];
controller.subscribe('manual-channel', v => seen.push(v));
controller.hostConnected();

bridge.publish('manual-channel', 'first');
controller.hostDisconnected();
host.remove();
bridge.publish('manual-channel', 'second');

seen.length; // 2 — the second value reached a host that is out of the document

// 2 — the node is retained even when the declarative path cleans up correctly
//     (host declares `static inbounds = { recipe: { channel: 'recipes' } }`)
controller.hostDisconnected();
host.remove();
bridge.ComponentConnector.subscriptors.has(host); // true
```

Comprobado ejecutándolo (vitest browser, chromium) contra `840f8cc`, no deducido del código:
`seen.length === 2` y `subscriptors.has(host) === true`.

---

## Por qué no lo arreglamos todavía

Es un cambio de comportamiento en tres paquetes publicados (`element-controller`, `page-mixin` y,
para la parte del `Map`, `core`), y afecta a cualquier consumidor que hoy dependa —a sabiendas o
no— de que una suscripción sobreviva a un `disconnectedCallback`. Se documenta antes de tocarlo,
que es lo que estamos haciendo aquí.

Cuando se aborde, el orden razonable es: primero el `console.warn` de suscripción duplicada
(no cambia comportamiento y saca a la luz quién está en la situación de arriba), después el par
simétrico en el controller con opt-out, y por último la limpieza del `Map` en `core`.

## Trazabilidad

- **Detectado en:** exploración de la API pub/sub (agosto de 2026), no en la auditoría de tests.
  Sin PR asociado.
- **Riesgo de conflicto al sincronizar:** bajo hoy, porque no hemos tocado ninguno de los tres
  ficheros. Alto en cuanto lo arreglemos: `ElementController.js` es pequeño y upstream lo
  toca con cada release de `element-controller`.
- **Depende de:** nada. Lo de la de-duplicación por canal (`Subscriptor.hasSubscription()`) es
  independiente y se puede documentar aparte si algún día muerde por su cuenta.
- **Relacionado:** [defecto 16](./16-outbound-only-subscribes-undefined.md), que también sale de
  `_inOut()` y también registra una suscripción que nadie pidió.
