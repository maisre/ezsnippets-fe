import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LayoutsService } from '../layouts.service';
import { PlansService, PlanUsage } from '../plans.service';
import { Layout } from '../models';

@Component({
  selector: 'app-layouts',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './layouts.html',
  styleUrl: './layouts.css',
})
export class Layouts implements OnInit {
  private layoutsService = inject(LayoutsService);
  private plansService = inject(PlansService);
  private router = inject(Router);
  layouts: Layout[] = [];
  usage: PlanUsage | null = null;

  newLayout = {
    name: '',
    siteName: '',
    description: '',
  };

  ngOnInit() {
    this.loadLayouts();
    this.loadUsage();
  }

  loadLayouts() {
    this.layoutsService.getAllLayouts().subscribe({
      next: (data) => (this.layouts = data),
      error: (error) => console.error('Error fetching layouts:', error),
    });
  }

  loadUsage() {
    this.plansService.getUsage().subscribe({
      next: (data) => (this.usage = data),
      error: (error) => console.error('Error fetching usage:', error),
    });
  }

  get canCreate(): boolean {
    if (!this.usage?.hasPlan) return false;
    if (!this.usage.limits || this.usage.limits.maxLayouts === -1) return true;
    return (this.usage.usage?.layouts ?? 0) < this.usage.limits.maxLayouts;
  }

  get limitMessage(): string {
    if (!this.usage) return '';
    if (!this.usage.hasPlan) return 'Subscribe to a plan to create layouts.';
    if (!this.usage.limits) return '';
    if (this.usage.limits.maxLayouts === -1) return 'Unlimited layouts';
    const used = this.usage.usage?.layouts ?? 0;
    return `${used} / ${this.usage.limits.maxLayouts} layouts used`;
  }

  createLayout() {
    if (!this.newLayout.name.trim()) {
      return;
    }

    const layoutData = {
      name: this.newLayout.name.trim(),
      siteName: this.newLayout.siteName.trim() || undefined,
      description: this.newLayout.description.trim() || undefined,
    };

    this.layoutsService.createLayout(layoutData).subscribe({
      next: (createdLayout) => {
        this.layouts.push(createdLayout);
        this.newLayout = { name: '', siteName: '', description: '' };
        this.loadUsage();
      },
      error: (error) => console.error('Error creating layout:', error),
    });
  }

  editLayout(layoutId: string) {
    this.router.navigate(['/l/edit', layoutId]);
  }
}
