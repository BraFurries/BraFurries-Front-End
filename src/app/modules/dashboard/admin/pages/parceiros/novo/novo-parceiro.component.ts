import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../../../../../../core/services/admin.service';
import { PartnerFormSubmission } from '../components/parceiro-form/parceiro-form.component';
import { CreatePartnerRequest } from '../../../../../../shared/models/api/admin/admin';

@Component({ selector: 'app-novo-parceiro', standalone: false, templateUrl: './novo-parceiro.component.html' })
export class NovoParceiroComponent {
  submitting = false;
  errorMessage = '';
  successMessage = '';
  constructor(private adminService: AdminService, private router: Router) { }

  create(submission: PartnerFormSubmission): void {
    if (this.submitting) return;
    this.submitting = true; this.errorMessage = '';
    this.adminService.createPartner(submission.payload as CreatePartnerRequest).subscribe({
      next: partner => {
        if (!submission.imageFile) { this.successMessage = 'Parceria criada com sucesso.'; this.submitting = false; this.router.navigate(['/painel/admin/parceiros', partner.id, 'editar']); return; }
        this.adminService.uploadPartnerImage(partner.id, submission.imageFile).subscribe({
          next: () => { this.successMessage = 'Parceria criada com sucesso.'; this.submitting = false; this.router.navigate(['/painel/admin/parceiros', partner.id, 'editar']); },
          error: () => { this.submitting = false; this.router.navigate(['/painel/admin/parceiros', partner.id, 'editar'], { state: { errorMessage: 'Parceria criada, mas não foi possível enviar a imagem. Você pode tentar novamente.' } }); }
        });
      },
      error: error => { this.errorMessage = this.mapError(error?.status, error?.error?.message); this.submitting = false; }
    });
  }
  back(): void { this.router.navigate(['/painel/admin/parceiros']); }
  private mapError(status: number, message?: string): string {
    if (status === 400) return 'Revise os dados informados.';
    if (status === 409 && message) return message;
    return 'Não foi possível concluir a operação. Tente novamente.';
  }
}
