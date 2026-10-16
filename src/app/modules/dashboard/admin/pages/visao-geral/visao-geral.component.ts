import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminOverview } from '../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-visao-geral',
  standalone: false,
  templateUrl: './visao-geral.component.html',
  styleUrls: []
})
export class AdminOverviewComponent implements OnInit {
  overview: AdminOverview | null = null;
  loading = true;
  errorMessage = '';

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.loadOverview();
  }

  loadOverview(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getOverview().subscribe({
      next: (overview) => {
        this.overview = overview;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar a visão geral.';
        this.loading = false;
      }
    });
  }

  get systemStatusLabel(): string {
    switch (this.overview?.systemStatus) {
      case 'operational':
        return 'Sistema Operacional';
      case 'degraded':
        return 'Sistema Degradado';
      case 'offline':
        return 'Sistema Offline';
      default:
        return 'Carregando Sistema';
    }
  }

  get botStatusLabel(): string {
    switch (this.overview?.metrics.botStatus) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'degraded':
        return 'Degradado';
      case 'restarting':
        return 'Reiniciando';
      default:
        return '-';
    }
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }
}
