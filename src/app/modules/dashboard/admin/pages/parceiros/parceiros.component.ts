import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminPartnerCategory, AdminPartnerItem, AdminPartnerStatus } from '../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-parceiros',
  standalone: false,
  templateUrl: './parceiros.component.html',
  styleUrls: []
})
export class AdminPartnersComponent implements OnInit {
  partners: AdminPartnerItem[] = [];
  status: AdminPartnerStatus | '' = '';
  category: AdminPartnerCategory | '' = '';
  loading = true;
  errorMessage = '';
  successMessage = '';

  constructor(private adminService: AdminService, private router: Router) { }

  ngOnInit(): void {
    this.successMessage = this.router.getCurrentNavigation()?.extras.state?.['successMessage'] ?? '';
    this.loadPartners();
  }

  loadPartners(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getPartners({
      status: this.status,
      category: this.category
    }).subscribe({
      next: (response) => {
        this.partners = response.items;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar as parcerias.';
        this.loading = false;
      }
    });
  }

  togglePartnerStatus(partner: AdminPartnerItem): void {
    const nextStatus: AdminPartnerStatus = partner.status === 'suspended' ? 'active' : 'suspended';

    this.adminService.updatePartnerStatus(partner.id, nextStatus).subscribe({
      next: (updatedPartner) => {
        this.partners = this.partners.map((item) => item.id === updatedPartner.id ? updatedPartner : item);
      },
      error: () => {
        this.errorMessage = 'Não foi possível atualizar o status da parceria.';
      }
    });
  }

  createPartner(): void {
    this.router.navigate(['/painel/admin/parceiros/novo']);
  }

  editPartner(partner: AdminPartnerItem): void {
    this.router.navigate(['/painel/admin/parceiros', partner.id, 'editar']);
  }

  getStatusLabel(status: AdminPartnerStatus): string {
    return {
      pending: 'Pendente',
      active: 'Ativo',
      suspended: 'Suspenso'
    }[status];
  }

  getCategoryLabel(category: AdminPartnerCategory): string {
    return {
      community: 'Comunidade',
      creator: 'Criador',
      artist: 'Artista',
      event: 'Evento',
      meet: 'Meet',
      discord_server: 'Servidor Discord',
      brand: 'Marca',
      other: 'Outro'
    }[category];
  }

  getPartnerImage(partner: AdminPartnerItem): string {
    return partner.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.name)}&background=random`;
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  }
}
