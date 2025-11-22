import { Component, inject, OnInit } from '@angular/core';
import { SnippetsService } from '../snippets.service';
import { SnippetOverride } from '../models';

@Component({
  selector: 'app-snippets',
  imports: [],
  templateUrl: './snippets.html',
  styleUrl: './snippets.css',
})
export class Snippets implements OnInit {
  private snippetsService = inject(SnippetsService);
  snippets: SnippetOverride[] = [];

  ngOnInit() {
    this.snippetsService.getAllSnippetSummary().subscribe({
      next: (data) => (this.snippets = data),
      error: (error) => console.error('Error fetching snippets:', error),
    });
  }
}
