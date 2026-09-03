import { SnippetOverride } from './snippet.model';

export interface SubPage {
  name: string;
  snippets: SnippetOverride[];
}

export interface Layout {
  id: string;
  name: string;
  siteName?: string;
  description?: string;
  /**
   * A snippet abstract, like every other snippet position. Legacy layouts hold
   * a bare id string here — read through snippetRefOf, which accepts both.
   */
  nav?: SnippetOverride | string | null;
  footer?: SnippetOverride | string | null;
  subPages: SubPage[];
  org?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Which text variant the layout renders (defaults to 'generic' server-side). */
  textVariant?: 'lorem' | 'generic' | 'customized';
  /** URL of the ez-view preview screenshot, populated by the ez-background job. */
  thumbnailUrl?: string;
  /**
   * Archived layouts don't count toward the plan limit but stay listed here and
   * can be restored. Defaults to 'active' server-side; absent on documents
   * created before archiving existed.
   */
  status?: 'active' | 'archived';
}

export interface CreateLayoutDto {
  name: string;
  siteName?: string;
  description?: string;
  nav?: SnippetOverride | string | null;
  footer?: SnippetOverride | string | null;
  subPages?: SubPage[];
}
