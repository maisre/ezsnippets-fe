export type TemplateKind = 'partial' | 'page' | 'layout';

export interface SubPageTemplate {
  name: string;
  snippetIds: string[];
}

/**
 * A blank arrangement of snippets. No content, no overrides — instantiating one
 * gives you the shape and nothing else, which is why previews can be built from
 * the snippet thumbnails we already have rather than a capture pipeline.
 */
export interface Template {
  id: string;
  name: string;
  description?: string;
  kind: TemplateKind;
  type?: string;
  tags: string[];
  /** kind: 'partial' | 'page' */
  snippetIds: string[];
  /** kind: 'layout' — bare snippet ids. */
  nav?: string;
  footer?: string;
  subPages: SubPageTemplate[];
  /** Absent on the built-in library; set on templates this org saved. */
  org?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface CreateTemplateDto {
  name: string;
  description?: string;
  kind: TemplateKind;
  type?: string;
  tags?: string[];
  snippetIds?: string[];
  nav?: string;
  footer?: string;
  subPages?: SubPageTemplate[];
}

export interface TemplateFilters {
  types: string[];
  tags: string[];
}
