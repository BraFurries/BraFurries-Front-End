import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminBotStatus } from '../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-bot-coddy',
  standalone: false,
  templateUrl: './bot-coddy.component.html',
  styleUrls: []
})
export class AdminBotComponent implements OnInit {
  botStatus: AdminBotStatus | null = null;
  loading = true;
  errorMessage = '';

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.loadBotStatus();
  }

  loadBotStatus(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getBotStatus().subscribe({
      next: (status) => {
        this.botStatus = status;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar o status do bot.';
        this.loading = false;
      }
    });
  }

  formatUptime(seconds?: number): string {
    if (seconds === undefined) {
      return '-';
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m`;
  }

  // TODO: Para implementação futura de gerenciamento de módulos real
  /*
  modules = [
    { name: 'Moderação Automática', description: 'Filtro de palavras, anti-spam, e links.', enabled: true },
    { name: 'Sistema de XP e Níveis', description: 'Garante XP por mensagens e voz.', enabled: true },
    { name: 'Economia', description: 'Sistema de moedas, loja e jogos de apostas.', enabled: false },
    { name: 'Boas-vindas', description: 'Mensagem e cargo automático para novatos.', enabled: true },
    { name: 'Logs de Auditoria', description: 'Registra mensagens apagadas e editadas.', enabled: true }
  ];

  toggleModule(module: { enabled: boolean }): void {
    module.enabled = !module.enabled;
  }
  */
}
