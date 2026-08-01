# Issue 1 — `Channel.unsubscribe()` deja el canal muerto

**Estado:** redactada, sin abrir · **Severidad:** crítica · **Área:** `@open-cells/core`

**Título:**

    Channel.unsubscribe() writes `stoped` instead of `isStopped`, so a reset channel never emits again

**Labels:** `bug`

---

## Cuerpo

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

### A working fix and a regression test

We hit this in a fork and fixed it there, in case it saves time — the change and its tests are
public:

- the fix:
  [`packages/core/src/state/channel.js#L92-L106`](https://github.com/aborbalan/open-cells/blob/7ac7432b82968b906a0d871348dcc4b8a846c6e3/packages/core/src/state/channel.js#L92-L106)
- the test that pins the invariant:
  [`channel.test.js#L128-L138`](https://github.com/aborbalan/open-cells/blob/7ac7432b82968b906a0d871348dcc4b8a846c6e3/packages/core/test/state/channel.test.js#L128-L138)
  — _"should leave the channel usable, which is the point of overriding it"_

The test is worth having whatever the fix looks like: the previous suite had a case for
`unsubscribe()` that stubbed the method and asserted the stub was called, so it passed without
ever exercising the behaviour.

---

## Notas internas (no van al issue)

- **Detectado en:** §2 de la auditoría · nuestro PR #9 · commit `1ea912e`.
- **En nuestro fork:** arreglado.
- **Riesgo de conflicto:** alto si upstream lo arregla distinto — mismo fichero,
  `packages/core/src/state/channel.js`.
- **Depende de:** nada. Es autocontenida.
