import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PagesService } from '../pages.service';
import { PlansService, PlanUsage } from '../plans.service';
import { environment } from '../../environments/environment';
import { Page } from '../models';

@Component({
  selector: 'app-pages',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pages.html',
  styleUrl: './pages.css',
})
export class Pages implements OnInit {
  private pagesService = inject(PagesService);
  private plansService = inject(PlansService);
  private router = inject(Router);
  pages: Page[] = [];
  usage: PlanUsage | null = null;

  newPage = {
    name: '',
    siteName: '',
    description: '',
  };

  ngOnInit() {
    this.loadPages();
    this.loadUsage();
  }

  loadPages() {
    this.pagesService.getAllPages().subscribe({
      next: (data) => (this.pages = data),
      error: (error) => console.error('Error fetching pages:', error),
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
    if (!this.usage.limits || this.usage.limits.maxPages === -1) return true;
    return (this.usage.usage?.pages ?? 0) < this.usage.limits.maxPages;
  }

  get limitMessage(): string {
    if (!this.usage) return '';
    if (!this.usage.hasPlan) return 'Subscribe to a plan to create pages.';
    if (!this.usage.limits) return '';
    if (this.usage.limits.maxPages === -1) return 'Unlimited pages';
    const used = this.usage.usage?.pages ?? 0;
    return `${used} / ${this.usage.limits.maxPages} pages used`;
  }

  createPage() {
    if (!this.newPage.name.trim()) {
      return;
    }

    const pageData = {
      name: this.newPage.name.trim(),
      siteName: this.newPage.siteName.trim() || undefined,
      description: this.newPage.description.trim() || undefined,
      snippets: [],
    };

    this.pagesService.createPage(pageData).subscribe({
      next: (createdPage) => {
        this.pages.push(createdPage);
        this.newPage = { name: '', siteName: '', description: '' };
        this.loadUsage();
      },
      error: (error) => console.error('Error creating page:', error),
    });
  }

  editPage(pageId: string) {
    this.router.navigate(['/p/edit', pageId]);
  }

  viewPage(pageId: string) {
    window.open(`${environment.viewUrl}/view/page/${pageId}`, '_blank');
  }
}
