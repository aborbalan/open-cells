# Defecto 15 — `lib.entry` de `core` apunta a un fichero que no existe

> **Issues sí, código no** (desde el 2026-08-03). Esta ficha se puede reportar a
> `BBVA/open-cells` como issue; lo que no se les manda es código — ni PR, ni parche, ni diff para
> pegar.

**Severidad:** baja · **Área:** `@open-cells/core` · **En nuestro fork:** sin arreglar

**En una línea:** `build.lib.entry` resuelve `src/index.ts`, que no existe en el paquete; el build
no falla porque quien manda de verdad es `rollupOptions.input`, que sí apunta al `.js` real.

---

## Detalle

### Qué pasa

`packages/core/vite.config.ts` declara la entrada de la librería dos veces, y sólo una de las dos
apunta a un fichero que existe:

```ts
build: {
  rollupOptions: {
    input: 'src/index.js',                        // existe
  },
  lib: {
    entry: resolve(__dirname, 'src/index.ts'),    // NO existe
    formats: ['es', 'cjs', 'umd', 'iife'],
    name: camelCase(packageName, { pascalCase: true }),
    fileName: packageName,
  },
},
```

En `packages/core/src/` sólo hay `index.js`. No hay ningún `index.ts` ni ningún paso que lo genere.

El build no se rompe porque `rollupOptions.input` tiene preferencia sobre `lib.entry`, así que
Rollup entra por el `.js` correcto y produce sus cuatro bundles. La línea de `lib.entry` no llega a
usarse nunca.

### Por qué importa

Es configuración muerta que aparenta mandar. Quien lea ese fichero para saber por dónde entra la
librería leerá `src/index.ts` y buscará un fichero que no está, o concluirá que el paquete es
TypeScript cuando su fuente es JavaScript.

Y es frágil de una forma silenciosa: el día que alguien quite o cambie `rollupOptions.input` —algo
razonable, porque `lib` ya parece describir la entrada— el build pasa a resolver una ruta
inexistente. El fallo no aparecerá en el commit que lo causa, sino en el que toque la otra línea.

### Cómo reproducirlo

```sh
ls packages/core/src/index.*        # sólo index.js
grep -n "entry\|input" packages/core/vite.config.ts
```

O más directo: quitar `rollupOptions` del config y lanzar el build. Vite falla al no encontrar
`src/index.ts`.

### Arreglo propuesto

Cualquiera de los dos, según qué se quiera conservar:

- apuntar `lib.entry` al fichero real, `resolve(__dirname, 'src/index.js')`; o
- quitar `lib.entry` si `rollupOptions.input` ya cubre la entrada.

En los dos casos el build debería producir exactamente lo mismo que ahora.

### Nuestro arreglo y su test

**Sin arreglar aquí.** Está en nuestro backlog como 1A, dentro del grupo que decide qué publica
`core` — y esa decisión mayor (1D: qué se hace con el build, que hoy genera cuatro bundles que no
se publican) está por delante. Arreglar la línea suelta antes de decidir eso sería tocar dos veces
el mismo fichero.

---

## Trazabilidad

- **Detectado en:** el backlog de agosto de 2026, ficha 1A. No salió de la auditoría de tests, así
  que no está entre los 14 primeros de este registro.
- **Verificado contra upstream:** `b01c489`, 2026-08-03. Las líneas 11–21 de su
  `vite.config.ts` son **idénticas** a las nuestras, y su `packages/core/src/` también tiene sólo
  `index.js`.
- **Riesgo de conflicto al sincronizar:** bajo mientras no lo toquemos. Alto si ellos lo arreglan
  distinto **y** nosotros ya hemos aplicado 1D, porque los dos cambios caen en el mismo bloque.
- **Depende de:** nada para reportarlo. Nuestra 1A depende de 1D para arreglarlo aquí.
