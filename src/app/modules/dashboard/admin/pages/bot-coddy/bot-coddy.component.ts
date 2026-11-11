import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import {
  AdminBotStatus,
  AdminCoddyActivityType,
  AdminCoddyAvailability,
  AdminCoddyMessageGuildTarget,
  AdminCoddyPresence,
  AdminCoddyPresenceView
} from '../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-bot-coddy',
  standalone: false,
  templateUrl: './bot-coddy.component.html',
  styleUrls: []
})
export class AdminBotComponent implements OnInit, OnDestroy {
  private readonly destroyed$ = new Subject<void>();

  botStatus: AdminBotStatus | null = null;
  reachedUsers: number | null = null;
  loading = true;
  reachLoading = true;
  errorMessage = '';

  presence: AdminCoddyPresenceView | null = null;
  activityType: AdminCoddyActivityType = 'PLAYING';
  activityText = '';
  availability: AdminCoddyAvailability = 'online';
  presenceLoading = true;
  presenceSaving = false;
  presenceConfirming = false;
  presenceMessage = '';
  presenceError = '';

  destinations: AdminCoddyMessageGuildTarget[] = [];
  destinationsLoading = true;
  destinationsError = '';
  selectedGuildId = '';
  selectedChannelId = '';
  messageText = '';
  messagePreview = false;
  sending = false;
  sendBlocked = false;
  sendError = '';
  sentMessageId = '';

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.loadBotStatus();
    this.loadPresence();
    this.loadMessageTargets();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadBotStatus(): void {
    this.loading = true;
    this.errorMessage = '';
    this.reachedUsers = null;
    this.reachLoading = true;

    this.adminService.getOverview().pipe(takeUntil(this.destroyed$)).subscribe({
      next: overview => {
        this.reachedUsers = overview.metrics.botReachedUsers;
        this.reachLoading = false;
      },
      error: () => {
        this.reachLoading = false;
      }
    });

    this.adminService.getBotStatus().pipe(takeUntil(this.destroyed$)).subscribe({
      next: status => {
        this.botStatus = status;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar o status do bot.';
        this.loading = false;
      }
    });
  }

  loadPresence(): void {
    this.presenceLoading = true;
    this.presenceError = '';
    this.adminService.getBotPresence().pipe(takeUntil(this.destroyed$)).subscribe({
      next: view => {
        this.presence = view;
        const state = view.desired || view.current;
        if (state) {
          this.activityType = state.activityType;
          this.activityText = state.activityText;
          this.availability = state.availability;
        }
        this.presenceLoading = false;
      },
      error: () => {
        this.presenceError = 'Não foi possível consultar a presença do Coddy.';
        this.presenceLoading = false;
      }
    });
  }

  reviewPresence(): void {
    this.presenceMessage = '';
    this.presenceError = '';
    this.presenceConfirming = !!this.activityText.trim() && this.activityText.length <= 128;
    if (!this.presenceConfirming) {
      this.presenceError = 'Informe uma atividade de até 128 caracteres.';
    }
  }

  applyPresence(): void {
    if (!this.presenceConfirming || this.presenceSaving) return;
    this.presenceSaving = true;
    this.presenceConfirming = false;
    const payload: AdminCoddyPresence = {
      activityType: this.activityType,
      activityText: this.activityText.trim(),
      availability: this.availability
    };
    this.adminService.updateBotPresence(payload).pipe(takeUntil(this.destroyed$)).subscribe({
      next: view => {
        this.presence = view;
        this.presenceMessage = 'Presença configurada com sucesso.';
        this.presenceError = '';
        this.presenceSaving = false;
      },
      error: () => {
        this.presenceError = 'Não foi possível confirmar a aplicação. A presença desejada pode ter sido salva; atualize a página e confira antes de repetir.';
        this.presenceSaving = false;
      }
    });
  }

  loadMessageTargets(): void {
    this.destinationsLoading = true;
    this.destinationsError = '';
    this.adminService.getBotMessageTargets().pipe(takeUntil(this.destroyed$)).subscribe({
      next: result => {
        this.destinations = result.guilds;
        this.destinationsLoading = false;
      },
      error: () => {
        this.destinationsError = 'Não foi possível consultar os canais em que o Coddy pode enviar mensagens.';
        this.destinationsLoading = false;
      }
    });
  }

  get selectedGuild(): AdminCoddyMessageGuildTarget | undefined {
    return this.destinations.find(guild => guild.guildId === this.selectedGuildId);
  }

  get selectedChannelName(): string {
    const channel = this.selectedGuild?.channels.find(c => c.channelId === this.selectedChannelId);
    return channel ? `#${channel.name}` : 'Nenhum canal';
  }

  selectGuild(value: string): void {
    this.selectedGuildId = value;
    this.selectedChannelId = '';
    this.onMessageChanged();
  }

  selectChannel(value: string): void {
    this.selectedChannelId = value;
    this.onMessageChanged();
  }

  onMessageChanged(): void {
    this.messagePreview = false;
    this.sendBlocked = false;
    this.sendError = '';
    this.sentMessageId = '';
  }

  reviewMessage(): void {
    this.sendError = '';
    if (!this.selectedGuild || !this.selectedGuild.channels.some(c => c.channelId === this.selectedChannelId)
        || !this.messageText.trim() || this.messageText.length > 1800 || this.sendBlocked) {
      this.sendError = 'Selecione servidor, canal e escreva uma mensagem de até 1.800 caracteres.';
      return;
    }
    this.messagePreview = true;
  }

  sendMessage(): void {
    if (!this.messagePreview || this.sending || this.sendBlocked || !this.selectedGuild
        || !this.selectedGuild.channels.some(c => c.channelId === this.selectedChannelId)) return;

    // Every confirmed action gets one UUID. Never retry automatically after
    // an ambiguous Discord response: the API ledger will block replays.
    const key = crypto.randomUUID();
    const payload = {
      communityId: this.selectedGuild.communityId,
      guildId: this.selectedGuildId,
      channelId: this.selectedChannelId,
      message: this.messageText,
      requestKey: key
    };
    this.sending = true;
    this.messagePreview = false;
    this.sendBlocked = true;
    this.adminService.sendBotMessage(payload).pipe(takeUntil(this.destroyed$)).subscribe({
      next: result => {
        this.sentMessageId = result.messageId;
        this.sendError = '';
        this.sending = false;
      },
      error: () => {
        this.sendError = 'Envio sem confirmação. Confira o canal no Discord antes de criar uma nova solicitação, para evitar mensagens duplicadas.';
        this.sending = false;
      }
    });
  }

  formatUptime(seconds?: number): string {
    if (seconds === undefined) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }
}
