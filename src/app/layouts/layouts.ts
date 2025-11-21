import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LayoutsService } from '../layouts.service';

@Component({
  selector: 'app-layouts',
  imports: [CommonModule, FormsModule],
  templateUrl: './layouts.html',
  styleUrl: './layouts.css',
})
export class Layouts implements OnInit {
  private layoutsService = inject(LayoutsService);
  private router = inject(Router);
  layouts: any[] = [];

  newLayout = {
    name: '',
    projectId: '',
  };

  ngOnInit() {
    this.loadLayouts();
  }

  loadLayouts() {
    this.layoutsService.getAllLayouts().subscribe({
      next: (data) => (this.layouts = data),
      error: (error) => console.error('Error fetching layouts:', error),
    });
  }

  createLayout() {
    if (!this.newLayout.name.trim()) {
      return;
    }

    const layoutData = {
      name: this.newLayout.name.trim(),
      projectId: this.newLayout.projectId.trim() || undefined,
      snippets: [],
    };

    this.layoutsService.createLayout(layoutData).subscribe({
      next: (createdLayout) => {
        this.layouts.push(createdLayout);
        this.newLayout = { name: '', projectId: '' };
      },
      error: (error) => console.error('Error creating layout:', error),
    });
  }

  editLayout(layoutId: string) {
    this.router.navigate(['/l/edit', layoutId]);
  }
}
