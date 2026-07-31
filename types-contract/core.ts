// The public contract of @open-cells/core, used the way an application uses it.
import {
  $bridge,
  Bridge,
  backStep,
  getConfig,
  getCurrentRoute,
  getInterceptorContext,
  navigate,
  publish,
  publishOn,
  resetInterceptorContext,
  setInterceptorContext,
  startApp,
  subscribe,
  unsubscribe,
  updateInterceptorContext,
  updateSubroute,
} from '@open-cells/core';
import type { CellsConfig, QueryParams, RouteData, RouteDefinition } from '@open-cells/core';

const routes: RouteDefinition[] = [
  { name: 'home', path: '/', component: 'home-page', action: async () => {} },
  { name: 'recipe', path: '/recipe/:recipeId', component: 'recipe-page', action: async () => {} },
  {
    name: 'not-found',
    path: '/not-found',
    component: 'not-found-page',
    notFound: true,
    action: async () => {},
  },
];

const config: CellsConfig = {
  routes,
  mainNode: 'app-content',
};

// `startApp` is the entry point every application calls.
const bridge = startApp(config);
if (bridge) {
  bridge.navigate('home');
}

// `Bridge` is exported as a value from src/index.js, so it has to be constructible here.
const constructed = new Bridge();
constructed.navigate('home');

// The module-level bridge, and the rest of the imperative API.
$bridge?.navigate('home');
getConfig();

const params: QueryParams = { recipeId: 52771 };
navigate('recipe', params);

subscribe('oc-user', document.createElement('div'), (value: unknown) => void value);
unsubscribe('oc-user', document.createElement('div'));
unsubscribe(['oc-user', 'oc-theme'], document.createElement('div'));

publish('oc-user', { name: 'Ada' });
publish('oc-user', { name: 'Ada' }, { sessionStorage: true });
publishOn('oc-clicked', document.createElement('button'), 'click');

updateInterceptorContext({ loggedIn: true });
setInterceptorContext({ loggedIn: true });
resetInterceptorContext();
const context: object = getInterceptorContext();
void context;

const current: RouteData = getCurrentRoute();
void current.name;

updateSubroute('detail');
backStep();
