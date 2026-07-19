import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { OverflowMenu } from './overflow-menu';

@Component({
  template: `
    <ng-template #menu>
      <div class="overflow-menu" cdkMenu>
        <button cdkMenuItem (click)="picked = 'duplicate'">Duplicate</button>
        <button cdkMenuItem class="danger" (click)="picked = 'delete'">Delete</button>
      </div>
    </ng-template>
    <app-overflow-menu [menu]="menu" label="Test actions" />
  `,
  imports: [OverflowMenu, CdkMenu, CdkMenuItem],
})
class HostComponent {
  picked: string | null = null;
}

describe('OverflowMenu', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  function trigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.overflow-trigger');
  }

  function menuItems(): HTMLButtonElement[] {
    // The panel renders in a body-level CDK overlay, outside the fixture.
    return Array.from(document.querySelectorAll('.overflow-menu [cdkMenuItem]'));
  }

  it('renders a trigger labelled for screen readers', () => {
    expect(trigger()).toBeTruthy();
    expect(trigger().getAttribute('aria-label')).toBe('Test actions');
  });

  // Regression: the menu was originally built with <ng-content>, so projected
  // cdkMenuItem directives resolved MENU_STACK from the consumer's injector
  // (which has none) and threw NG0201 on open, taking the whole host view with
  // it. Opening the menu is the only thing that catches that.
  it('opens without a menu-stack injector error', () => {
    expect(() => {
      trigger().click();
      fixture.detectChanges();
    }).not.toThrow();

    expect(menuItems().length).toBe(2);
  });

  it('runs the item handler in the host component context', () => {
    trigger().click();
    fixture.detectChanges();

    menuItems()[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.picked).toBe('delete');
  });
});
