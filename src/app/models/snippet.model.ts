export interface Snippet {
  id: string;
  name: string;
  description?: string;
  html?: string;
  css?: string;
  js?: string;
}

export interface SnippetOverride {
  id: string;
  cssOverride: string;
  htmlOverride: {};
  jsOverride: string;
  textReplacementOverride?: Array<{ token: string; replacement: string }>;
  aiCustomized?: boolean;
  type?: string;
  tags?: string[];
}

export interface SnippetFilters {
  types: string[];
  tags: string[];
}
