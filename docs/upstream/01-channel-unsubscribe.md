# Defecto 1 — `Channel.unsubscribe()` deja el canal muerto

> **Issues sí, código no** (desde el 2026-08-03). Esta ficha se puede reportar a
> `BBVA/open-cells` como issue; lo que no se les manda es código — ni PR, ni parche, ni diff para
> pegar. Antes este aviso decía que no se les enviaba nada en ningún formato.

**Severidad:** crítica · **Área:** `@open-cells/core` · **En nuestro fork:** arreglado

**En una línea:** `Channel.unsubscribe()` escribe `stoped` en vez de `isStopped`, así que un
canal reseteado no vuelve a emitir nunca.

---

## Detalle

### What happens

`Channel.unsubscribe()` is documented as keeping the channel open — that is the whole reason it
overrides `Subject.unsubscribe()`. It does not. In
[`packages/core/src/state/channel.js`](https://github.com/BBVA/open-cells/blob/main/packages/core/src/state/channel.js):

```js
unsubscribe() {
  super.unsubscribe();
  this.closed = false;
  this.stoped = false;   // <-- RxJS reads `isStopped`
}
```

`Subject.prototype.unsubscribe()` sets `closed = true` **and** `isStopped = true`, and drops the
observer lists. Clearing only `closed` leaves the subject stopped, and a stopped Subject ignores
every `next()` from then on. `stoped` is just a new property nobody reads.

### Why it matters

Silent data loss with no error anywhere. Any channel that has been through
`resetBridgeChannels()` never emits again — and that is the path `Bridge.logout()` takes. After a
logout the application keeps publishing and no subscriber ever hears anything.

It is hard to spot from the application side because the channel looks alive: it is not closed,
and `publish()` does not throw.

### Reproduction

```js
import { createChannel } from '@open-cells/core/src/state/channel.js';

const channel = createChannel('demo');
const seen = [];

channel.subscribe(value => seen.push(value));
channel.next({ detail: 'before' });

channel.unsubscribe();

channel.subscribe(value => seen.push(value));
channel.next({ detail: 'after' });

console.log(seen.length); // 1 — 'after' was dropped
```

### Suggested fix

Reset the flags RxJS actually reads, and the observer lists it dropped:

```js
unsubscribe() {
  super.unsubscribe();
  this.closed = false;
  this.isStopped = false;
  this.observers = [];
  this.currentObservers = null;
}
```

`currentObservers` is private in RxJS's own declarations, so under `checkJs` it needs an explicit
cast.

### Nuestro arreglo y su test

- the fix:
  [`packages/core/src/state/channel.js#L92-L106`](https://github.com/aborbalan/open-cells/blob/7ac7432b82968b906a0d871348dcc4b8a846c6e3/packages/core/src/state/channel.js#L92-L106)
- the test that pins the invariant:
  [`channel.test.js#L128-L138`](https://github.com/aborbalan/open-cells/blob/7ac7432b82968b906a0d871348dcc4b8a846c6e3/packages/core/test/state/channel.test.js#L128-L138)
  — _"should leave the channel usable, which is the point of overriding it"_

El test importa tanto como el arreglo: la suite anterior tenía un caso para `unsubscribe()` que
stubbeaba el propio método y comprobaba que el stub se había llamado, así que pasaba en verde
sin ejercitar el comportamiento ni una vez.

---

## Trazabilidad

- **Detectado en:** §2 de la auditoría · nuestro PR #9 · commit `1ea912e`.
- **Riesgo de conflicto al sincronizar:** alto si upstream lo arregla distinto — tocaríamos el
  mismo fichero, `packages/core/src/state/channel.js`.
- **Depende de:** nada. Es autocontenido.
