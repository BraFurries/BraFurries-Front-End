import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import {
  CommunityActivityActor,
  CommunityActivityCategory,
  CommunityActivityEvent,
  CommunityActivityService
} from '../../../core/services/community-activity.service';

interface ActivityGroup {
  label: string;
  items: CommunityActivityEvent[];
}

@Component({
  selector: 'app-community-activity',
  standalone: false,
  templateUrl: './community-activity.component.html'
})
export class CommunityActivityComponent implements OnInit, OnDestroy {

  events: CommunityActivityEvent[] = [];
  actors: CommunityActivityActor[] = [];
  nextCursor: string | null = null;
  hasMore = false;

  category: CommunityActivityCategory | '' = '';
  actorUserId: number | null = null;
  fromDate = '';
  toDate = '';

  loadingActivity = false;
  loadingMore = false;
  loadingActors = false;
  errorMessage = '';

  private readonly destroy$ = new Subject<void>();
  private activeCommunityId: number | null = null;

  private readonly knownActions = new Set([
    'TEAM_MEMBER_ASSIGNED',
    'TEAM_MEMBER_REMOVED',
    'TEAM_ROLE_CREATED',
    'TEAM_ROLE_UPDATED',
    'TEAM_ROLE_ACTIVE_CHANGED',
    'TEAM_ROLE_DELETED',
    'TEAM_DEMAND_CREATED',
    'TEAM_DEMAND_UPDATED',
    'TEAM_DEMAND_DELETED',
    'COMMUNITY_CAPABILITY_GRANTED',
    'COMMUNITY_CAPABILITY_REVOKED',
    'TEAM_ROLE_CAPABILITY_GRANTED',
    'TEAM_ROLE_CAPABILITY_REVOKED',
    'MEMBER_NOTE_CREATED',
    'MEMBER_NOTE_UPDATED',
    'MEMBER_NOTE_ARCHIVED',
    'COMMUNITY_OWNER_SYNCHRONIZED',
    'COMMUNITY_OWNER_UNRESOLVED',
    'XP_CONFIG_UPDATED'
  ]);

  private activityGeneration = 0;
  private actorGeneration = 0;

  constructor(
    private readonly communityContext: CommunityContextService,
    private readonly activity: CommunityActivityService
  ) {}

  get selectedCommunityId(): number | null {
    return this.communityContext.snapshot.activeCommunity?.communityId ?? null;
  }

  ngOnInit(): void {
    this.communityContext.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => this.applyCommunityContext(state));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private applyCommunityContext(state: CommunityContextState): void {
    const communityId = state.activeCommunity?.communityId ?? null;
    if (
      state.status !== 'ready'
      || communityId === null
      || !state.activeAccess
      || communityId === this.activeCommunityId
    ) return;

    this.activeCommunityId = communityId;
    this.category = '';
    this.actorUserId = null;
    this.fromDate = '';
    this.toDate = '';
    this.resetActivity();
    this.loadActors();
    this.loadActivity(true);
  }

  applyFilters(): void {
    this.loadActivity(true);
  }

  clearFilters(): void {
    this.category = '';
    this.actorUserId = null;
    this.fromDate = '';
    this.toDate = '';
    this.loadActivity(true);
  }

  loadMore(): void {
    if (!this.hasMore || !this.nextCursor || this.loadingMore || this.selectedCommunityId == null) return;
    this.loadActivity(false);
  }

  groupedEvents(): ActivityGroup[] {
    const groups: ActivityGroup[] = [];
    for (const event of this.events) {
      const label = this.dayLabel(event.createdAt);
      const last = groups[groups.length - 1];
      if (last?.label === label) {
        last.items.push(event);
      } else {
        groups.push({ label, items: [event] });
      }
    }
    return groups;
  }

  eventText(event: CommunityActivityEvent): string {
    if (event.action === 'COMMUNITY_OWNER_SYNCHRONIZED') {
      return 'A propriedade da Community foi sincronizada com o Discord';
    }
    if (event.action === 'COMMUNITY_OWNER_UNRESOLVED') {
      return 'A propriedade da Community não pôde ser associada a um usuário';
    }

    const actor = event.actor?.displayName || 'Sistema';
    const details = event.details;
    const target = event.target?.displayName || 'item administrativo';

    switch (event.action) {
      case 'TEAM_MEMBER_ASSIGNED':
        return `${actor} adicionou ${details.userDisplayName || 'um membro'} ao cargo ${details.roleName || 'removido'}`;
      case 'TEAM_MEMBER_REMOVED':
        return `${actor} removeu ${details.userDisplayName || 'um membro'} do cargo ${details.roleName || 'removido'}`;
      case 'TEAM_ROLE_CREATED':
        return `${actor} criou o cargo ${target}`;
      case 'TEAM_ROLE_UPDATED':
        return `${actor} atualizou o cargo ${target}`;
      case 'TEAM_ROLE_ACTIVE_CHANGED':
        return `${actor} ${details.active ? 'ativou' : 'desativou'} o cargo ${target}`;
      case 'TEAM_ROLE_DELETED':
        return `${actor} removeu ${target}`;
      case 'TEAM_DEMAND_CREATED':
        return `${actor} criou a demanda ${target}`;
      case 'TEAM_DEMAND_UPDATED':
        return `${actor} atualizou a demanda ${target}`;
      case 'TEAM_DEMAND_DELETED':
        return `${actor} removeu ${target}`;
      case 'COMMUNITY_CAPABILITY_GRANTED':
        return `${actor} concedeu ${this.capabilityLabel(details.capability)} a ${details.userDisplayName || target}`;
      case 'COMMUNITY_CAPABILITY_REVOKED':
        return `${actor} removeu ${this.capabilityLabel(details.capability)} de ${details.userDisplayName || target}`;
      case 'TEAM_ROLE_CAPABILITY_GRANTED':
        return `${actor} concedeu ${this.capabilityLabel(details.capability)} ao cargo ${details.roleName || target}`;
      case 'TEAM_ROLE_CAPABILITY_REVOKED':
        return `${actor} removeu ${this.capabilityLabel(details.capability)} do cargo ${details.roleName || target}`;
      case 'MEMBER_NOTE_CREATED':
        return `${actor} criou uma nota interna sobre ${details.memberDisplayName || 'um membro'}`;
      case 'MEMBER_NOTE_UPDATED':
        return `${actor} atualizou uma nota interna sobre ${details.memberDisplayName || 'um membro'}`;
      case 'MEMBER_NOTE_ARCHIVED':
        return `${actor} arquivou uma nota interna sobre ${details.memberDisplayName || 'um membro'}`;
      case 'XP_CONFIG_UPDATED':
        return `${actor} atualizou a configuração de XP & Leveling de ${target}`;
      default:
        return 'Foi registrada uma atividade administrativa';
    }
  }

  categoryLabel(category: CommunityActivityCategory): string {
    const labels: Record<CommunityActivityCategory, string> = {
      TEAM: 'Equipe',
      ACCESS: 'Acessos',
      NOTES: 'Notas',
      COMMUNITY: 'Community / Sistema',
      OTHER: 'Outros'
    };
    return labels[category];
  }

  categoryBadgeClass(category: CommunityActivityCategory): string {
    const classes: Record<CommunityActivityCategory, string> = {
      TEAM: 'bg-cyan-50 text-cyan-700',
      ACCESS: 'bg-purple-50 text-purple-700',
      NOTES: 'bg-amber-50 text-amber-700',
      COMMUNITY: 'bg-gray-100 text-gray-700',
      OTHER: 'bg-gray-100 text-gray-600'
    };
    return classes[category];
  }

  capabilityLabel(code: string | null): string {
    if (!code) return 'uma capability';
    const labels: Record<string, string> = {
      COMMUNITY_ADMIN: 'Administrador da Community',
      TEAM_VIEW: 'Ver Times',
      TEAM_ASSIGN_MEMBERS: 'Atribuir membros aos cargos',
      TEAM_MANAGE_STRUCTURE: 'Gerenciar estrutura dos Times',
      TEAM_MANAGE_DEMANDS: 'Gerenciar demandas dos Times',
      MEMBERS_VIEW: 'Ver membros',
      MEMBER_DETAILS_VIEW: 'Ver detalhes e gerenciar membros',
      MEMBER_NOTES_VIEW: 'Ver notas internas',
      MEMBER_NOTES_MANAGE: 'Gerenciar notas internas'
    };
    return labels[code] ?? code;
  }

  formatTime(createdAt: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(createdAt));
  }

  isUnknown(event: CommunityActivityEvent): boolean {
    return !this.knownActions.has(event.action);
  }

  actorInitial(actor: CommunityActivityActor | null): string {
    return actor?.displayName.trim().charAt(0).toUpperCase() || '?';
  }

  hasActiveFilters(): boolean {
    return !!this.category || this.actorUserId !== null || !!this.fromDate || !!this.toDate;
  }

  private loadActors(): void {
    if (this.selectedCommunityId == null) return;
    const communityId = this.selectedCommunityId;
    const generation = ++this.actorGeneration;
    this.loadingActors = true;
    this.actors = [];

    this.activity.actors(communityId).subscribe({
      next: actors => {
        if (communityId !== this.selectedCommunityId || generation !== this.actorGeneration) return;
        this.actors = actors;
        this.loadingActors = false;
      },
      error: () => {
        if (communityId !== this.selectedCommunityId || generation !== this.actorGeneration) return;
        this.actors = [];
        this.loadingActors = false;
      }
    });
  }

  private loadActivity(reset: boolean): void {
    if (this.selectedCommunityId == null) return;

    const communityId = this.selectedCommunityId;
    if (reset) {
      this.activityGeneration++;
      this.events = [];
      this.nextCursor = null;
      this.hasMore = false;
    }
    const generation = this.activityGeneration;
    reset ? this.loadingActivity = true : this.loadingMore = true;
    this.errorMessage = '';

    this.activity.list(communityId, {
      category: this.category,
      actorUserId: this.actorUserId,
      from: this.fromDate ? `${this.fromDate}T00:00:00` : undefined,
      to: this.toDate ? `${this.toDate}T23:59:59.999999` : undefined,
      cursor: reset ? null : this.nextCursor,
      limit: 30
    }).subscribe({
      next: response => {
        if (communityId !== this.selectedCommunityId || generation !== this.activityGeneration) return;
        this.events = reset ? response.items : [...this.events, ...response.items];
        this.nextCursor = response.nextCursor;
        this.hasMore = response.hasMore;
        this.loadingActivity = false;
        this.loadingMore = false;
      },
      error: error => {
        if (communityId !== this.selectedCommunityId || generation !== this.activityGeneration) return;
        this.loadingActivity = false;
        this.loadingMore = false;
        this.errorMessage = error?.error?.message || 'Não foi possível carregar a atividade da Community.';
      }
    });
  }

  private resetActivity(): void {
    this.activityGeneration++;
    this.actorGeneration++;
    this.events = [];
    this.actors = [];
    this.nextCursor = null;
    this.hasMore = false;
    this.loadingActivity = false;
    this.loadingMore = false;
    this.loadingActors = false;
    this.errorMessage = '';
  }

  private dayLabel(createdAt: string): string {
    const date = new Date(createdAt);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (this.sameDay(date, today)) return 'Hoje';
    if (this.sameDay(date, yesterday)) return 'Ontem';

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
    }).format(date);
  }

  private sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }
}
