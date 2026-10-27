import { init, track } from '@plausible-analytics/tracker';
import { runtimeConfig } from './runtime-config';

/**
 * Traffic analytics (Plausible) plus first-touch attribution.
 *
 * Plausible gives the aggregate view — visitors, sources, conversion rate per
 * source. It's bundled from npm rather than loaded as a third-party script, and
 * its events can be routed through our own domain (`plausibleEndpoint`), so
 * blockers miss far less of it. It still misses some, which is why the
 * first-touch record below is also saved onto the user at signup: that copy is
 * what ties a payment weeks later back to the newsletter that brought them in.
 */

let enabled = false;

/**
 * Only the marketing pages are tracked as page views. Everything behind login
 * (dashboard, page lists, editors) would just be noise in a traffic report and
 * eats into Plausible's pageview-based billing. Goals are the exception: they
 * always send, because Checkout Started and Purchase happen on logged-in pages.
 */
const TRACKED_PATHS = new Set(['/', '/home', '/pricing', '/signup']);
const GOALS = new Set<string>(['Signup', 'Checkout Started', 'Purchase']);

function isTrackedPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
    return TRACKED_PATHS.has(path);
  } catch {
    return false;
  }
}

/** Off unless config.json names a Plausible domain (prod only). Localhost is ignored by the tracker. */
export function initAnalytics(): void {
  if (!runtimeConfig.plausibleDomain) return;
  try {
    init({
      domain: runtimeConfig.plausibleDomain,
      endpoint: runtimeConfig.plausibleEndpoint || undefined,
      outboundLinks: true,
      logging: false,
      transformRequest: (payload) => {
        // Page views, engagement and outbound clicks: marketing pages only.
        if (!GOALS.has(payload.n) && !isTrackedPath(payload.u)) return null;
        // Invite links carry a secret token in the path; don't ship it to a third party.
        return { ...payload, u: payload.u.replace(/\/invite\/[^/?#]+/, '/invite/:token') };
      },
    });
    enabled = true;
  } catch (err) {
    console.warn('Analytics init failed', err);
  }
}

/** Goal names must match the goals set up in the Plausible dashboard. */
export type Goal = 'Signup' | 'Checkout Started' | 'Purchase';

export function trackGoal(goal: Goal, props?: Record<string, string>): void {
  if (!enabled) return;
  try {
    track(goal, props ? { props } : {});
  } catch {
    // Analytics must never break the app.
  }
}

// ---- Checkout -------------------------------------------------------------

const PENDING_CHECKOUT_KEY = 'ez_pending_checkout';

/** Called as the Paddle overlay opens; the success page completes the pair. */
export function markCheckoutStarted(transactionId: string): void {
  trackGoal('Checkout Started');
  try {
    sessionStorage.setItem(PENDING_CHECKOUT_KEY, transactionId);
  } catch {
    // ignore
  }
}

/**
 * Counts a Purchase once per checkout. Paddle redirects to /checkout/success in
 * the same tab, so the pending id is still in sessionStorage; a reload or a
 * bookmarked visit finds it gone and records nothing.
 */
export function trackPurchaseOnce(): void {
  try {
    if (!sessionStorage.getItem(PENDING_CHECKOUT_KEY)) return;
    sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    return;
  }
  trackGoal('Purchase');
}

// ---- First-touch attribution ----------------------------------------------

const ATTRIBUTION_KEY = 'ez_attribution';
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** `?ref=` — the short form Plausible also recognises. */
  ref?: string;
  /** External referrer only; our own pages are dropped. */
  referrer?: string;
  landingPath?: string;
  firstSeenAt?: string;
}

/**
 * Records where this browser first came from. Call before the router boots, so
 * the landing URL's query string is still intact.
 *
 * First touch wins, with one exception: a visit carrying campaign tags replaces
 * a stored record that has none. Someone who wandered in from Google and later
 * clicked a sponsored newsletter link should count for the newsletter.
 */
export function captureAttribution(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const touch: Attribution = {};
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) touch[key] = value;
    }
    const ref = params.get('ref');
    if (ref) touch.ref = ref;

    const referrer = externalReferrer();
    if (referrer) touch.referrer = referrer;
    touch.landingPath = window.location.pathname;
    touch.firstSeenAt = new Date().toISOString();

    const existing = readAttribution();
    const touchIsCampaign = !!(touch.utm_source || touch.ref);
    const existingIsCampaign = !!(existing?.utm_source || existing?.ref);
    if (existing && (existingIsCampaign || !touchIsCampaign)) return;

    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(touch));
  } catch {
    // Storage blocked (private mode etc.) — attribution is best-effort.
  }
}

export function readAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    const seen = parsed.firstSeenAt ? Date.parse(parsed.firstSeenAt) : NaN;
    if (!Number.isFinite(seen) || Date.now() - seen > ATTRIBUTION_TTL_MS) {
      localStorage.removeItem(ATTRIBUTION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function externalReferrer(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const url = new URL(document.referrer);
    if (url.hostname === window.location.hostname) return undefined;
    // Origin + path only: referrer query strings can carry other people's tokens.
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}
