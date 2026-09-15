import { Injectable, inject } from '@angular/core';
import { runtimeConfig } from './runtime-config';
import { DomainsService } from './domains.service';

/**
 * Builds the links a customer actually sends to a client.
 *
 * The whole point of buying a custom domain is that the link you hand a
 * prospect doesn't say ez-snippets.com. So every "view"/"share" affordance has
 * to route through here — a domain that is configured but never used in a link
 * is a feature the customer paid for and never sees.
 *
 * Falls back to the canonical view host whenever there is no active domain,
 * which is every Starter org and any Pro org still waiting on DNS.
 */
@Injectable({ providedIn: 'root' })
export class ShareLinkService {
  private domainsService = inject(DomainsService);

  /** Hostname of the org's first active custom domain, if any. */
  private activeHost: string | null = null;

  constructor() {
    this.refresh();
  }

  /**
   * Re-read the org's domains. Called on construction and worth calling again
   * after the account page changes them, so links update without a reload.
   */
  refresh(): void {
    this.domainsService.getDomains().subscribe({
      next: (domains) => {
        const live = domains.find((d) => d.status === 'active');
        this.activeHost = live ? live.hostname : null;
      },
      // A Starter org gets a 403 here; that is a normal "no custom domain",
      // not an error worth surfacing.
      error: () => (this.activeHost = null),
    });
  }

  /** The base every share link is built on. */
  get base(): string {
    return this.activeHost
      ? `https://${this.activeHost}`
      : runtimeConfig.viewUrl;
  }

  get hasCustomDomain(): boolean {
    return this.activeHost !== null;
  }

  /**
   * A page's public link. Uses the slug only when there is a custom domain to
   * serve it from — ez-view deliberately does not resolve slugs on the
   * canonical host, so a slug link there would 404.
   */
  pageUrl(pageId: string, slug?: string | null): string {
    if (this.activeHost && slug) {
      return `https://${this.activeHost}/${slug}`;
    }
    return `${this.base}/view/page/${pageId}`;
  }

  layoutUrl(layoutId: string, slug?: string | null): string {
    if (this.activeHost && slug) {
      return `https://${this.activeHost}/${slug}`;
    }
    return `${this.base}/view/layout/${layoutId}`;
  }
}
