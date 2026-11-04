import {
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FeedbackEditorContext,
  FeedbackKind,
  FeedbackService,
  FeedbackSnippet,
  SnippetReason,
} from './feedback.service';
import { snippetThumbUrl } from '../runtime-config';

/**
 * The feedback form. Rendered once in the app shell; opened through
 * FeedbackService from the navbar or a snippet's flag button.
 */
/** A picker tile. `key` is unique even when a snippet appears twice. */
interface FeedbackChoice extends FeedbackSnippet {
  key: string;
  label: string;
}

@Component({
  selector: 'app-feedback-dialog',
  imports: [FormsModule],
  templateUrl: './feedback-dialog.html',
  styleUrl: './feedback-dialog.css',
})
export class FeedbackDialog {
  private feedback = inject(FeedbackService);
  private host = inject(ElementRef<HTMLElement>);
  private injector = inject(Injector);
  readonly isOpen = this.feedback.isOpen;
  readonly thumb = snippetThumbUrl;

  readonly kinds: Array<{ value: FeedbackKind; label: string }> = [
    { value: 'bug', label: 'Something’s broken' },
    { value: 'snippet', label: 'About a snippet' },
    { value: 'idea', label: 'Idea' },
    { value: 'other', label: 'Other' },
  ];
  readonly reasons: Array<{ value: SnippetReason; label: string }> = [
    { value: 'broken', label: 'Looks broken' },
    { value: 'content', label: 'Text or images' },
    { value: 'wish', label: 'Wish there was a variant' },
    { value: 'other', label: 'Something else' },
  ];

  kind: FeedbackKind | null = null;
  reason: SnippetReason | null = null;
  snippetId: string | null = null;
  message = '';

  /** Snapshot taken when the dialog opens, so it doesn't shift while typing. */
  context: FeedbackEditorContext | null = null;
  choices: FeedbackChoice[] = [];

  sending = signal(false);
  sent = signal(false);
  error = signal<string | null>(null);

  constructor() {
    // Re-seed every time the dialog opens: fresh editor context, fresh form.
    effect(() => {
      if (this.isOpen()) untracked(() => this.reset());
    });
  }

  private reset() {
    this.context = this.feedback.editorContext();
    const pre = this.feedback.preselected();

    // Snippets on screen in page order, numbered so two "content" rows can be
    // told apart. A preselected snippet that isn't on screen goes first.
    const list: FeedbackChoice[] = (this.context?.snippets ?? []).map((s, i) => ({
      ...s,
      key: `${i}:${s.id}`,
      label: `${i + 1}. ${s.type || 'Snippet'}`,
    }));
    if (pre && !list.some((c) => c.id === pre.id)) {
      list.unshift({ ...pre, key: `pre:${pre.id}`, label: pre.type || 'Snippet' });
    }
    this.choices = list;

    this.kind = pre ? 'snippet' : null;
    this.reason = null;
    this.snippetId = pre?.id ?? null;
    this.message = '';
    this.sending.set(false);
    this.sent.set(false);
    this.error.set(null);

    // A flagged snippet low on the page would sit below the picker's fold.
    if (pre) {
      afterNextRender(
        () =>
          this.host.nativeElement
            .querySelector('.fb-snip.on')
            ?.scrollIntoView({ block: 'nearest' }),
        { injector: this.injector },
      );
    }
  }

  get canSend(): boolean {
    return !!this.kind && !!this.message.trim() && !this.sending();
  }

  pickSnippet(id: string) {
    this.snippetId = this.snippetId === id ? null : id;
  }

  send() {
    if (!this.canSend || !this.kind) return;
    this.sending.set(true);
    this.error.set(null);
    const ctx = this.context;
    const isSnippet = this.kind === 'snippet';
    this.feedback
      .submit({
        kind: this.kind,
        reason: isSnippet ? this.reason ?? undefined : undefined,
        message: this.message.trim(),
        snippet: isSnippet ? this.snippetId ?? undefined : undefined,
        context: {
          url: location.pathname + location.search,
          page: ctx?.page,
          layout: ctx?.layout,
          subPage: ctx?.subPage,
          snippetIds: (ctx?.snippets ?? []).map((s) => s.id),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          userAgent: navigator.userAgent,
        },
      })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.sent.set(true);
        },
        error: (err) => {
          this.sending.set(false);
          this.error.set(
            err?.error?.message ?? 'Couldn’t send that. Please try again.',
          );
        },
      });
  }

  close() {
    this.feedback.close();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen()) this.close();
  }
}
