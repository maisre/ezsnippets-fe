import { SnippetOverride } from './snippet.model';

export interface SubPage {
  name: string;
  snippets: SnippetOverride[];
}

export interface Layout {
  id: string;
  name: string;
  navbar: string;
  footer: string;
  subPages: SubPage[];
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateLayoutDto {
  name: string;
  navbar?: string;
  footer?: string;
  subPages?: SubPage[];
  projectId?: string;
}
