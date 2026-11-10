import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { finalize } from 'rxjs/operators';
import { AdminService } from '../../../../../../core/services/admin.service';
import { DialogComponent } from '../../../../../../shared/components/dialog/dialog.component';
import { AdminPartnerItem } from '../../../../../../shared/models/api/admin/admin';
import { ParceiroFormComponent, PartnerFormSubmission } from '../components/parceiro-form/parceiro-form.component';
import { PartnerDiscordAnnouncementRequest, PartnerDiscordService } from '../../../../../../core/services/partner-discord.service';
import { UpdatePartnerRequest } from '../../../../../../shared/models/api/admin/admin';

@Component({ selector: 'app-editar-parceiro', standalone: false, templateUrl: './editar-parceiro.component.html' })
export class EditarParceiroComponent implements OnInit {
  @ViewChild(ParceiroFormComponent) partnerForm?: ParceiroFormComponent;
  discordAnnouncement: PartnerDiscordAnnouncementRequest | null = null;
  discordAnnouncementReady = false;
  partner: AdminPartnerItem | null = null;
  loading = true; notFound = false; submitting = false; statusSubmitting = false; deleting = false;
  errorMessage = ''; successMessage = '';
  private id = 0;
  constructor(private route: ActivatedRoute, private router: Router, private adminService: AdminService,
    private dialog: MatDialog, private partnerDiscordService: PartnerDiscordService) { }

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
      next: partner => {
        this.partner = partner;
        this.partnerDiscordService.getSettings().subscribe({
          next: settings => {
            const item = settings.partners.find(current => current.partnerId === this.id);
            if (item) {
              this.discordAnnouncement = {
                markdown: item.announcementMarkdown,
                linksMode: item.announcementLinksMode,
                publicContact: item.announcementPublicContact
              };
              this.discordAnnouncementReady = true;
            } else this.errorMessage = 'Não foi possível localizar a configuração do anúncio desta parceria.';
            this.loading = false;
          },
          error: () => {
            this.errorMessage = 'Não foi possível carregar o anúncio do Discord; ele será preservado.';
            this.loading = false;
          }
        });
      },
      error: error => { this.notFound = error?.status === 404; this.errorMessage = this.notFound ? '' : 'Não foi possível concluir a operação. Tente novamente.'; this.loading = false; }
    });
  }
  save(submission: PartnerFormSubmission): void {
    if (this.submitting) return;
    this.submitting = true; this.clearFeedback();
    this.adminService.updatePartner(this.id, submission.payload).subscribe({
      next: partner => {
        this.partner = partner;
        const submittedAnnouncement = (submission.payload as UpdatePartnerRequest).discordAnnouncement;
        if (submittedAnnouncement) this.discordAnnouncement = { ...submittedAnnouncement };
        if (submission.imageFile) {
          this.adminService.uploadPartnerImage(this.id, submission.imageFile).pipe(finalize(() => this.submitting = false)).subscribe({ next: image => { this.partner = { ...partner, imageUrl: image.imageUrl }; this.successMessage = 'Parceria atualizada com sucesso.'; this.refreshDiscordStatus(); }, error: () => this.errorMessage = 'Os dados da parceria foram salvos, mas não foi possível atualizar a imagem.' });
        } else if (submission.removeImage) {
          this.adminService.deletePartnerImage(this.id).pipe(finalize(() => this.submitting = false)).subscribe({ next: image => { this.partner = { ...partner, imageUrl: image.imageUrl }; this.successMessage = 'Parceria atualizada com sucesso.'; this.refreshDiscordStatus(); }, error: () => this.errorMessage = 'Os dados da parceria foram salvos, mas não foi possível atualizar a imagem.' });
        } else { this.submitting = false; this.successMessage = 'Parceria atualizada com sucesso.'; this.refreshDiscordStatus(); }
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
  canDeactivate(): boolean {
    return !this.partnerForm?.form.dirty
      || (typeof window !== 'undefined' && window.confirm('Há alterações não salvas no anúncio. Deseja sair sem salvar?'));
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.partnerForm?.form.dirty) {
      event.preventDefault();
      event.returnValue = true;
    }
  }
  private refreshDiscordStatus(): void {
    this.partnerDiscordService.getSettings().subscribe({
      next: settings => {
        const current = settings.partners.find(item => item.partnerId === this.id);
        if (current?.lastSyncError) this.errorMessage = 'Parceria salva, mas a atualização no Discord falhou. Verifique a configuração da vitrine.';
        else if (current && (current.contentOutOfSync || current.appliedRevision < current.desiredRevision)) {
          this.errorMessage = 'Parceria salva, mas o Discord ainda não está sincronizado.';
        }
      },
      error: () => this.errorMessage = 'Parceria salva; não foi possível confirmar o estado do anúncio no Discord.'
    });
  }
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
