import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { finalize } from 'rxjs/operators';
import { AdminService } from '../../../../../../core/services/admin.service';
import { DialogComponent } from '../../../../../../shared/components/dialog/dialog.component';
import { AdminPartnerItem } from '../../../../../../shared/models/api/admin/admin';
import { PartnerFormSubmission } from '../components/parceiro-form/parceiro-form.component';

@Component({ selector: 'app-editar-parceiro', standalone: false, templateUrl: './editar-parceiro.component.html' })
export class EditarParceiroComponent implements OnInit {
  partner: AdminPartnerItem | null = null;
  loading = true; notFound = false; submitting = false; statusSubmitting = false; deleting = false;
  errorMessage = ''; successMessage = '';
  private id = 0;
  constructor(private route: ActivatedRoute, private router: Router, private adminService: AdminService, private dialog: MatDialog) { }

  ngOnInit(): void {
    const navigationError = (this.router as any).getCurrentNavigation?.()?.extras.state?.['errorMessage'] ?? history.state?.['errorMessage'];
    if (typeof navigationError === 'string') {
      this.errorMessage = navigationError;
      const { errorMessage, ...rest } = history.state ?? {};
      history.replaceState(rest, document.title);
    }
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(this.id) || this.id <= 0) { this.notFound = true; this.loading = false; return; }
    this.adminService.getPartner(this.id).subscribe({
      next: partner => { this.partner = partner; this.loading = false; },
      error: error => { this.notFound = error?.status === 404; this.errorMessage = this.notFound ? '' : 'Não foi possível concluir a operação. Tente novamente.'; this.loading = false; }
    });
  }
  save(submission: PartnerFormSubmission): void {
    if (this.submitting) return;
    this.submitting = true; this.clearFeedback();
    this.adminService.updatePartner(this.id, submission.payload).subscribe({
      next: partner => {
        this.partner = partner;
        if (submission.imageFile) {
          this.adminService.uploadPartnerImage(this.id, submission.imageFile).pipe(finalize(() => this.submitting = false)).subscribe({ next: image => { this.partner = { ...partner, imageUrl: image.imageUrl }; this.successMessage = 'Parceria atualizada com sucesso.'; }, error: () => this.errorMessage = 'Os dados da parceria foram salvos, mas não foi possível atualizar a imagem.' });
        } else if (submission.removeImage) {
          this.adminService.deletePartnerImage(this.id).pipe(finalize(() => this.submitting = false)).subscribe({ next: image => { this.partner = { ...partner, imageUrl: image.imageUrl }; this.successMessage = 'Parceria atualizada com sucesso.'; }, error: () => this.errorMessage = 'Os dados da parceria foram salvos, mas não foi possível atualizar a imagem.' });
        } else { this.submitting = false; this.successMessage = 'Parceria atualizada com sucesso.'; }
      },
      error: error => { this.submitting = false; this.errorMessage = this.mapError(error?.status, error?.error?.message); }
    });
  }
  confirmStatus(): void {
    if (!this.partner || this.statusSubmitting) return;
    const suspended = this.partner.status === 'suspended';
    this.dialog.open(DialogComponent, { width: '480px', data: {
      type: 'boolean', title: suspended ? 'Reativar parceria?' : 'Suspender parceria?',
      message: suspended ? `A parceria <strong>${this.escape(this.partner.name)}</strong> voltará a ficar ativa.` : `A parceria <strong>${this.escape(this.partner.name)}</strong> ficará suspensa. Esta ação é reversível e não exclui a parceria.`,
      buttons: ['Cancelar', suspended ? 'Reativar' : 'Suspender']
    }}).afterClosed().subscribe(confirmed => { if (confirmed) this.updateStatus(suspended ? 'active' : 'suspended'); });
  }
  confirmDelete(): void {
    if (!this.partner || this.deleting) return;
    this.dialog.open(DialogComponent, { width: '480px', data: {
      type: 'boolean', title: 'Excluir parceria?',
      message: `Excluir <strong>${this.escape(this.partner.name)}</strong>? Esta ação é permanente e não poderá ser desfeita.`,
      buttons: ['Cancelar', 'Excluir permanentemente']
    }}).afterClosed().subscribe(confirmed => { if (confirmed) this.delete(); });
  }
  back(): void { this.router.navigate(['/painel/admin/parceiros']); }
  formatDate(value?: string | null): string { return value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : '-'; }
  private updateStatus(status: 'active' | 'suspended'): void {
    this.statusSubmitting = true; this.clearFeedback();
    this.adminService.updatePartnerStatus(this.id, status).pipe(finalize(() => this.statusSubmitting = false)).subscribe({
      next: partner => { this.partner = partner; this.successMessage = status === 'active' ? 'Parceria reativada.' : 'Parceria suspensa.'; },
      error: error => this.errorMessage = this.mapError(error?.status, error?.error?.message)
    });
  }
  private delete(): void {
    this.deleting = true; this.clearFeedback();
    this.adminService.deletePartner(this.id).pipe(finalize(() => this.deleting = false)).subscribe({
      next: () => this.router.navigate(['/painel/admin/parceiros'], { state: { successMessage: 'Parceria excluída com sucesso.' } }),
      error: error => this.errorMessage = this.mapError(error?.status, error?.error?.message)
    });
  }
  private clearFeedback(): void { this.errorMessage = ''; this.successMessage = ''; }
  private mapError(status: number, message?: string): string {
    if (status === 400) return 'Revise os dados informados.';
    if (status === 404) return 'Parceria não encontrada.';
    if (status === 409 && message) return message;
    return 'Não foi possível concluir a operação. Tente novamente.';
  }
  private escape(value: string): string { return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!)); }
}
