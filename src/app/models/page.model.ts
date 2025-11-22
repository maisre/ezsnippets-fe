import { SnippetOverride } from './snippet.model';

export interface Page {
  id: string;
  name: string;
  projectId?: string;
  snippets: SnippetOverride[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePageDto {
  name: string;
  projectId?: string;
  snippets?: SnippetOverride[];
}
