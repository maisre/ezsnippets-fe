import { Org } from './models';

/**
 * When a team workspace will close, if it's on its way out: the owner moved it
 * to a single-seat plan, or cancelled and the plan runs out at period end.
 * Null for personal workspaces and for teams that will renew.
 *
 * Display only — ez-api decides access. Mirrors its isWorkspaceOpen.
 */
export function teamClosesAt(org: Org | null | undefined): Date | null {
  if (!org || org.personal) return null;
  const downgrade = org.scheduledDowngrade?.until;
  if (downgrade && Date.parse(downgrade) > Date.now()) return new Date(downgrade);
  if (org.cancelAtPeriodEnd && org.currentPeriodEnd) {
    return new Date(org.currentPeriodEnd * 1000);
  }
  return null;
}

const ENTITLED = new Set(['active', 'trialing', 'past_due']);

/** A team whose plan has ended — nobody can switch into it. */
export function isTeamClosed(org: Org | null | undefined): boolean {
  if (!org || org.personal) return false;
  const downgrade = org.scheduledDowngrade?.until;
  if (downgrade && Date.parse(downgrade) > Date.now()) return false;
  if (!org.plan) return true;
  return !!org.subscriptionStatus && !ENTITLED.has(org.subscriptionStatus);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
