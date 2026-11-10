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
  updatingPartnerId: number | null = null;
  errorMessage = '';

  readonly statusOrder: readonly { status: AdminPartnerStatus; label: string }[] = [
    { status: 'active', label: 'Ativos' },
    { status: 'pending', label: 'Pendentes' },
    { status: 'suspended', label: 'Suspensos' }
  ];

  private readonly nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

  get groupedPartners(): { status: AdminPartnerStatus; label: string; items: AdminPartnerItem[] }[] {
    return this.statusOrder.map(group => ({
      ...group,
      items: this.partners
        .filter(partner => partner.status === group.status)
        .sort((a, b) => this.nameCollator.compare(a.name, b.name) || a.id - b.id)
    })).filter(group => group.items.length > 0);
  }
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

  getNextStatus(status: AdminPartnerStatus): AdminPartnerStatus {
    return status === 'active' ? 'suspended' : 'active';
  }

  getStatusActionLabel(status: AdminPartnerStatus): string {
    return {
      active: 'Suspender',
      pending: 'Ativar',
      suspended: 'Reativar'
    }[status];
  }

  togglePartnerStatus(partner: AdminPartnerItem): void {
    if (this.updatingPartnerId !== null) return;

    const nextStatus = this.getNextStatus(partner.status);
    this.updatingPartnerId = partner.id;
    this.errorMessage = '';
    this.successMessage = '';

    this.adminService.updatePartnerStatus(partner.id, nextStatus).subscribe({
      next: (updatedPartner) => {
        // Respect the active server filter when a partner changes state.
        this.partners = this.partners
          .map(item => item.id === updatedPartner.id ? updatedPartner : item)
          .filter(item => !this.status || item.status === this.status);
        this.updatingPartnerId = null;
        this.successMessage = `Parceria ${updatedPartner.name} atualizada para ${this.getStatusLabel(updatedPartner.status).toLowerCase()}.`;
      },
      error: () => {
        this.updatingPartnerId = null;
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
