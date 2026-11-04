import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from '../runtime-config';

export type FeedbackKind = 'bug' | 'snippet' | 'idea' | 'other';
export type SnippetReason = 'broken' | 'content' | 'wish' | 'other';

/** A snippet the user could point the feedback at. */
export interface FeedbackSnippet {
  id: string;
  type?: string;
}

/**
 * What an editor tells the feedback dialog about the screen. Read at the
 * moment the dialog opens, so it reflects the current order and sub-page.
 */
export interface FeedbackEditorContext {
  page?: string;
  layout?: string;
  subPage?: string;
  /** Everything visible in the structure, in order (nav and footer included). */
  snippets: FeedbackSnippet[];
}

export interface CreateFeedback {
  kind: FeedbackKind;
  reason?: SnippetReason;
  message: string;
  snippet?: string;
  context: {
    url: string;
    page?: string;
    layout?: string;
    subPage?: string;
    snippetIds: string[];
    viewport: string;
    userAgent: string;
  };
}

/**
 * Global feedback state. The dialog lives in the app shell so it can open from
 * anywhere; editors register a context provider so feedback sent from them
 * carries the page/layout and its snippets without the user doing anything.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private http = inject(HttpClient);

  readonly isOpen = signal(false);
  /** Set when opened from a snippet's flag button. */
  readonly preselected = signal<FeedbackSnippet | null>(null);

  private provider: (() => FeedbackEditorContext) | null = null;

  /** Editors call this on init. Returns a function to call on destroy. */
  registerContext(provider: () => FeedbackEditorContext): () => void {
    this.provider = provider;
    return () => {
      if (this.provider === provider) this.provider = null;
    };
  }

  /** The current editor context, or null outside an editor. */
  editorContext(): FeedbackEditorContext | null {
    return this.provider ? this.provider() : null;
  }

  open(snippet?: FeedbackSnippet) {
    this.preselected.set(snippet ?? null);
    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
    this.preselected.set(null);
  }

  submit(body: CreateFeedback): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${runtimeConfig.apiUrl}/feedback`, body);
  }
}
