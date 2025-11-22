import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { LayoutsService } from '../layouts.service';
import { Layout } from '../models';

@Component({
  selector: 'app-layout-edit',
  imports: [CommonModule],
  templateUrl: './layout-edit.html',
  styleUrl: './layout-edit.css',
})
export class LayoutEdit implements OnInit {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private layoutsService = inject(LayoutsService);

  layout: Layout | null = null;
  layoutId: string | null = null;
  errorMessage: string | null = null;

  ngOnInit() {
    this.layoutId = this.route.snapshot.paramMap.get('id');
    if (this.layoutId) {
      this.loadLayout();
    } else {
      this.errorMessage = 'No layout ID provided';
    }
  }

  loadLayout() {
    if (!this.layoutId) return;

    console.log('Loading layout with ID:', this.layoutId);
    this.layoutsService.getLayoutById(this.layoutId).subscribe({
      next: (data) => {
        console.log('Layout loaded successfully:', data);
        this.layout = data;
        this.errorMessage = null;
      },
      error: (error) => {
        console.error('Error loading layout:', error);
        console.error('Error details:', error.status, error.message);
        this.errorMessage = `Layout not found (ID: ${this.layoutId})`;
      },
    });
  }
}
