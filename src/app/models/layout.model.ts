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
  nav: string;
  footer: string;
  subPages: SubPage[];
  org?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Which text variant the layout renders (defaults to 'generic' server-side). */
  textVariant?: 'lorem' | 'generic' | 'customized';
  /** URL of the ez-view preview screenshot, populated by the ez-background job. */
  thumbnailUrl?: string;
}

export interface CreateLayoutDto {
  name: string;
  siteName?: string;
  description?: string;
  nav?: string;
  footer?: string;
  subPages?: SubPage[];
}
