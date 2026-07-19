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
  imageReplacementOverride?: Array<{
    token: string;
    replacement: string;
    /**
     * Present only when `replacement` is a Shutterstock preview comp. Always
     * written together with `replacement`, so replacing an image replaces (or
     * clears) its id — a stale id would put an unused photo into the licensing
     * hand-off later.
     */
    shutterstockId?: string;
  }>;
  aiCustomized?: boolean;
  /** True once image slots have been auto-populated from stock. */
  aiImagesPopulated?: boolean;
  type?: string;
  tags?: string[];
}

export interface SnippetFilters {
  types: string[];
  tags: string[];
}
