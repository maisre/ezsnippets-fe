import { Component, Input, TemplateRef } from '@angular/core';
import { CdkMenuTrigger } from '@angular/cdk/menu';

/**
 * A styled "…" button that opens a CDK menu, used to keep the secondary actions
 * (duplicate, archive, delete) off the page/layout cards and rows.
 *
 * The menu content is passed in as a TemplateRef rather than projected with
 * <ng-content>: CDK menu items resolve MENU_STACK from wherever they're
 * *declared*, and projected content is declared in the consumer's view, which
 * has no menu stack. Handing the trigger a template lets it instantiate the
 * content through its own injector, which does provide one.
 *
 *   <ng-template #menu>
 *     <div class="overflow-menu" cdkMenu>
 *       <button cdkMenuItem (click)="duplicate()">Duplicate</button>
 *       <button cdkMenuItem class="danger" (click)="remove()">Delete</button>
 *     </div>
 *   </ng-template>
 *   <app-overflow-menu [menu]="menu" label="Page actions" />
 *
 * Consumers import `OverflowMenu`, `CdkMenu` and `CdkMenuItem`. Panel and item
 * styling is global (src/styles.css) so every menu matches.
 *
 * The panel renders in a body-level CDK overlay, which is what lets it escape
 * `.card { overflow: hidden }` on the dashboard.
 */
@Component({
  selector: 'app-overflow-menu',
  imports: [CdkMenuTrigger],
  templateUrl: './overflow-menu.html',
  styleUrl: './overflow-menu.css',
})
export class OverflowMenu {
  /** The menu panel: an ng-template whose root carries `cdkMenu`. */
  @Input({ required: true }) menu!: TemplateRef<unknown>;

  /** Accessible name for the trigger, e.g. "Actions for My Landing Page". */
  @Input() label = 'More actions';
}
