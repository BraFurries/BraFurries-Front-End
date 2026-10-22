import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import {
  CommunityAccess,
  CommunityAccessService,
  CommunitySummary
} from './community-access.service';
import {
  COMMUNITY_CONTEXT_STORAGE_KEY,
  CommunityContextService
} from './community-context.service';
import {
  ManagedServer,
  ManagedServersService
} from './managed-servers.service';

describe('CommunityContextService', () => {
  let service: CommunityContextService;
  let access: jasmine.SpyObj<CommunityAccessService>;
  let managed: jasmine.SpyObj<ManagedServersService>;

  const communities: CommunitySummary[] = [
    {
      communityId: 1,
      name: 'BraFurries',
      ownedByMe: true,
      ownerAssigned: true,
      member: true,
      networks: [{ type: 'DISCORD', externalId: '100', name: 'BraFurries', active: true }]
    },
    {
      communityId: 2,
      name: 'Outra',
      ownedByMe: false,
      ownerAssigned: true,
      member: true,
      networks: [{ type: 'DISCORD', externalId: '200', name: 'Outra', active: true }]
    }
  ];

  const accesses: Record<number, CommunityAccess> = {
    1: {
      communityId: 1,
      owner: true,
      communityAdmin: false,
      activeMember: true,
      canManageCommunityAdmins: true,
      activeRoleIds: [],
      capabilities: ['MEMBERS_VIEW', 'TEAM_VIEW'],
      teamScopes: []
    },
    2: {
      communityId: 2,
      owner: false,
      communityAdmin: false,
      activeMember: true,
      canManageCommunityAdmins: false,
      activeRoleIds: [9],
      capabilities: ['TEAM_VIEW'],
      teamScopes: []
    }
  };

  const servers: ManagedServer[] = [
    { guildId: '100', name: 'BraFurries', botOnline: true, iconUrl: 'https://cdn.example/brafurries.webp' },
    { guildId: '999', name: 'Outra guild', botOnline: true }
  ];

  beforeEach(() => {
    localStorage.removeItem(COMMUNITY_CONTEXT_STORAGE_KEY);
    access = jasmine.createSpyObj('CommunityAccessService', ['listCommunities', 'getAccess']);
    managed = jasmine.createSpyObj('ManagedServersService', ['getManagedServers']);
    access.listCommunities.and.returnValue(of(communities));
    access.getAccess.and.callFake(id => of(accesses[id]));
    managed.getManagedServers.and.returnValue(of(servers));

    TestBed.configureTestingModule({
      providers: [
        CommunityContextService,
        { provide: CommunityAccessService, useValue: access },
        { provide: ManagedServersService, useValue: managed }
      ]
    });
    service = TestBed.inject(CommunityContextService);
  });

  afterEach(() => localStorage.removeItem(COMMUNITY_CONTEXT_STORAGE_KEY));

  it('orders Communities as BraFurries, owned, administered and others', () => {
    const shuffled: CommunitySummary[] = [
      {
        communityId: 10,
        name: 'Outra A',
        ownedByMe: false,
        ownerAssigned: true,
        member: true,
        networks: [{ type: 'DISCORD', externalId: '10', name: 'Outra A', active: true }]
      },
      {
        communityId: 11,
        name: 'Admin A',
        ownedByMe: false,
        ownerAssigned: true,
        member: true,
        networks: [{ type: 'DISCORD', externalId: '11', name: 'Admin A', active: true }]
      },
      {
        communityId: 12,
        name: 'Dono A',
        ownedByMe: true,
        ownerAssigned: true,
        member: true,
        networks: [{ type: 'DISCORD', externalId: '12', name: 'Dono A', active: true }]
      },
      {
        communityId: 13,
        name: 'BraFurries renomeada',
        ownedByMe: false,
        ownerAssigned: true,
        member: true,
        networks: [{
          type: 'DISCORD',
          externalId: '753321055682035712',
          name: 'Servidor principal',
          active: true
        }]
      },
      {
        communityId: 14,
        name: 'Dono B',
        ownedByMe: true,
        ownerAssigned: true,
        member: true,
        networks: [{ type: 'DISCORD', externalId: '14', name: 'Dono B', active: true }]
      },
      {
        communityId: 15,
        name: 'Admin B',
        ownedByMe: false,
        ownerAssigned: true,
        member: true,
        networks: [{ type: 'DISCORD', externalId: '15', name: 'Admin B', active: true }]
      },
      {
        communityId: 16,
        name: 'Outra B',
        ownedByMe: false,
        ownerAssigned: true,
        member: true,
        networks: [{ type: 'DISCORD', externalId: '16', name: 'Outra B', active: true }]
      }
    ];

    access.listCommunities.and.returnValue(of(shuffled));
    access.getAccess.and.callFake(communityId => of({
      communityId,
      owner: false,
      communityAdmin: communityId === 11 || communityId === 15,
      activeMember: true,
      canManageCommunityAdmins: false,
      activeRoleIds: [],
      capabilities: [],
      teamScopes: []
    }));

    service.initialize().subscribe();

    expect(service.snapshot.communities.map(item => item.communityId)).toEqual([
      13, 12, 14, 11, 15, 10, 16
    ]);
    expect(service.snapshot.activeCommunity?.communityId).toBe(13);
  });

  it('restores the last visible Community from browser storage', () => {
    localStorage.setItem(COMMUNITY_CONTEXT_STORAGE_KEY, '2');

    service.initialize().subscribe();

    expect(service.snapshot.activeCommunity?.communityId).toBe(2);
    expect(access.getAccess).toHaveBeenCalledWith(2);
  });

  it('lets the URL preference win over stored Community', () => {
    localStorage.setItem(COMMUNITY_CONTEXT_STORAGE_KEY, '1');

    service.initialize(2).subscribe();

    expect(service.snapshot.activeCommunity?.communityId).toBe(2);
    expect(localStorage.getItem(COMMUNITY_CONTEXT_STORAGE_KEY)).toBe('2');
  });

  it('discards invalid storage and follows API order', () => {
    localStorage.setItem(COMMUNITY_CONTEXT_STORAGE_KEY, '999');

    service.initialize().subscribe();

    expect(service.snapshot.activeCommunity?.communityId).toBe(1);
    expect(localStorage.getItem(COMMUNITY_CONTEXT_STORAGE_KEY)).toBe('1');
  });

  it('never loads access for a Community absent from the visible list', () => {
    let kind = '';

    service.resolveCommunity(999).subscribe(result => kind = result.kind);

    expect(kind).toBe('not-visible');
    expect(access.getAccess).not.toHaveBeenCalledWith(999);
  });

  it('intersects Discord networks with actually managed guilds', () => {
    service.initialize(1).subscribe();

    expect(service.snapshot.managedDiscordServers.map(server => server.guildId)).toEqual(['100']);
    expect(service.canAccessFeature('coddy')).toBeTrue();

    service.resolveCommunity(2).subscribe();

    expect(service.snapshot.managedDiscordServers).toEqual([]);
    expect(service.canAccessFeature('coddy')).toBeFalse();
  });

  it('resolves the Community photo from its managed Discord network', () => {
    service.initialize(1).subscribe();

    expect(service.communityImageUrl(communities[0])).toBe('https://cdn.example/brafurries.webp');
    expect(service.communityImageUrl(communities[1])).toBeNull();
  });

  it('does not infer Coddy access from Community Admin', () => {
    access.getAccess.and.callFake(id => of({
      ...accesses[id],
      communityAdmin: true,
      capabilities: ['TEAM_VIEW', 'MEMBERS_VIEW']
    }));

    service.initialize(2).subscribe();

    expect(service.snapshot.activeAccess?.communityAdmin).toBeTrue();
    expect(service.canAccessFeature('coddy')).toBeFalse();
  });

  it('keeps Community features usable when managed-server discovery fails', () => {
    managed.getManagedServers.and.returnValue(throwError(() => new Error('offline')));

    service.initialize(1).subscribe();

    expect(service.snapshot.managedServersAvailable).toBeFalse();
    expect(service.canAccessFeature('membros')).toBeTrue();
    expect(service.canAccessFeature('coddy')).toBeFalse();
  });

  it('restricts recruitment navigation to actual BraFurries guild AND explicit capability', () => {
    const allowedAccess = {
      ...accesses[1],
      capabilities: ['RECRUITMENT_MANAGE_PROCESSES']
    };
    const braFurries = {
      ...communities[0],
      networks: [{
        type: 'DISCORD', externalId: '753321055682035712',
        name: 'Servidor principal', active: true
      }]
    };
    const state = {
      ...service.snapshot,
      activeCommunity: braFurries,
      activeAccess: allowedAccess
    };

    expect(service.canAccessFeature('inscricoes', state)).toBeTrue();
    expect(service.canAccessFeature('inscricoes', {
      ...state, activeAccess: {
        ...allowedAccess, activeMember: false
      }
    })).toBeFalse();
    expect(service.canAccessFeature('inscricoes', {
      ...state, activeCommunity: communities[1]
    })).toBeFalse();
    expect(service.canAccessFeature('triagem', state)).toBeFalse();
    expect(service.canAccessFeature('triagem', {
      ...state, activeAccess: {
        ...allowedAccess, capabilities: ['RECRUITMENT_REVIEW_APPLICATIONS']
      }
    })).toBeTrue();
    expect(service.canAccessFeature('triagem', {
      ...state, activeCommunity: communities[1],
      activeAccess: {
        ...allowedAccess, capabilities: ['RECRUITMENT_REVIEW_APPLICATIONS']
      }
    })).toBeFalse();
    expect(service.canAccessFeature('recrutamento', state)).toBeTrue();
    expect(service.canAccessFeature('recrutamento', {
      ...state, activeAccess: {
        ...allowedAccess, capabilities: ['RECRUITMENT_PUBLISH_PROCESSES']
      }
    })).toBeTrue();
    expect(service.canAccessFeature('recrutamento', {
      ...state, activeCommunity: communities[1]
    })).toBeFalse();
    expect(service.canAccessFeature('recrutamento', {
      ...state, activeAccess: {
        ...allowedAccess, capabilities: ['TEAM_VIEW']
      }
    })).toBeFalse();
    expect(service.scopedLocation('/painel/comunidades/7/recrutamento')).toEqual({
      communityId: 7,
      feature: 'recrutamento'
    });
  });

  it('parses only canonical scoped URLs', () => {
    expect(service.scopedLocation('/painel/comunidades/7/membros')).toEqual({
      communityId: 7,
      feature: 'membros'
    });
    expect(service.scopedLocation('/painel/membros')).toBeNull();
    expect(service.scopedLocation('/painel/comunidades')).toBeNull();
  });
});
