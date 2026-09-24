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
}
