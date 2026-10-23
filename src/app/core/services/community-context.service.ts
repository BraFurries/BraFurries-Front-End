import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  forkJoin,
  map,
  of,
  shareReplay,
  switchMap,
  tap
} from 'rxjs';

import {
  CommunityAccess,
  CommunityAccessService,
  CommunitySummary
} from './community-access.service';
import {
  ManagedServer,
  ManagedServersService
} from './managed-servers.service';

export const COMMUNITY_CONTEXT_STORAGE_KEY = 'brafurries.activeCommunityId';
const BRAFURRIES_MAIN_GUILD_ID = '753321055682035712';

export type CommunityScopedFeature = 'membros' | 'times' | 'recrutamento' | 'triagem' | 'inscricoes' | 'acessos' | 'atividade' | 'coddy';
export type CommunityContextStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CommunityContextState {
  status: CommunityContextStatus;
  communities: CommunitySummary[];
  activeCommunity: CommunitySummary | null;
  activeAccess: CommunityAccess | null;
  managedDiscordServers: ManagedServer[];
  managedServersAvailable: boolean;
  errorMessage: string;
}

export type CommunityContextResolution =
  | { kind: 'ready'; state: CommunityContextState }
  | { kind: 'empty'; state: CommunityContextState }
  | { kind: 'not-visible'; state: CommunityContextState }
  | { kind: 'denied'; state: CommunityContextState }
  | { kind: 'error'; state: CommunityContextState };

interface BaseContext {
  communities: CommunitySummary[];
  managedServers: ManagedServer[];
  managedServersAvailable: boolean;
}

@Injectable({ providedIn: 'root' })
export class CommunityContextService {
  private readonly stateSubject = new BehaviorSubject<CommunityContextState>({
    status: 'idle',
    communities: [],
    activeCommunity: null,
    activeAccess: null,
    managedDiscordServers: [],
    managedServersAvailable: true,
    errorMessage: ''
  });

  readonly state$ = this.stateSubject.asObservable();

  private baseCache?: BaseContext;
  private baseRequest$?: Observable<BaseContext>;

  constructor(
    private readonly communityAccess: CommunityAccessService,
    private readonly managedServers: ManagedServersService
  ) {}

  get snapshot(): CommunityContextState {
    return this.stateSubject.value;
  }

  initialize(preferredCommunityId: number | null = null): Observable<CommunityContextResolution> {
    return this.loadBase().pipe(
      switchMap(base => {
        if (!base.communities.length) {
          this.clearStoredCommunity();
          const state = this.patch({
            status: 'ready',
            communities: [],
            activeCommunity: null,
            activeAccess: null,
            managedDiscordServers: [],
            managedServersAvailable: base.managedServersAvailable,
            errorMessage: ''
          });
          return of({ kind: 'empty', state } as CommunityContextResolution);
        }

        if (preferredCommunityId !== null) {
          return this.resolveFromBase(base, preferredCommunityId);
        }

        const stored = this.readStoredCommunity();
        const storedVisible = stored !== null
          && base.communities.some(community => community.communityId === stored);

        if (stored !== null && !storedVisible) {
          this.clearStoredCommunity();
        }

        const targetId = storedVisible
          ? stored!
          : base.communities[0].communityId;

        return this.resolveFromBase(base, targetId);
      }),
      catchError(error => of(this.baseError(error)))
    );
  }

  resolveCommunity(
    communityId: number,
    forceRefresh = false
  ): Observable<CommunityContextResolution> {
    return this.loadBase(forceRefresh).pipe(
      switchMap(base => this.resolveFromBase(base, communityId, forceRefresh)),
      catchError(error => of(this.baseError(error)))
    );
  }

  selectCommunity(communityId: number): Observable<CommunityContextResolution> {
    return this.resolveCommunity(communityId);
  }

  refreshActiveAccess(): Observable<CommunityAccess | null> {
    const active = this.snapshot.activeCommunity;
    if (!active) return of(null);

    return this.communityAccess.getAccess(active.communityId).pipe(
      tap(access => {
        if (this.snapshot.activeCommunity?.communityId !== active.communityId) return;
        this.patch({ activeAccess: access, status: 'ready', errorMessage: '' });
      }),
      catchError(() => of(null))
    );
  }

  canAccessFeature(
    feature: CommunityScopedFeature,
    state = this.snapshot
  ): boolean {
    const access = state.activeAccess;
    if (!state.activeCommunity || !access) return false;

    switch (feature) {
      case 'membros':
        return access.capabilities.includes('MEMBERS_VIEW');
      case 'times':
        return access.capabilities.includes('TEAM_VIEW');
      case 'inscricoes':
        return this.isBraFurriesCommunity(state.activeCommunity) && access.activeMember;
      case 'triagem':
        return this.isBraFurriesCommunity(state.activeCommunity)
          && access.capabilities.includes('RECRUITMENT_REVIEW_APPLICATIONS');
      case 'recrutamento':
        return this.isBraFurriesCommunity(state.activeCommunity)
          && (access.capabilities.includes('RECRUITMENT_MANAGE_PROCESSES')
            || access.capabilities.includes('RECRUITMENT_PUBLISH_PROCESSES'));
      case 'acessos':
      case 'atividade':
        return access.owner || access.communityAdmin;
      case 'coddy':
        return state.managedServersAvailable && state.managedDiscordServers.length > 0;
    }
  }

  communityImageUrl(community: CommunitySummary | null): string | null {
    if (!community || !this.baseCache) return null;

    const guildIds = new Set(
      community.networks
        .filter(network => network.type === 'DISCORD' && network.active !== false)
        .map(network => network.externalId)
    );

    return this.baseCache.managedServers.find(
      server => guildIds.has(server.guildId) && !!server.iconUrl
    )?.iconUrl ?? null;
  }

  featureLabel(feature: CommunityScopedFeature): string {
    const labels: Record<CommunityScopedFeature, string> = {
      membros: 'Membros',
      times: 'Times',
      recrutamento: 'Processos seletivos',
      triagem: 'Triagem de candidaturas',
      inscricoes: 'Inscrições',
      acessos: 'Acessos',
      atividade: 'Atividade',
      coddy: 'Coddy'
    };
    return labels[feature];
  }

  scopedLocation(url: string): { communityId: number; feature: CommunityScopedFeature } | null {
    const path = url.split(/[?#]/, 1)[0];
    const match = path.match(
      /^\/painel\/comunidades\/(\d+)\/(membros|times|recrutamento|triagem|inscricoes|acessos|atividade|coddy)(?:\/|$)/
    );
    if (!match) return null;
    return {
      communityId: Number(match[1]),
      feature: match[2] as CommunityScopedFeature
    };
  }

  private loadBase(forceRefresh = false): Observable<BaseContext> {
    if (forceRefresh) {
      this.baseCache = undefined;
      this.baseRequest$ = undefined;
    }

    if (this.baseCache) return of(this.baseCache);
    if (this.baseRequest$) return this.baseRequest$;

    this.patch({ status: 'loading', errorMessage: '' });

    const request$ = forkJoin({
      communities: this.communityAccess.listCommunities(),
      managed: this.managedServers.getManagedServers().pipe(
        map(servers => ({ servers, available: true })),
        catchError(() => of({ servers: [] as ManagedServer[], available: false }))
      )
    }).pipe(
      switchMap(({ communities, managed }) =>
        this.orderCommunities(communities).pipe(
          map(orderedCommunities => ({
            communities: orderedCommunities,
            managedServers: managed.servers,
            managedServersAvailable: managed.available
          }))
        )
      ),
      tap(base => {
        this.baseCache = base;
        this.patch({
          communities: base.communities,
          managedServersAvailable: base.managedServersAvailable
        });
      }),
      finalize(() => {
        if (this.baseRequest$ === request$) this.baseRequest$ = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.baseRequest$ = request$;
    return request$;
  }

  private orderCommunities(communities: CommunitySummary[]): Observable<CommunitySummary[]> {
    if (!communities.length) return of([]);

    return forkJoin(
      communities.map((community, index) => {
        if (this.isBraFurriesCommunity(community) || community.ownedByMe) {
          return of({ community, index, access: null as CommunityAccess | null });
        }

        return this.communityAccess.getAccess(community.communityId).pipe(
          map(access => ({ community, index, access })),
          catchError(() => of({ community, index, access: null as CommunityAccess | null }))
        );
      })
    ).pipe(
      map(items => items
        .sort((left, right) =>
          this.communityPriority(left.community, left.access) -
            this.communityPriority(right.community, right.access) ||
          left.index - right.index
        )
        .map(({ community }) => community)
      )
    );
  }

  private communityPriority(
    community: CommunitySummary,
    access: CommunityAccess | null
  ): number {
    if (this.isBraFurriesCommunity(community)) return 0;
    if (community.ownedByMe || access?.owner) return 1;
    if (access?.communityAdmin) return 2;
    return 3;
  }

  private isBraFurriesCommunity(community: CommunitySummary): boolean {
    return community.networks.some(network =>
      network.type === 'DISCORD'
      && network.externalId === BRAFURRIES_MAIN_GUILD_ID
    );
  }

  private resolveFromBase(
    base: BaseContext,
    communityId: number,
    forceAccess = false
  ): Observable<CommunityContextResolution> {
    const community = base.communities.find(item => item.communityId === communityId);

    if (!community) {
      const state = this.patch({
        status: 'ready',
        communities: base.communities,
        managedServersAvailable: base.managedServersAvailable,
        errorMessage: ''
      });
      return of({ kind: 'not-visible', state });
    }

    const managedDiscordServers = this.intersectManagedDiscords(community, base.managedServers);
    const previous = this.snapshot;

    if (
      !forceAccess
      && previous.activeCommunity?.communityId === communityId
      && previous.activeAccess
    ) {
      const state = this.patch({
        status: 'ready',
        communities: base.communities,
        activeCommunity: community,
        managedDiscordServers,
        managedServersAvailable: base.managedServersAvailable,
        errorMessage: ''
      });
      this.persistCommunity(communityId);
      return of({ kind: 'ready', state });
    }

    this.patch({
      status: 'loading',
      communities: base.communities,
      activeCommunity: community,
      activeAccess: null,
      managedDiscordServers,
      managedServersAvailable: base.managedServersAvailable,
      errorMessage: ''
    });
    this.persistCommunity(communityId);

    return this.communityAccess.getAccess(communityId).pipe(
      map(access => {
        const state = this.patch({
          status: 'ready',
          activeCommunity: community,
          activeAccess: access,
          managedDiscordServers,
          managedServersAvailable: base.managedServersAvailable,
          errorMessage: ''
        });
        return { kind: 'ready', state } as CommunityContextResolution;
      }),
      catchError(error => {
        if (error?.status === 403 || error?.status === 404) {
          const state = this.patch({
            status: 'ready',
            activeCommunity: community,
            activeAccess: null,
            managedDiscordServers,
            managedServersAvailable: base.managedServersAvailable,
            errorMessage: ''
          });
          return of({ kind: 'denied', state } as CommunityContextResolution);
        }

        const state = this.patch({
          status: 'error',
          activeCommunity: community,
          activeAccess: null,
          managedDiscordServers,
          managedServersAvailable: base.managedServersAvailable,
          errorMessage: error?.error?.message || 'Não foi possível carregar o contexto desta Community.'
        });
        return of({ kind: 'error', state } as CommunityContextResolution);
      })
    );
  }

  private intersectManagedDiscords(
    community: CommunitySummary,
    servers: ManagedServer[]
  ): ManagedServer[] {
    const guildIds = new Set(
      community.networks
        .filter(network => network.type === 'DISCORD' && network.active !== false)
        .map(network => network.externalId)
    );

    return servers.filter(server => guildIds.has(server.guildId));
  }

  private baseError(error: any): CommunityContextResolution {
    const state = this.patch({
      status: 'error',
      errorMessage: error?.error?.message || 'Não foi possível carregar suas Communities.'
    });
    return { kind: 'error', state };
  }

  private patch(patch: Partial<CommunityContextState>): CommunityContextState {
    const state = { ...this.stateSubject.value, ...patch };
    this.stateSubject.next(state);
    return state;
  }

  private readStoredCommunity(): number | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(COMMUNITY_CONTEXT_STORAGE_KEY);
      if (!raw) return null;

      const value = Number(raw);
      if (Number.isInteger(value) && value > 0) return value;

      localStorage.removeItem(COMMUNITY_CONTEXT_STORAGE_KEY);
      return null;
    } catch {
      return null;
    }
  }

  private persistCommunity(communityId: number): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(COMMUNITY_CONTEXT_STORAGE_KEY, String(communityId));
      }
    } catch {
      // Storage is an optional UX optimization.
    }
  }

  private clearStoredCommunity(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(COMMUNITY_CONTEXT_STORAGE_KEY);
      }
    } catch {
      // Storage is an optional UX optimization.
    }
  }
}
