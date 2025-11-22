import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PagesService } from '../pages.service';
import { environment } from '../../environments/environment';
import { Page } from '../models';

@Component({
  selector: 'app-pages',
  imports: [CommonModule, FormsModule],
  templateUrl: './pages.html',
  styleUrl: './pages.css',
})
export class Pages implements OnInit {
  private pagesService = inject(PagesService);
  private router = inject(Router);
  pages: Page[] = [];

  newPage = {
    name: '',
    projectId: '',
  };

  ngOnInit() {
    this.loadPages();
  }

  loadPages() {
    this.pagesService.getAllPages().subscribe({
      next: (data) => (this.pages = data),
      error: (error) => console.error('Error fetching pages:', error),
    });
  }

  createPage() {
    if (!this.newPage.name.trim()) {
      return;
    }

    const pageData = {
      name: this.newPage.name.trim(),
      projectId: this.newPage.projectId.trim() || undefined,
      snippets: [],
    };

    this.pagesService.createPage(pageData).subscribe({
      next: (createdPage) => {
        this.pages.push(createdPage);
        this.newPage = { name: '', projectId: '' };
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
