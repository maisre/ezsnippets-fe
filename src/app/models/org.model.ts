export interface OrgMember {
  user: string;
  role: 'owner' | 'admin' | 'member';
}

export interface Org {
  id: string;
  name: string;
  personal: boolean;
  members: OrgMember[];
}
