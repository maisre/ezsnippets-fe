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

/**
 * How many image slots a snippet has and how many hold an image.
 *
 * Counted per slot, the same way the content editor counts them, so the two
 * screens can't disagree. The AI flag is deliberately not consulted when the
 * slots are known: a fill marks a snippet populated even when it found no photo
 * for one of its slots, which used to read here as "done" while the editor
 * showed the slot empty. With no library summary yet, the flag is all there is.
 */
export function imageSlotStatus(
  s: SnippetOverride,
  tokens: string[] | undefined,
): { total: number; filled: number } {
  if (tokens === undefined) {
    return { total: 1, filled: s.aiImagesPopulated === true ? 1 : 0 };
  }
  const set = new Set(
    (s.imageReplacementOverride ?? []).filter((o) => !!o.replacement).map((o) => o.token),
  );
  return { total: tokens.length, filled: tokens.filter((t) => set.has(t)).length };
}

/** Images count as done when every slot has an image. */
export function imagesDone(s: SnippetOverride, tokens: string[] | undefined): boolean {
  const { total, filled } = imageSlotStatus(s, tokens);
  return filled === total;
}
