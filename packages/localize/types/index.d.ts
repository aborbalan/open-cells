type Constructor<T = {}> = new (...args: any[]) => T;

/** Translates `key` using loaded resources and the current lang. Returns null if not found. */
export declare function t(key: string, params?: Record<string, any>): string | null;

/** Fetches locales from the configured `localesHost`/`url`. */
export declare function requestResources(): Promise<Record<string, any>> | Record<string, any>;

/** Adds a Lit controller that re-renders the component on locale/status changes. */
export declare function updateWhenLocaleResourcesChange(
  component: any,
  options?: { intlConfig?: object; configProperty?: string },
): any;

/** Read-only view over the global intl state. */
export declare const intlState: {
  readonly lang: string;
  readonly resourcesLoadComplete: boolean;
  getResources(): Record<string, any>;
};

export declare function setLang(lang: string): void;
export declare function setUrl(url: string): void;
export declare function setLocalesHost(localesHost: string): void;
export declare function setFormats(formats: Record<string, any>): void;
export declare function setUseBundles(useBundles: boolean): void;
export declare function setWarnOnMissingKeys(warnOnMissingKeys: boolean): void;
export declare function resetIntl(): void;

export declare class LocalizeMixinInterface {
  /** Translates `key` using the component's locale context. */
  t(key: string, params?: Record<string, any>): string | null;
}

export declare function LocalizeMixin<T extends Constructor<HTMLElement>>(
  base: T,
): T & Constructor<LocalizeMixinInterface>;
