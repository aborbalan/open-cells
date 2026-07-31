// The presentation packages: transitions and i18n.
import {
  PageTransitionsMixin,
  defaultPageTransitions,
  pageTransitionStyles,
  transitionPage,
} from '@open-cells/page-transitions';
import type { PageTransitionOptions, PageTransitionState } from '@open-cells/page-transitions';
import {
  LocalizeMixin,
  intlState,
  requestResources,
  resetIntl,
  setFormats,
  setLang,
  setLocalesHost,
  setUrl,
  setUseBundles,
  setWarnOnMissingKeys,
  t,
  updateWhenLocaleResourcesChange,
} from '@open-cells/localize';

class Transitioned extends PageTransitionsMixin(HTMLElement) {
  activate() {
    const state: PageTransitionState = 'active';
    this.state = state;
    this.pageTransitionType = 'fade';
    this.pageTransitionDisabled = false;
  }
}

const options: PageTransitionOptions = { disabled: false, type: 'fade' };
transitionPage(new Transitioned(), options);
void defaultPageTransitions.fade;
void pageTransitionStyles.cssText;

class Translated extends LocalizeMixin(HTMLElement) {
  label(): string | null {
    return this.t('recipe.title', { count: 2 });
  }
}
void Translated;

setLang('es-ES');
setUrl('/locales');
setLocalesHost('https://example.test');
setFormats({ currency: 'EUR' });
setUseBundles(true);
setWarnOnMissingKeys(false);
void requestResources();
void intlState.lang;
void intlState.resourcesLoadComplete;
void intlState.getResources();
void t('recipe.title');
updateWhenLocaleResourcesChange(new Translated());
resetIntl();
