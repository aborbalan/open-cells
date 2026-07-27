/*
 * Copyright 2024 Bilbao Vizcaya Argentaria, S.A.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** A single documented symbol of the public API. */
export interface ApiEntry {
  name: string;
  kind: 'function' | 'class' | 'mixin' | 'type' | 'property' | 'hook';
  signature: string;
  summary: string;
  example?: string;
}

/** Public API of one Open Cells package. */
export interface ApiModule {
  id: string;
  package: string;
  summary: string;
  entries: ApiEntry[];
}

/** A task oriented guide about an Open Cells concept. */
export interface Guide {
  id: string;
  title: string;
  summary: string;
  content: string;
}

export const API_MODULES: ApiModule[] = [
  {
    id: 'core',
    package: '@open-cells/core',
    summary:
      'Bootstrapping, routing, navigation and the pub/sub state bridge. Imported by the application shell; components normally reach the same API through a controller or mixin.',
    entries: [
      {
        name: 'startApp',
        kind: 'function',
        signature: 'startApp(config: CellsConfig): BridgeAPI | null',
        summary:
          'Boots the application. Called once from the shell component module, before the element is defined. Creates the bridge, registers the routes and renders into `mainNode`.',
        example: `import { startApp } from '@open-cells/core';
import { routes } from '../router/routes.js';

startApp({
  routes,
  mainNode: 'app-content',
  persistentPages: ['home'],
  viewLimit: 5,
});`,
      },
      {
        name: 'CellsConfig',
        kind: 'type',
        signature: `{
  mainNode: string;
  routes?: RouteDefinition[];
  appConfig?: Record<string, any>;
  interceptor?: InterceptorFunction;
  persistentPages?: string[];
  commonPages?: string[];
  viewLimit?: number;
  initialTemplate?: string;
  skipNavigations?: Navigation[];
  eventSubscriptions?: EventSubscription[];
  postMessageTargetOrigin?: string;
}`,
        summary:
          'Configuration accepted by `startApp`. `mainNode` is the id of the element pages are rendered into; `persistentPages` and `commonPages` take route *names*; `viewLimit` caps how many page nodes stay in the DOM.',
      },
      {
        name: 'RouteDefinition',
        kind: 'type',
        signature: `{
  name: string;
  path: string | string[];
  component: string;
  action: Function;
  notFound?: boolean;
}`,
        summary:
          'One route. `name` is what `navigate()` receives, `path` supports `:param` segments and a trailing `*` wildcard, `component` is the custom element tag, and `action` lazily imports the page module. Exactly one route should set `notFound: true`.',
        example: `import { RouteDefinition } from '@open-cells/core/types';

export const routes: RouteDefinition[] = [
  {
    path: '/recipe/:recipeId',
    name: 'recipe',
    component: 'recipe-page',
    action: async () => {
      await import('../pages/recipe/recipe-page.js');
    },
  },
];`,
      },
      {
        name: 'navigate',
        kind: 'function',
        signature: 'navigate(page: string, params?: QueryParams): void',
        summary:
          'Navigates to a route **by name**, not by path. Params fill the `:param` placeholders; anything left over is appended as a query string.',
        example: `navigate('recipe', { recipeId: 52771 });`,
      },
      {
        name: 'publish',
        kind: 'function',
        signature:
          'publish(channelName: string, value: unknown, options?: { sessionStorage?: boolean }): void',
        summary:
          'Publishes a value on a channel. Channels are RxJS-backed and replay their last value, so subscribers that connect later still receive it. `sessionStorage: true` persists the value across reloads.',
      },
      {
        name: 'subscribe',
        kind: 'function',
        signature:
          'subscribe(channelName: string, node: object, callback: (value: any) => void): void',
        summary:
          'Subscribes a node to a channel. Inside components prefer `static inbounds` or the controller `subscribe`, which unsubscribe automatically on disconnect.',
      },
      {
        name: 'unsubscribe',
        kind: 'function',
        signature: 'unsubscribe(channels: string | string[], node: object): void',
        summary: 'Cancels one or several subscriptions of a node.',
      },
      {
        name: 'publishOn',
        kind: 'function',
        signature:
          'publishOn(channelName: string, htmlElement: HTMLElement, eventName: string): void',
        summary:
          'Republishes a DOM event of an element onto a channel, without writing a listener by hand.',
      },
      {
        name: 'getCurrentRoute',
        kind: 'function',
        signature: 'getCurrentRoute(): RouteData',
        summary: 'Returns the active route: name, params, query and subroute.',
      },
      {
        name: 'updateSubroute',
        kind: 'function',
        signature: 'updateSubroute(subroute: string): void',
        summary:
          'Updates the trailing part of a wildcard route without leaving the page, so internal state can live in the URL.',
      },
      {
        name: 'backStep',
        kind: 'function',
        signature: 'backStep(): void',
        summary: 'Goes back one entry in the Open Cells navigation stack.',
      },
      {
        name: 'getConfig',
        kind: 'function',
        signature: 'getConfig(): CellsConfig',
        summary: 'Returns the configuration `startApp` was called with, including `appConfig`.',
      },
      {
        name: 'setInterceptorContext',
        kind: 'function',
        signature:
          'setInterceptorContext(ctx: object): void | updateInterceptorContext(ctx) | getInterceptorContext() | resetInterceptorContext()',
        summary:
          'Manage the context object handed to the navigation interceptor — the usual place for auth flags that decide whether a navigation is allowed.',
      },
      {
        name: 'InterceptorFunction',
        kind: 'type',
        signature:
          '(navigation: NavigationWithParams, ctx: object) => { intercept: boolean; redirect: string }',
        summary:
          'Runs before each navigation. Return `intercept: true` to block it and `redirect` with the route name to send the user elsewhere.',
        example: `startApp({
  routes,
  mainNode: 'app-content',
  interceptor: (navigation, ctx) => {
    if (navigation.to === 'profile' && !ctx.logged) {
      return { intercept: true, redirect: 'login' };
    }
    return { intercept: false, redirect: '' };
  },
});`,
      },
      {
        name: '$bridge',
        kind: 'property',
        signature: '$bridge: BridgeAPI | null',
        summary:
          'The bridge instance, or `null` until `startApp` runs. Commands issued before boot are queued and replayed.',
      },
    ],
  },
  {
    id: 'element-controller',
    package: '@open-cells/element-controller',
    summary:
      'Lit reactive controller that plugs a component into the core: channel bindings plus the imperative bridge API.',
    entries: [
      {
        name: 'ElementController',
        kind: 'class',
        signature: 'new ElementController(host: ReactiveControllerHost & HTMLElement)',
        summary:
          'Instantiate it as a class field. It reads `static inbounds` / `static outbounds`, subscribes on `hostConnected` and unsubscribes on `hostDisconnected`, and exposes `publish`, `subscribe`, `unsubscribe`, `publishOn`, `navigate`, `getCurrentRoute`, `updateSubroute` and the interceptor context helpers.',
        example: `import { ElementController } from '@open-cells/element-controller';

@customElement('app-index')
export class AppIndex extends LitElement {
  elementController = new ElementController(this);
}`,
      },
      {
        name: 'static inbounds',
        kind: 'property',
        signature:
          'static inbounds = { propertyName: { channel: string; skipUpdate?: boolean; action?: (value: any) => any } }',
        summary:
          'Declarative subscription: the property becomes a read-only getter fed by the channel, and the host re-renders on every value unless `skipUpdate` is set. `action` transforms the value before storing it.',
        example: `static inbounds = {
  _categoriesList: { channel: 'categories' },
  _likedRecipes: { channel: 'liked-recipes' },
};`,
      },
      {
        name: 'static outbounds',
        kind: 'property',
        signature: 'static outbounds = { propertyName: { channel: string } }',
        summary:
          'Declarative publication: assigning to the property publishes the value on the channel. Declaring the same property in both `inbounds` and `outbounds` makes it a two-way binding.',
      },
    ],
  },
  {
    id: 'page-controller',
    package: '@open-cells/page-controller',
    summary:
      'Extends `ElementController` with the page lifecycle. This is what a routed page uses.',
    entries: [
      {
        name: 'PageController',
        kind: 'class',
        signature: 'new PageController(host)',
        summary:
          'Everything `ElementController` offers, plus a `params` property fed from the route and a subscription to the private page channel that drives `onPageEnter` / `onPageLeave`.',
        example: `import { PageController } from '@open-cells/page-controller';

@customElement('recipe-page')
export class RecipePage extends LitElement {
  pageController = new PageController(this);
}`,
      },
      {
        name: 'onPageEnter',
        kind: 'hook',
        signature: 'onPageEnter(): void',
        summary:
          'Called every time the page becomes active — including when it is revisited and the node was kept in the DOM, where `firstUpdated` no longer runs. Refresh per-visit data here.',
      },
      {
        name: 'onPageLeave',
        kind: 'hook',
        signature: 'onPageLeave(): void',
        summary: 'Called when the page stops being the active one. Good place to pause work.',
      },
      {
        name: 'params',
        kind: 'property',
        signature: 'params: Record<string, string>',
        summary:
          'Route parameters. Declare `@property({ type: Object }) params` on the page and react in `willUpdate`, since the same node is reused across navigations with different params.',
        example: `willUpdate(props) {
  if (props.has('params')) {
    this.load(this.params.recipeId);
  }
}`,
      },
    ],
  },
  {
    id: 'page-mixin',
    package: '@open-cells/page-mixin',
    summary:
      'Same page capabilities as `PageController`, delivered as a class mixin for components that are not Lit reactive controller hosts.',
    entries: [
      {
        name: 'PageMixin',
        kind: 'mixin',
        signature: 'class MyPage extends PageMixin(HTMLElement) {}',
        summary:
          'Plugs the core API onto the element itself (`this.publish`, `this.navigate`, …), declares `params` and wires `onPageEnter` / `onPageLeave`. Deduped with `@open-wc/dedupe-mixin`, so applying it twice is safe.',
      },
    ],
  },
  {
    id: 'page-transitions',
    package: '@open-cells/page-transitions',
    summary: 'CSS-driven animations between pages, based on the `[data-cells-page]` attribute.',
    entries: [
      {
        name: 'PageTransitionsMixin',
        kind: 'mixin',
        signature: 'class MyPage extends PageTransitionsMixin(LitElement) {}',
        summary:
          'Marks the element with `[data-cells-page]` and, when it becomes active, adds `page-animation` and `page-animation-direction` to the entering and leaving pages, removing them on `animationend`.',
        example: `export class CategoryPage extends PageTransitionsMixin(LitElement) {
  pageController = new PageController(this);
}`,
      },
      {
        name: 'transitionPage',
        kind: 'function',
        signature: 'transitionPage(page: HTMLElement, options?: object): void',
        summary: 'Triggers a transition manually, without the mixin.',
      },
      {
        name: 'pageTransitionStyles',
        kind: 'property',
        signature: 'pageTransitionStyles: CSSResult',
        summary:
          'Base styles for the animated pages. `defaultPageTransitions` holds the default animation set.',
      },
    ],
  },
  {
    id: 'localize',
    package: '@open-cells/localize',
    summary: 'Internationalisation and formatting on top of `intl-messageformat`.',
    entries: [
      {
        name: 't',
        kind: 'function',
        signature: 't(key: string, values?: object): string',
        summary: 'Translates a key with the active locale resources.',
      },
      {
        name: 'LocalizeMixin',
        kind: 'mixin',
        signature: 'class MyElement extends LocalizeMixin(LitElement) {}',
        summary: 'Re-renders the component whenever the language or the loaded resources change.',
      },
      {
        name: 'setLang',
        kind: 'function',
        signature: 'setLang(lang: string): void',
        summary:
          'Sets the active language. `setUrl`, `setLocalesHost`, `setFormats`, `setUseBundles`, `setWarnOnMissingKeys` and `resetIntl` configure where resources come from and how they are formatted.',
      },
      {
        name: 'requestResources',
        kind: 'function',
        signature: 'requestResources(): Promise<void>',
        summary:
          'Loads the resource bundles for the active language. `updateWhenLocaleResourcesChange` subscribes a host to those updates, and `intlState` exposes the current state.',
      },
    ],
  },
  {
    id: 'core-plugin',
    package: '@open-cells/core-plugin',
    summary:
      'Low level glue that copies the bridge API onto an object. Used by the controllers and mixins; applications rarely import it directly.',
    entries: [
      {
        name: 'plugCellsCore',
        kind: 'function',
        signature: 'plugCellsCore<T>(element: T): T',
        summary:
          'Adds `publish`, `subscribe`, `unsubscribe`, `publishOn`, `navigate`, `getCurrentRoute`, `updateSubroute` and the interceptor context helpers to the object. Calls made before the bridge exists are queued.',
      },
    ],
  },
  {
    id: 'create-app',
    package: '@open-cells/create-app',
    summary: 'Scaffolder for new Open Cells applications.',
    entries: [
      {
        name: 'create-app',
        kind: 'function',
        signature: 'npx @open-cells/create-app',
        summary:
          'Interactively asks for an application type (`blankWebapp` or `exampleWebapp`, both Lit + TypeScript) and a name, then writes the project into `<cwd>/<name>`. The same answers can be passed as flags: `--type blankWebapp --name my-app`.',
      },
    ],
  },
];

export const GUIDES: Guide[] = [
  {
    id: 'project-structure',
    title: 'Anatomy of an Open Cells application',
    summary: 'Where routes, pages, components and configuration live.',
    content: `Open Cells does not force a folder layout, but the generated apps use:

\`\`\`
src/
├── components/
│   └── app-index.ts        # shell: calls startApp() and renders the main node
├── config/
│   └── app.config.js       # data handed to startApp as appConfig
├── pages/
│   └── <page>/<page>-page.ts
└── router/
    └── routes.ts           # export const routes: RouteDefinition[]
index.html                  # contains <app-index> and the main node
\`\`\`

Two things are mandatory: a route configuration and the web components that implement the pages.

The shell calls \`startApp\` at module scope, *before* the element is defined, so the bridge exists
by the time the first page renders:

\`\`\`ts
import { startApp } from '@open-cells/core';
import { routes } from '../router/routes.js';

startApp({ routes, mainNode: 'app-content' });

@customElement('app-index')
export class AppIndex extends LitElement {
  elementController = new ElementController(this);

  render() {
    return html\`<main role="main" tabindex="-1"><slot></slot></main>\`;
  }
}
\`\`\``,
  },
  {
    id: 'routing',
    title: 'Routing and navigation',
    summary: 'Route definitions, params, wildcards, the 404 route and navigating by name.',
    content: `Routes are plain objects in an array typed as \`RouteDefinition[]\`:

\`\`\`ts
{
  path: '/category/:category',   // ':param' segments; a trailing '*' makes it wildcarded
  name: 'category',              // what navigate() takes
  component: 'category-page',    // custom element tag
  action: async () => {          // lazy import of the page module
    await import('../pages/category/category-page.js');
  },
}
\`\`\`

Key points:

- **Navigation is by name, never by path**: \`navigate('category', { category: 'Seafood' })\`.
  Parameters that do not match a \`:param\` become query string entries.
- **Routes are keyed by name**, so two routes sharing a name silently overwrite each other.
- **The 404 route is the one with \`notFound: true\`**. Without it, unknown paths resolve to nothing.
  Note that \`notFound: false\` on a route called \`not-found\` leaves the app without a 404 page.
- **Params reach the page as the \`params\` property**, and the page node is reused across
  navigations, so react in \`willUpdate\` rather than only in \`firstUpdated\`.
- \`updateSubroute()\` rewrites the tail of a wildcard route without a page change, and
  \`getCurrentRoute()\` returns name, params, query and subroute.`,
  },
  {
    id: 'state-channels',
    title: 'State: channels and bindings',
    summary: 'Pub/sub with RxJS, declarative bindings and value replay.',
    content: `State is a publish/subscribe bus of RxJS-backed channels. Channels replay their last
value, so a component that subscribes after the publication still receives it — this is what makes
the declarative bindings work regardless of page order.

Declarative (preferred inside components):

\`\`\`ts
export class CategoryPage extends LitElement {
  pageController = new PageController(this);

  static inbounds = {
    _categoriesList: { channel: 'categories' },
    _likedRecipes: { channel: 'liked-recipes', skipUpdate: true },
  };

  static outbounds = {
    _selected: { channel: 'selected-recipe' },
  };
}
\`\`\`

- \`inbounds\` turns the property into a read-only getter fed by the channel and requests an update
  on each value (\`skipUpdate: true\` opts out; \`action\` transforms the value first).
- \`outbounds\` makes assignment publish: \`this._selected = recipe\`.
- Declaring the same property in both directions gives a two-way binding.
- Subscriptions are created on \`hostConnected\` and dropped on \`hostDisconnected\`; there is nothing
  to clean up by hand.

Imperative, through the controller:

\`\`\`ts
this.pageController.publish('categories', categories);
this.pageController.subscribe('categories', value => { … });
this.pageController.publish('user', user, { sessionStorage: true });
\`\`\`

Channels whose name starts with \`__oc_\` belong to the core — \`__oc_page_<tag>\` is how
\`PageController\` drives \`onPageEnter\` / \`onPageLeave\`.`,
  },
  {
    id: 'page-lifecycle',
    title: 'Page lifecycle',
    summary: 'When onPageEnter and onPageLeave run, and why firstUpdated is not enough.',
    content: `Open Cells keeps page nodes in the DOM (subject to \`viewLimit\` and
\`persistentPages\`) and swaps their \`state\` attribute instead of recreating them. So on a second
visit \`connectedCallback\` and \`firstUpdated\` do **not** run again.

\`PageController\` (or \`PageMixin\`) subscribes to a private channel per page and calls:

- \`onPageEnter()\` every time the page becomes active,
- \`onPageLeave()\` every time it stops being active.

Rule of thumb: one-off setup in \`firstUpdated\`, per-visit work in \`onPageEnter\`, and reactions to
route parameters in \`willUpdate\` (the \`params\` property changes on the reused node).`,
  },
  {
    id: 'app-config',
    title: 'Application configuration',
    summary: 'appConfig, persistentPages, viewLimit and the navigation interceptor.',
    content: `Everything is passed to \`startApp\`:

\`\`\`ts
startApp({
  routes,
  mainNode: 'app-content',
  appConfig,                       // any app data, read back with getConfig()
  persistentPages: ['home'],       // route names whose node is never discarded
  commonPages: ['header'],         // route names always present
  viewLimit: 5,                    // maximum page nodes kept in the DOM
  interceptor: (navigation, ctx) => ({ intercept: false, redirect: '' }),
});
\`\`\`

\`persistentPages\` and \`commonPages\` take **route names**, so a typo there silently disables the
behaviour. The interceptor runs before every navigation and receives a mutable context managed with
\`setInterceptorContext\` / \`updateInterceptorContext\` — the usual home for the session flag that
decides whether a navigation is allowed.`,
  },
];

/** Returns a module by id or package name. */
export function findModule(id: string): ApiModule | undefined {
  const needle = id.toLowerCase().replace('@open-cells/', '');
  return API_MODULES.find(module => module.id === needle || module.package === id);
}

/** All module ids, for enums and error messages. */
export const MODULE_IDS = API_MODULES.map(module => module.id);

/** All guide ids. */
export const GUIDE_IDS = GUIDES.map(guide => guide.id);
