import { SnippetOverride } from './snippet.model';

export interface Page {
  id: string;
  name: string;
  siteName?: string;
  description?: string;
  snippets: SnippetOverride[];
  /**
   * Snippets parked in the editor's scratch pad while deciding on look and
   * feel. Same shape as `snippets` — they keep their customizations, so a
   * restore is lossless. Never rendered, never licensed, never exported.
   */
  scratchPad?: SnippetOverride[];
  org?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  /**
   * Custom URL segment on the org's custom domain
   * (view.theirs.com/stans-hvac). Null means id-only access. Unique per org.
   */
  slug?: string | null;
  /** Which text variant the page renders (defaults to 'generic' server-side). */
  textVariant?: 'lorem' | 'generic' | 'customized';
  /** URL of the ez-view preview screenshot, populated by the ez-background job. */
  thumbnailUrl?: string;
  /**
   * Archived pages don't count toward the plan limit and stop rendering in
   * ez-view, but stay listed here and can be restored. Defaults to 'active'
   * server-side; absent on documents created before archiving existed.
   */
  status?: 'active' | 'archived';
}

export interface CreatePageDto {
  name: string;
  siteName?: string;
  description?: string;
  snippets?: SnippetOverride[];
}
