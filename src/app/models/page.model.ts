import { SnippetOverride } from './snippet.model';

export interface Page {
  id: string;
  name: string;
  siteName?: string;
  description?: string;
  snippets: SnippetOverride[];
  org?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  /** URL of the ez-view preview screenshot, populated by the ez-background job. */
  thumbnailUrl?: string;
}

export interface CreatePageDto {
  name: string;
  siteName?: string;
  description?: string;
  snippets?: SnippetOverride[];
}
