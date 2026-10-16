import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminMetrics, AdminMetricsPeriod } from '../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-metricas',
  standalone: false,
  templateUrl: './metricas.component.html',
  styleUrls: []
})
export class AdminMetricsComponent implements OnInit {
  metrics: AdminMetrics | null = null;
  period: AdminMetricsPeriod = '7d';
  loading = true;
  errorMessage = '';

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.loadMetrics();
  }

  loadMetrics(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getMetrics(this.period).subscribe({
      next: (metrics) => {
        this.metrics = metrics;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar as métricas.';
        this.loading = false;
      }
    });
  }

  getGrowthHeight(value: number): number {
    const values = this.metrics?.communityGrowth.map((item) => item.value) ?? [];
    const maxValue = Math.max(...values, 1);
    return Math.max((value / maxValue) * 100, 8);
  }

  getPlatformLabel(platform: 'discord' | 'telegram' | 'site'): string {
    return {
      discord: 'Discord',
      telegram: 'Telegram',
      site: 'Site'
    }[platform];
  }
}
