import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../../../core/services/admin.service';
import {
  AnnouncementConfig,
  AnnouncementDestination,
  CreateAnnouncementResponse
} from '../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-avisos',
  standalone: false,
  templateUrl: './avisos.component.html',
  styleUrls: []
})
export class AdminAnnouncementsComponent implements OnInit {
  config: AnnouncementConfig | null = null;
  selectedDestinations: Record<AnnouncementDestination, boolean> = {
    discord: true,
    telegram: true
  };
  title = '';
  message = '';
  image: File | null = null;
  loading = true;
  sending = false;
  errorMessage = '';
  result: CreateAnnouncementResponse | null = null;

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getAnnouncementConfig().subscribe({
      next: (config) => {
        this.config = config;
        this.selectedDestinations = config.destinations.reduce((acc, destination) => ({
          ...acc,
          [destination.id]: destination.enabled
        }), { discord: false, telegram: false });
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar as configurações de avisos.';
        this.loading = false;
      }
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.image = input.files?.[0] ?? null;
  }

  sendAnnouncement(): void {
    const destinations = this.getSelectedDestinations();

    if (!this.title.trim() || !this.message.trim() || destinations.length === 0) {
      this.errorMessage = 'Informe título, mensagem e ao menos um destino.';
      return;
    }

    this.sending = true;
    this.errorMessage = '';
    this.result = null;

    this.adminService.sendAnnouncement({
      destinations,
      title: this.title.trim(),
      message: this.message.trim()
    }, this.image).subscribe({
      next: (result) => {
        this.result = result;
        this.sending = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível disparar o aviso.';
        this.sending = false;
      }
    });
  }

  cancel(): void {
    this.title = '';
    this.message = '';
    this.image = null;
    this.result = null;
    this.errorMessage = '';
  }

  private getSelectedDestinations(): AnnouncementDestination[] {
    return Object.entries(this.selectedDestinations)
      .filter(([, selected]) => selected)
      .map(([destination]) => destination as AnnouncementDestination);
  }
}
