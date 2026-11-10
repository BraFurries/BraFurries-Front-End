import { Component, OnInit } from '@angular/core';
import { OwnPartnerPublication, PartnerDiscordService } from '../../../core/services/partner-discord.service';

@Component({
  selector: 'app-partner-posting',
  standalone: false,
  templateUrl: './partner-posting.component.html'
})
export class PartnerPostingComponent implements OnInit {
  partners: OwnPartnerPublication[] = [];
  draft: Record<number, string> = {};
  lastSentId: Record<number, string> = {};
  loading = true;
  postingPartnerId: number | null = null;
  error = '';
  success = '';

  constructor(private readonly service: PartnerDiscordService) {}

  ngOnInit(): void {
    this.service.getMyPublications().subscribe({
      next: partners => {
        this.partners = partners;
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        this.error = err?.error?.message || 'Não foi possível carregar suas publicações de parceiros.';
      }
    });
  }

  publish(partner: OwnPartnerPublication): void {
    const content = this.draft[partner.partnerId]?.trim() ?? '';
    if (!content || content.length > 1900 || this.postingPartnerId !== null) return;
    this.error = '';
    this.success = '';
    this.postingPartnerId = partner.partnerId;
    this.service.publishAsRepresentative(partner.partnerId, content).subscribe({
      next: response => {
        this.draft[partner.partnerId] = '';
        this.lastSentId[partner.partnerId] = response.messageId;
        this.success = 'Sua publicação foi enviada à thread do parceiro no Discord.';
        this.postingPartnerId = null;
      },
      error: err => {
        this.error = err?.error?.message || 'Não foi possível publicar. Confira sua autorização e tente novamente.';
        this.postingPartnerId = null;
      }
    });
  }
}
