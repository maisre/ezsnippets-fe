import { SnippetOverride } from './snippet.model';

export interface Page {
  id: string;
  name: string;
  siteName?: string;
  description?: string;
  projectId?: string;
  snippets: SnippetOverride[];
  org?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePageDto {
  name: string;
  siteName?: string;
  description?: string;
  projectId?: string;
  snippets?: SnippetOverride[];
}
