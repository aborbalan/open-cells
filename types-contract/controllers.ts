// The controllers and mixins, used the way a component uses them.
import { ElementController } from '@open-cells/element-controller';
import { PageController } from '@open-cells/page-controller';
import { PageMixin } from '@open-cells/page-mixin';
import { plugCellsCore } from '@open-cells/core-plugin';

class Host extends HTMLElement {}

const element = new ElementController(new Host());
element.subscribe('oc-user', (value: unknown) => void value);
element.unsubscribe('oc-user');
element.unsubscribe(['oc-user', 'oc-theme']);
element.publish('oc-user', { name: 'Ada' });
element.publishOn('oc-clicked', document.createElement('button'), 'click');
element.navigate('recipe', { recipeId: 52771 });
element.updateInterceptorContext({ loggedIn: true });
element.setInterceptorContext({ loggedIn: true });
element.resetInterceptorContext();
void element.getInterceptorContext();
void element.getCurrentRoute().name;
element.updateSubroute('detail');
element.backStep();

// A page controller is an element controller with the page lifecycle on top.
const page = new PageController(new Host());
page.navigate('home');

// The same capabilities as a class mixin.
class MixedPage extends PageMixin(HTMLElement) {
  onPageEnter() {
    this.navigate('home');
  }
}
void MixedPage;

// The low level glue: it copies the bridge API onto an object.
const plugged = plugCellsCore(new Host());
plugged.navigate('home');
