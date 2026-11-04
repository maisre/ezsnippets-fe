import { SnippetOverride } from '../models';

// Shared "is this snippet done?" rules for the page and layout editors: the
// row badges, the readiness pill, the AI card counts and the Finalize checklist.

/** Text counts as done once AI customized it or the user edited any of it. */
export function hasCustomText(s: SnippetOverride): boolean {
  return s.aiCustomized === true || (s.textReplacementOverride?.length ?? 0) > 0;
}

/**
 * Image slot tokens for a snippet, from the library summary. Undefined when the
 * summary hasn't loaded (or misses the snippet) — callers then fall back to the
 * AI flag rather than guessing.
 */
export function imageTokensOf(
  s: SnippetOverride,
  library: Map<string, SnippetOverride>,
): string[] | undefined {
  return library.get(s.id)?.imageReplacement?.map((ir) => ir.token);
}

/** False for snippets with no image slots: there is nothing to fill. */
export function hasImageSlots(tokens: string[] | undefined): boolean {
  return tokens === undefined || tokens.length > 0;
}

/** Images count as done when AI filled them or every slot has an override. */
export function imagesDone(s: SnippetOverride, tokens: string[] | undefined): boolean {
  if (s.aiImagesPopulated === true) return true;
  if (tokens === undefined) return false;
  const filled = new Set(
    (s.imageReplacementOverride ?? []).filter((o) => !!o.replacement).map((o) => o.token),
  );
  return tokens.every((t) => filled.has(t));
}
