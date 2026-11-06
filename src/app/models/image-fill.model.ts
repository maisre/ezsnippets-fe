/**
 * 'quick': one stock search for the user's keywords, handed out across every
 * slot by shape. No AI. 'smart': AI writes a search per slot.
 */
export type ImageFillMode = 'quick' | 'smart';

/** What the server reports after filling images. */
export interface ImageFillSummary {
  mode: ImageFillMode;
  /** Smart fill failed (e.g. AI unavailable) and quick fill ran instead. */
  fellBack: boolean;
  /** The keywords quick fill searched for. */
  keywords?: string;
  requested: number;
  filled: number;
}
