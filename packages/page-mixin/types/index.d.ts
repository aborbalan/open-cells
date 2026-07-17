import { CoreAPI } from '@open-cells/core-plugin/types';

type Constructor<T = {}> = new (...args: any[]) => T;

export declare class PageMixinInterface {
  /** Route params published on the page's private channel. */
  params: Record<string, any>;
  /** Invoked when the page becomes active (if the component defines it). */
  onPageEnter?(): void;
  /** Invoked when the page becomes inactive (if the component defines it). */
  onPageLeave?(): void;
}

export declare function PageMixin<T extends Constructor<HTMLElement>>(
  base: T,
): T & Constructor<PageMixinInterface & CoreAPI>;
