import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventTransferInvite } from '../../../../core/models/invite.model';
import { InviteService } from '../../../../core/services/invite.service';
import { UserService } from '../../../../core/services/user.service';
import { User } from '../../../../shared/models/user';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({
  selector: 'app-event-transfer-invite',
  standalone: false,
  templateUrl: './event-transfer-invite.component.html',
  styleUrl: './event-transfer-invite.component.scss'
})
export class EventTransferInviteComponent implements OnInit {
  token: string = '';
  invite: EventTransferInvite | null = null;
  isLoading: boolean = true;
  hasError: boolean = false;

  currentUser: User | null = null;

  isProcessing: boolean = false;
  isSuccess: boolean = false;
  isRejected: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private inviteService: InviteService,
    private userService: UserService,
    private readonly seoService: SeoService
  ) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Convite de Transfer\u00eancia de Evento - BraFurries',
      'Acesse seu convite de transferencia de evento na BraFurries para aceitar, recusar ou verificar os detalhes da solicitacao.'
    );
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.currentUser = this.userService.getUser();

    if (this.token) {
      this.loadInvite();
    } else {
      this.hasError = true;
      this.isLoading = false;
    }
  }

  loadInvite(): void {
    this.isLoading = true;
    this.inviteService.getEventTransferInvite(this.token).subscribe({
      next: (invite) => {
        this.invite = invite;
        this.isLoading = false;

        if (!invite.valid || invite.status !== 'PENDING') {
          this.hasError = true;
        }
      },
      error: () => {
        this.hasError = true;
        this.isLoading = false;
      }
    });
  }

  goToLogin(): void {
    const returnUrl = this.router.url;
    this.router.navigate(['/login'], { queryParams: { returnUrl } });
  }

  logoutAndLogin(): void {
    this.userService.logout().subscribe(() => {
      this.goToLogin();
    });
  }

  acceptInvite(): void {
    if (!this.invite) return;
    this.isProcessing = true;

    this.inviteService.respondToEventTransferInvite(this.token, 'accept').subscribe({
      next: () => {
        this.isProcessing = false;
        this.isSuccess = true;

        // Redirect after success
        setTimeout(() => {
          this.router.navigate(['/painel/eventos', this.invite?.inviteData.eventId]);
        }, 3000);
      },
      error: () => {
        this.isProcessing = false;
        alert('Ocorreu um erro ao aceitar o convite. Tente novamente mais tarde.');
      }
    });
  }

  rejectInvite(): void {
    if (!this.invite) return;
    this.isProcessing = true;

    this.inviteService.respondToEventTransferInvite(this.token, 'reject').subscribe({
      next: () => {
        this.isProcessing = false;
        this.isRejected = true;
      },
      error: () => {
        this.isProcessing = false;
        alert('Ocorreu um erro ao recusar o convite.');
      }
    });
  }
}
