import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, catchError, finalize, forkJoin, of, switchMap, takeUntil, takeWhile, timer } from 'rxjs';

import {
  CommunityAccess,
  CommunityAccessService,
  CommunitySummary,
  CommunitySyncRun
} from '../../../core/services/community-access.service';

@Component({
  selector: 'app-communities',
  standalone: false,
  templateUrl: './communities.component.html'
})
export class CommunitiesComponent implements OnInit, OnDestroy {
  communities: CommunitySummary[] = [];
  loading = true;
  errorMessage = '';
  successMessage = '';

  readonly accessByCommunity = new Map<number, CommunityAccess>();
  readonly syncByCommunity = new Map<number, CommunitySyncRun | null>();
  readonly syncingCommunityIds = new Set<number>();
  private readonly pollingCommunityIds = new Set<number>();
  private readonly destroy$ = new Subject<void>();
  private loadGeneration = 0;

  constructor(private readonly communityAccess: CommunityAccessService) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    const generation = ++this.loadGeneration;
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.accessByCommunity.clear();
    this.syncByCommunity.clear();

    this.communityAccess.listCommunities().subscribe({
      next: communities => {
        if (generation !== this.loadGeneration) return;
        this.communities = communities;
        this.loading = false;
        this.loadOperationalState(communities, generation);
      },
      error: error => {
        if (generation !== this.loadGeneration) return;
        this.communities = [];
        this.loading = false;
        this.errorMessage = error?.error?.message || 'Não foi possível carregar suas Comunidades.';
      }
    });
  }

  canSync(community: CommunitySummary): boolean {
    const access = this.accessByCommunity.get(community.communityId);
    return access?.owner === true || access?.communityAdmin === true;
  }

  syncInProgress(communityId: number): boolean {
    if (this.syncingCommunityIds.has(communityId)) return true;
    const status = this.syncByCommunity.get(communityId)?.status;
    return status === 'QUEUED' || status === 'RUNNING';
  }

  requestSync(community: CommunitySummary): void {
    const communityId = community.communityId;
    if (!this.canSync(community) || this.syncInProgress(communityId)) return;

    this.syncingCommunityIds.add(communityId);
    this.errorMessage = '';
    this.successMessage = '';

    this.communityAccess.requestSync(communityId).subscribe({
      next: () => {
        this.successMessage = `Sincronização de "${community.name}" solicitada ao Coddy.`;
        this.pollSync(communityId);
      },
      error: error => {
        this.syncingCommunityIds.delete(communityId);
        this.errorMessage = error?.error?.message || 'Não foi possível solicitar a sincronização.';
      }
    });
  }

  networkLabel(type: string): string {
    return type === 'DISCORD' ? 'Discord' : type;
  }

  syncStatusLabel(sync: CommunitySyncRun | null | undefined): string {
    switch (sync?.status) {
      case 'QUEUED': return 'Aguardando o Coddy';
      case 'RUNNING': return 'Sincronizando';
      case 'SUCCESS': return 'Sincronizado';
      case 'FAILED': return 'Falha na sincronização';
      default: return 'Ainda não sincronizada';
    }
  }

  private loadOperationalState(communities: CommunitySummary[], generation: number): void {
    for (const community of communities) {
      const communityId = community.communityId;
      forkJoin({
        access: this.communityAccess.getAccess(communityId).pipe(catchError(() => of(null))),
        sync: this.communityAccess.getLatestSync(communityId).pipe(catchError(() => of(null)))
      }).subscribe(({ access, sync }) => {
        if (generation !== this.loadGeneration) return;
        if (access) this.accessByCommunity.set(communityId, access);
        this.syncByCommunity.set(communityId, sync);
        if (sync?.status === 'QUEUED' || sync?.status === 'RUNNING') {
          this.pollSync(communityId);
        }
      });
    }
  }

  private pollSync(communityId: number): void {
    if (this.pollingCommunityIds.has(communityId)) return;
    this.pollingCommunityIds.add(communityId);

    timer(0, 3000).pipe(
      switchMap(() => this.communityAccess.getLatestSync(communityId).pipe(
        catchError(() => of(null))
      )),
      takeWhile(
        sync => sync?.status === 'QUEUED' || sync?.status === 'RUNNING',
        true
      ),
      takeUntil(this.destroy$),
      finalize(() => {
        this.pollingCommunityIds.delete(communityId);
        this.syncingCommunityIds.delete(communityId);
      })
    ).subscribe(sync => {
      this.syncByCommunity.set(communityId, sync);
    });
  }
}
