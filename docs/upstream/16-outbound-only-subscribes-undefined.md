# Defecto 16 — Un `outbounds` sin `inbounds` suscribe al canal `undefined`

> ⛔ **Documento interno.** No se envía nada a `BBVA/open-cells` — ni issues, ni PRs, ni
> comentarios. Esta ficha existe para nosotros.

**Severidad:** baja · **Área:** `@open-cells/element-controller` · **En nuestro fork:**
**sin arreglar** (documentado)

**En una línea:** una propiedad declarada sólo en `static outbounds` registra además una
suscripción a un canal cuyo nombre es `undefined`, que el core crea y comparte entre todos los
componentes que estén en esa situación.

---

## Detalle

### What happens

`_mergeBounds()` merges `inbounds` and `outbounds` into a single record per property. A key that
appears only in `outbounds` gets an `output` and no `input`, in
[`packages/element-controller/src/ElementController.js`](https://github.com/BBVA/open-cells/blob/main/packages/element-controller/src/ElementController.js):

```js
_mergeBounds(inbounds = {}, outbounds = {}) {         // L45-57
  const inout = [];
  Object.keys(inbounds).forEach(key => {
    const { channel: input, skipUpdate, action } = inbounds[key];
    inout[key] = { input, skipUpdate, action };
  });
  Object.keys(outbounds).forEach(key => {
    const { channel: output } = outbounds[key];
    let previous = inout[key] || {};
    inout[key] = { ...previous, output };            // no `input` for outbound-only keys
  });
  return inout;
}
```

`_inOut()` then pushes a subscription unconditionally, whatever `inChannelName` happens to be:

```js
_inOut(propertyName, outChannelName, inChannelName, skipUpdate = false, action) {
  // ...
  this.subscriptions.push({ channel: inChannelName, action: internalSubscriberAction }); // L86
}
```

For an outbound-only key, `inChannelName` is `undefined`. `hostConnected()` then calls
`this.subscribe(undefined, action)`, and `ChannelManager.get()` creates whatever it is asked for:

```js
get(name) {                    // packages/core/src/manager/channel-manager.js L43-50
  var channel = this.channels[name];
  if (!channel) {
    channel = this.create(name);
  }
  return channel;
}
```

`this.channels[undefined]` becomes the string key `'undefined'`, so a real `Channel` object is
created under that name and the component is subscribed to it.

### Why it matters

Not much today, and that is worth saying plainly: nothing publishes to `undefined`, so no value
ever arrives and no behaviour is wrong.

What it costs is real but small:

- A channel named `undefined` sits in the channel collection for the lifetime of the app, and
  shows up in anything that enumerates channels — including our own
  `open_cells_list_channels` MCP tool.
- Every outbound-only component subscribes to that **same shared** channel. If anything ever
  publishes to it (a `publish(someUndefinedVariable, …)` in application code is enough), all of
  them get the value written into their bound property at once, with no obvious cause.
- It is one more `Subscriptor`/`Map` entry per component, which compounds
  [defecto 15](./15-manual-subscriptions-never-cleaned.md).

### Reproduction

```js
class OutboundOnlyHost extends TestHost {
  static outbounds = { picked: { channel: 'picks' } };
}

const controller = new ElementController(host);
controller.subscriptions.map(s => s.channel); // [undefined]
controller.hostConnected();

Object.keys(bridge.ComponentConnector.getChannels());
// [..., '__oc_evt_log-event', 'undefined']
```

Comprobado ejecutándolo (vitest browser, chromium) contra `840f8cc`.

### Suggested fix

Only register a subscription when there is a channel to subscribe to:

```js
if (inChannelName) {
  this.subscriptions.push({ channel: inChannelName, action: internalSubscriberAction });
}
```

The setter/getter installation below it already branches on `outChannelName`, so this makes the
two halves symmetric. Defensively, `ChannelManager.get()` refusing a nullish name would stop the
whole class of typos, but that is a wider change and belongs on its own.

---

## Trazabilidad

- **Detectado en:** exploración de la API pub/sub (agosto de 2026), no en la auditoría de tests.
  Sin PR asociado.
- **Riesgo de conflicto al sincronizar:** bajo. Son tres líneas en un fichero que ya está en la
  lista de riesgo por el defecto 15; si se arreglan, que sea en el mismo cambio.
- **Depende de:** nada, pero comparte fichero y función (`_inOut()`) con el
  [defecto 15](./15-manual-subscriptions-never-cleaned.md).
