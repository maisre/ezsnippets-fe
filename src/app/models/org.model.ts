export interface OrgMember {
  user: string;
  role: 'owner' | 'admin' | 'member';
}

/** A snippet the org has starred in the editor palette. Ids only. */
export interface FavoriteSnippet {
  snippetId: string;
  createdBy?: string;
  addedAt?: string;
}

export interface Org {
  id: string;
  name: string;
  personal: boolean;
  members: OrgMember[];
  paddleCustomerId?: string;
  subscriptionId?: string;
  plan?: string;
  subscriptionStatus?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  favoriteSnippets?: FavoriteSnippet[];
  /**
   * Set on a team its owner moved down to a single-seat plan. The team keeps
   * its plan until `until` (ISO), then closes — see workspace-status.ts.
   */
  scheduledDowngrade?: { until: string; toPlan?: string };
  /** The caller's role in this org (GET /orgs). */
  role?: OrgMember['role'];
  /** True for the org the caller's token is scoped to. */
  active?: boolean;
}

/** GET /orgs/:id/members */
export interface TeamView {
  org: { id: string; name: string; personal: boolean };
  myRole: OrgMember['role'];
  members: { userId: string; email: string | null; role: OrgMember['role'] }[];
  /** limit is null when the workspace has no active plan. */
  seats: { used: number; limit: number | null };
  /** Owners and admins only. */
  invites?: TeamInvite[];
}

export interface TeamInvite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  expiresAt: string;
  createdAt?: string;
}

/** GET /invites/:token */
export interface InvitePreview {
  orgName: string;
  email: string;
  role: 'admin' | 'member';
  inviterEmail: string | null;
}
