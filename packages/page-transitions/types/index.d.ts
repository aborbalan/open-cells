import type { CSSResult } from 'lit';

type Constructor<T = {}> = new (...args: any[]) => T;

export type PageTransitionState = 'active' | 'inactive' | 'cached';

export interface PageTransitionOptions {
  disabled?: boolean;
  type?: string;
  animations?: Record<string, Record<string, string>>;
}

export declare class PageTransitionsMixinInterface {
  /** Current state of the page: active, inactive, cached. */
  state: PageTransitionState;
  /** Transition to use for this page (fade, static, verticalUp...). */
  pageTransitionType: string;
  /** If true, the page won't animate when its state is set to active. */
  pageTransitionDisabled: boolean;
}

export declare function PageTransitionsMixin<T extends Constructor<HTMLElement>>(
  base: T,
): T & Constructor<PageTransitionsMixinInterface>;

export declare const defaultPageTransitions: Record<string, Record<string, string>>;

export declare const pageTransitionStyles: CSSResult;

export declare function transitionPage(page: HTMLElement, options?: PageTransitionOptions): void;
