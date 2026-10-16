import { AdminUserProfileComponent } from './perfil-usuario.component';
import { of, Subject, throwError } from 'rxjs';

function profile(role: 'member' | 'supporter' | 'moderator' | 'admin' = 'member'): any {
  return {
    identity: { id: 1, displayName: 'Furry', username: 'furry', status: 'active', role, localeAmbiguous: false, discordAmbiguous: false, telegramAmbiguous: false },
    firstKnownAt: '2026-01-01',
    firstKnownCommunity: { id: 5, name: 'BraFurries' },
    communities: [{ statusRecordId: 50, id: 5, name: 'BraFurries', status: 'approved', vip: true, partner: false, discordActive: true }],
    moderation: {
      totalWarnings: 1, activeWarnings: 1, totalBans: 0, activeBans: 0, expiredBans: 0, revokedBans: 0,
      records: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 }
    }
  };
}

function identity(): any {
  return {
    requestedUserId: 1,
    confirmedAccounts: [
      { userId: 1, displayName: 'Furry', discordAccounts: [] },
      { userId: 2, displayName: 'Alt', discordAccounts: [] },
      { userId: 3, displayName: 'Outro alt', discordAccounts: [] }
    ],
    confirmedLinks: [
      {
        id: 11,
        userA: { userId: 1, displayName: 'Furry', discordAccounts: [] },
        userB: { userId: 2, displayName: 'Alt', discordAccounts: [] },
        status: 'CONFIRMED',
        source: 'ADMIN',
        reason: 'confirmado',
        createdByUserId: 99,
        createdAt: '2026-09-30T10:00:00'
      },
      {
        id: 12,
        userA: { userId: 2, displayName: 'Alt', discordAccounts: [] },
        userB: { userId: 3, displayName: 'Outro alt', discordAccounts: [] },
        status: 'CONFIRMED',
        source: 'ADMIN',
        reason: 'confirmado',
        createdByUserId: 99,
        createdAt: '2026-09-30T11:00:00'
      }
    ],
    suspectedLinks: []
  };
}

function history(): any {
  return { requestedUserId: 1, communityId: 5, confirmedUserIds: [1, 2, 3], warnings: [], bans: [], notes: [], suspectedLinks: [] };
}

function reliability(): any {
  return {
    user: { id: 1 },
    moderation: { totalWarnings: 1, activeWarnings: 1, expiredWarnings: 0, warnedServers: 1, averageWarningsPerWarnedServer: 1, totalBans: 0, activeBans: 0, expiredBans: 0, revokedBans: 0, bannedServers: 0, warningsByServer: [] },
    events: { managedEvents: 2, ownedEvents: 1, ownedApprovedEvents: 1, ownedPendingEvents: 0, ownedRejectedEvents: 0, ownedPartnerEvents: 0, staffEvents: 1, staffEventsWithManageStaff: 1, staffEventsWithEditEvent: 0, staffEventsWithManageAgenda: 1 },
    communities: { memberships: 1, approvedMemberships: 1, bannedMemberships: 0, vipMemberships: 1, partnerMemberships: 0 },
    account: { linkedDiscord: true, linkedTelegram: false, discordAmbiguous: false, telegramAmbiguous: false },
    reliability: { score: 91, level: 'alta', signals: ['ja_gerenciou_eventos_aprovados'] }
  };
}

function createComponent(adminService: any, routeId = '1', isAdmin = true): AdminUserProfileComponent {
  return new AdminUserProfileComponent(
    { snapshot: { paramMap: { get: () => routeId } } } as any,
    { navigate: jasmine.createSpy('navigate') } as any,
    adminService,
    { isAdmin: () => isAdmin } as any
  );
}

describe('AdminUserProfileComponent helpers', () => {
  const component = new AdminUserProfileComponent(
    { snapshot: { paramMap: { get: () => '1' } } } as any,
    {} as any,
    {} as any,
    { isAdmin: () => true } as any
  );

  it('preserves the three presence states', () => {
    expect(component.presenceLabel(true)).toBe('Presente');
    expect(component.presenceLabel(false)).toBe('Não está mais nesta comunidade');
    expect(component.presenceLabel(null)).toBe('Presença ainda não verificada');
  });

  it('formats civil dates without a timezone shift', () => {
    expect(component.formatDate('2026-09-10')).toBe('10/09/2026');
  });

  it('translates every ban status', () => {
    expect(component.banStatusLabel('active')).toBe('Ativo');
    expect(component.banStatusLabel('expired')).toBe('Expirado');
    expect(component.banStatusLabel('revoked')).toBe('Revogado');
  });


  it('searches existing account candidates through the admin list without creating a link', () => {
    const getUsers = jasmine.createSpy('getUsers').and.returnValue(of({
      items: [
        { id: 1, name: 'Own User', discordUsername: 'self' },
        { id: 9708, name: 'Usuario 9708', discordUsername: 'dve0730' }
      ],
      pagination: { totalItems: 2, page: 1, pageSize: 20, totalPages: 1 }
    }));
    const createUserIdentityLink = jasmine.createSpy('createUserIdentityLink');
    const c = createComponent({ getUsers, createUserIdentityLink });
    c.userId = 1;
    c.linkSearchTerm = 'dve';
    c.searchLinkTargets();

    expect(getUsers).toHaveBeenCalledWith({ page: 1, pageSize: 20, search: 'dve' });
    expect(c.linkSearchResults.map(result => result.id)).toEqual([9708]);
    expect(c.linkSearchTotal).toBe(2);
    expect(createUserIdentityLink).not.toHaveBeenCalled();
  });

  it('selects a search result by internal User ID and retains the two-stage preview', () => {
    const getUserIdentity = jasmine.createSpy('getUserIdentity').and.returnValue(of({
      confirmedAccounts: [{ userId: 9708, displayName: 'Alt', discordAccounts: [] }]
    }));
    const createUserIdentityLink = jasmine.createSpy('createUserIdentityLink');
    const c = createComponent({ getUserIdentity, createUserIdentityLink });
    c.userId = 1;
    c.selectLinkSearchResult({ id: 9708, name: 'Alt', discordUsername: 'dve0730', status: 'active', role: 'member' });

    expect(c.linkTargetId).toBe(9708);
    expect(getUserIdentity).toHaveBeenCalledWith(9708);
    expect(c.linkPreviewModalOpen).toBeTrue();
    expect(c.linkConfirmModalOpen).toBeFalse();
    expect(createUserIdentityLink).not.toHaveBeenCalled();
  });

  it('discards out-of-order candidate searches after the query changes', () => {
    const first = new Subject<any>();
    const second = new Subject<any>();
    const getUsers = jasmine.createSpy('getUsers').and.returnValues(first, second);
    const c = createComponent({ getUsers });
    c.userId = 1;
    c.linkSearchTerm = 'old';
    c.searchLinkTargets();
    c.linkSearchTerm = 'dve';
    c.onLinkSearchTermChange();
    c.searchLinkTargets();

    first.next({ items: [{ id: 99 }], pagination: { totalItems: 1 } });
    expect(c.linkSearchResults.length).toBe(0);

    second.next({ items: [{ id: 9708 }], pagination: { totalItems: 1 } });
    expect(c.linkSearchResults.map(candidate => candidate.id)).toEqual([9708]);
    expect(c.linkSearchLoading).toBeFalse();
  });

  it('does not offer a confirmed-cluster account as a new link target', () => {
    const getUserIdentity = jasmine.createSpy('getUserIdentity');
    const c = createComponent({ getUserIdentity });
    c.userId = 1;
    c.identity = identity();
    expect(c.isAlreadyLinkedCandidate(1)).toBeTrue();
    expect(c.isAlreadyLinkedCandidate(2)).toBeTrue();
    c.selectLinkSearchResult({ id: 2, name: 'Alt', status: 'active', role: 'member' });
    expect(c.linkTargetId).toBeNull();
    expect(getUserIdentity).not.toHaveBeenCalled();
  });

  it('requires a meaningful query to search association candidates', () => {
    const getUsers = jasmine.createSpy('getUsers');
    const c = createComponent({ getUsers });
    c.linkSearchTerm = ' ';
    c.searchLinkTargets();
    expect(getUsers).not.toHaveBeenCalled();
    expect(c.linkSearchError).toContain('2 caracteres');
  });

  it('requires the two confirmation steps before creating an existing-user link', () => {
    const create = jasmine.createSpy('createUserIdentityLink').and.returnValue(of({}));
    const linked = createComponent({ createUserIdentityLink: create });
    linked.identity = identity();
    linked.linkTargetId = 20;
    linked.linkPreview = { userId: 20, displayName: 'Outro', discordAccounts: [] } as any;
    linked.linkReason = 'mesma pessoa';

    linked.createLink();
    expect(linked.identityMessage).toContain('duas etapas');
    expect(create).not.toHaveBeenCalled();

    linked.linkPreviewModalOpen = true;
    linked.continueExistingIdentityLink();
    expect(linked.linkPreviewModalOpen).toBeFalse();
    expect(linked.linkConfirmModalOpen).toBeTrue();

    linked.createLink();
    expect(create).toHaveBeenCalledWith(1, 20, 'CONFIRMED', 'mesma pessoa');
  });

  it('rejects a stale preview when the target ID changed', () => {
    const create = jasmine.createSpy('createUserIdentityLink');
    (component as any).adminService = { createUserIdentityLink: create };
    component.identity = { requestedUserId: 10 } as any;
    component.linkTargetId = 21;
    component.linkPreview = { userId: 20, discordAccounts: [] } as any;
    component.linkReason = 'mesma pessoa';
    component.linkConfirmed = true;

    component.createLink();

    expect(component.identityMessage).toBe('Confira a conta relacionada antes de continuar.');
    expect(create).not.toHaveBeenCalled();
  });

  it('clears a preview when the target ID changes', () => {
    component.linkTargetId = 21;
    component.linkPreview = { userId: 20, discordAccounts: [] } as any;
    component.linkConfirmed = true;
    component.linkPreviewModalOpen = true;
    component.linkConfirmModalOpen = true;

    component.onLinkTargetIdChange();

    expect(component.linkPreview).toBeNull();
    expect(component.linkConfirmed).toBeFalse();
    expect(component.linkPreviewModalOpen).toBeFalse();
    expect(component.linkConfirmModalOpen).toBeFalse();
  });

  it('ignores an out-of-order preview response', () => {
    const first = new Subject<any>();
    const second = new Subject<any>();
    const getUserIdentity = jasmine.createSpy('getUserIdentity').and.returnValues(first, second);
    (component as any).adminService = { getUserIdentity };

    component.linkTargetId = 20;
    component.previewLinkTarget();

    component.linkTargetId = 21;
    component.onLinkTargetIdChange();
    component.previewLinkTarget();

    first.next({ confirmedAccounts: [{ userId: 20, discordAccounts: [] }] });
    expect(component.linkPreview).toBeNull();

    second.next({ confirmedAccounts: [{ userId: 21, discordAccounts: [] }] });
    expect(component.linkPreview?.userId).toBe(21);
    expect(component.linkPreviewModalOpen).toBeTrue();
  });

  it('opens the first confirmation modal after Discord preview', () => {
    const previewDiscordIdentity = jasmine.createSpy().and.returnValue(of({
      discordUserId: '123456789012345678',
      username: 'outside.user',
      displayName: 'Outside User',
      avatarUrl: null,
      bot: false,
      existingUserId: null,
      existingUserDisplayName: null,
      alreadyInConfirmedCluster: false
    }));
    const discordComponent = createComponent({ previewDiscordIdentity });
    discordComponent.userId = 1;
    discordComponent.discordLinkId = '123456789012345678';

    discordComponent.previewDiscordIdentity();

    expect(previewDiscordIdentity).toHaveBeenCalledWith(1, '123456789012345678');
    expect(discordComponent.discordPreviewModalOpen).toBeTrue();
    expect(discordComponent.discordConfirmModalOpen).toBeFalse();
    expect(discordComponent.discordPreview?.username).toBe('outside.user');
  });

  it('requires the explicit second step before creating a Discord identity link', () => {
    const linkDiscordIdentity = jasmine.createSpy('linkDiscordIdentity');
    const discordComponent = createComponent({ linkDiscordIdentity });
    discordComponent.userId = 1;
    discordComponent.discordPreview = {
      discordUserId: '123456789012345678',
      username: 'outside.user',
      displayName: 'Outside User',
      bot: false,
      existingUserId: null,
      existingUserDisplayName: null,
      alreadyInConfirmedCluster: false
    };
    discordComponent.discordPreviewModalOpen = true;

    discordComponent.continueDiscordIdentityLink();

    expect(discordComponent.discordPreviewModalOpen).toBeFalse();
    expect(discordComponent.discordConfirmModalOpen).toBeTrue();

    discordComponent.confirmDiscordIdentityLink();
    expect(discordComponent.discordLinkError).toContain('motivo');
    expect(linkDiscordIdentity).not.toHaveBeenCalled();
  });

  it('creates a new User from an unknown Discord only on final confirmation', () => {
    const linkDiscordIdentity = jasmine.createSpy().and.returnValue(of({
      targetUserId: 30,
      createdUser: true,
      link: {}
    }));
    const discordComponent = createComponent({
      linkDiscordIdentity,
      getUserIdentity: () => of(identity())
    });
    discordComponent.profile = profile();
    discordComponent.userId = 1;
    discordComponent.discordPreview = {
      discordUserId: '123456789012345678',
      username: 'outside.user',
      displayName: 'Outside User',
      bot: false,
      existingUserId: null,
      existingUserDisplayName: null,
      alreadyInConfirmedCluster: false
    };
    discordComponent.discordConfirmModalOpen = true;
    discordComponent.discordLinkReason = ' mesma pessoa ';

    discordComponent.confirmDiscordIdentityLink();

    expect(linkDiscordIdentity).toHaveBeenCalledWith(
      1,
      '123456789012345678',
      'mesma pessoa'
    );
    expect(discordComponent.identityMessage).toContain('Novo User #30');
    expect(discordComponent.discordPreview).toBeNull();
    expect(discordComponent.discordLinkId).toBe('');
  });

  it('does not advance when a Discord account is already in the confirmed cluster', () => {
    const discordComponent = createComponent({} as any);
    discordComponent.discordPreview = {
      discordUserId: '123456789012345678',
      username: 'linked.user',
      displayName: 'Linked User',
      bot: false,
      existingUserId: 2,
      existingUserDisplayName: 'Alt',
      alreadyInConfirmedCluster: true
    };
    discordComponent.discordPreviewModalOpen = true;

    discordComponent.continueDiscordIdentityLink();

    expect(discordComponent.discordPreviewModalOpen).toBeTrue();
    expect(discordComponent.discordConfirmModalOpen).toBeFalse();
  });

  it('creates confirmed or suspected links without a transfer action', () => {
    const create = jasmine.createSpy('createUserIdentityLink').and.returnValue(of({}));
    (component as any).adminService = { createUserIdentityLink: create };
    component.identity = { requestedUserId: 10 } as any;
    component.linkTargetId = 20;
    component.linkPreview = { userId: 20, discordAccounts: [] } as any;
    component.linkStatus = 'SUSPECTED';
    component.linkReason = ' indícios revisados ';
    component.linkConfirmed = true;
    component.linkConfirmModalOpen = true;

    component.createLink();

    expect(create).toHaveBeenCalledWith(10, 20, 'SUSPECTED', 'indícios revisados');
    expect(component.identityMessage).toBe('Vínculo de identidade registrado.');
  });

  it('does not advance an existing User that is already in the confirmed cluster', () => {
    const linked = createComponent({} as any);
    linked.identity = identity();
    linked.linkTargetId = 2;
    linked.linkPreview = { userId: 2, displayName: 'Alt', discordAccounts: [] } as any;
    linked.linkPreviewModalOpen = true;

    linked.continueExistingIdentityLink();

    expect(linked.linkPreviewModalOpen).toBeFalse();
    expect(linked.linkConfirmModalOpen).toBeFalse();
    expect(linked.identityMessage).toContain('já pertence');
  });

  it('maps validation, missing-user and group-conflict errors', () => {
    expect((component as any).identityError(400)).toContain('Revise');
    expect((component as any).identityError(404)).toContain('não foi encontrada');
    expect((component as any).identityError(409)).toContain('vínculo ativo');

    (component as any).adminService = {
      getUserIdentity: () => throwError(() => ({ status: 404 }))
    };
    component.linkTargetId = 999;
    component.previewLinkTarget();
    expect(component.identityMessage).toContain('não foi encontrada');
  });

  it('does not expose management actions to a non-admin user', () => {
    const commonUser = new AdminUserProfileComponent(
      { snapshot: { paramMap: { get: () => '1' } } } as any,
      {} as any,
      {} as any,
      { isAdmin: () => false } as any
    );

    expect(commonUser.canManageLinks).toBeFalse();
  });

  it('presents the same three-account confirmed cluster from every account route', () => {
    const openedA = createComponent({} as any);
    const openedB = createComponent({} as any);
    openedA.identity = { ...identity(), requestedUserId: 1 };
    openedB.identity = { ...identity(), requestedUserId: 2 };

    expect(openedA.sourceUsers().map(account => account.userId)).toEqual([1, 2, 3]);
    expect(openedB.sourceUsers().map(account => account.userId)).toEqual([1, 2, 3]);
    expect(Object.keys(identity())).not.toContain('primaryUserId');
    expect(Object.keys(identity())).not.toContain('primaryUser');
  });

  it('loads identity moderation only for the selected community', () => {
    const getUserIdentityModerationHistory = jasmine.createSpy().and.returnValue(of(history()));
    const contextual = createComponent({ getUserIdentityModerationHistory });
    contextual.profile = profile();

    contextual.selectCommunity(5);

    expect(getUserIdentityModerationHistory).toHaveBeenCalledWith(1, 5);
    expect(contextual.identityHistory?.communityId).toBe(5);
  });

  it('reloads the already selected community history after refreshing the dossier', () => {
    const getUserIdentityModerationHistory = jasmine.createSpy().and.returnValue(of(history()));
    const contextual = createComponent({
      getUserProfile: () => of(profile()),
      getUserIdentity: () => of(identity()),
      getUserReliability: () => of(reliability()),
      getUserIdentityModerationHistory
    });
    contextual.selectedCommunityId = 5;

    contextual.load(1);

    expect(getUserIdentityModerationHistory).toHaveBeenCalledWith(1, 5);
    expect(contextual.identityHistory?.communityId).toBe(5);
  });

  it('keeps confirmed direct edges available for audited revocation', () => {
    const contextual = createComponent({} as any);
    contextual.identity = identity();

    expect(contextual.identity!.confirmedLinks.map(link => [link.userA.userId, link.userB.userId]))
      .toEqual([[1, 2], [2, 3]]);
  });

  it('loads profile, neutral identity cluster and reliability as one dossier', () => {
    const adminService = {
      getUserProfile: jasmine.createSpy().and.returnValue(of(profile())),
      getUserIdentity: jasmine.createSpy().and.returnValue(of(identity())),
      getUserReliability: jasmine.createSpy().and.returnValue(of(reliability()))
    };
    const loaded = createComponent(adminService);

    loaded.ngOnInit();

    expect(loaded.loading).toBeFalse();
    expect(loaded.profile?.communities[0].vip).toBeTrue();
    expect(loaded.identity?.confirmedAccounts.map(account => account.userId)).toEqual([1, 2, 3]);
    expect(loaded.reliability?.events.staffEvents).toBe(1);
    expect(loaded.selectedRole).toBe('member');
  });

  it('keeps the loading state until every core request completes', () => {
    const profileRequest = new Subject<any>();
    const identityRequest = new Subject<any>();
    const reliabilityRequest = new Subject<any>();
    const loadingComponent = createComponent({
      getUserProfile: () => profileRequest,
      getUserIdentity: () => identityRequest,
      getUserReliability: () => reliabilityRequest
    });

    loadingComponent.ngOnInit();
    expect(loadingComponent.loading).toBeTrue();
    profileRequest.next(profile()); profileRequest.complete();
    identityRequest.next(identity()); identityRequest.complete();
    reliabilityRequest.next(reliability()); reliabilityRequest.complete();
    expect(loadingComponent.loading).toBeFalse();
  });

  it('reports a missing user and does not fabricate profile data', () => {
    const missing = createComponent({
      getUserProfile: () => throwError(() => ({ status: 404 })),
      getUserIdentity: () => of(identity()),
      getUserIdentityModerationHistory: () => of(history()),
      getUserReliability: () => of(reliability())
    });

    missing.ngOnInit();

    expect(missing.errorMessage).toBe('Usuário não encontrado.');
    expect(missing.profile).toBeNull();
    expect(missing.loading).toBeFalse();
  });

  it('keeps the core profile available when identity complements fail', () => {
    const partial = createComponent({
      getUserProfile: () => of(profile()),
      getUserIdentity: () => throwError(() => ({ status: 503 })),
      getUserReliability: () => of(reliability())
    });

    partial.ngOnInit();

    expect(partial.profile).not.toBeNull();
    expect(partial.identity).toBeNull();
    expect(partial.identityHistory).toBeNull();
    expect(partial.errorMessage).toBe('');
    expect(partial.identityLoadError).toContain('identidades relacionadas');
    expect(partial.identityHistoryError).toBe('');
    expect(partial.loading).toBeFalse();
  });

  it('keeps the core profile available when reliability fails', () => {
    const profileWithTelegram = profile();
    profileWithTelegram.identity.telegramUsername = '@furry';
    const partial = createComponent({
      getUserProfile: () => of(profileWithTelegram),
      getUserIdentity: () => of(identity()),
      getUserReliability: () => throwError(() => ({ status: 503 }))
    });

    partial.ngOnInit();

    expect(partial.profile).not.toBeNull();
    expect(partial.reliability).toBeNull();
    expect(partial.reliabilityError).toContain('Não foi possível');
    expect(partial.approvedMembershipsLabel()).toBe('Dados de aprovação indisponíveis');
    expect(partial.telegramLinkStatusLabel()).toBe('Telegram cadastrado');
  });

  it('reports known reliability values without conflating them with unavailable data', () => {
    const known = createComponent({} as any);
    known.profile = profile();
    known.reliability = reliability();

    expect(known.approvedMembershipsLabel()).toBe('1 aprovadas');
    expect(known.telegramLinkStatusLabel()).toBe('Sem vínculo confirmado');

    known.reliability!.account.linkedTelegram = true;
    expect(known.telegramLinkStatusLabel()).toBe('Conta externa vinculada');

    known.reliability!.account.telegramAmbiguous = true;
    expect(known.telegramLinkStatusLabel()).toBe('Múltiplos vínculos legados');

    known.reliability = null;
    known.profile!.identity.telegramAmbiguous = true;
    known.profile!.identity.telegramUsername = null;
    expect(known.telegramLinkStatusLabel()).toBe('Múltiplos vínculos legados');

    known.profile!.identity.telegramAmbiguous = false;
    expect(known.telegramLinkStatusLabel()).toBe('Status do vínculo indisponível');
  });

  it('switches every global tab without navigating away from the profile route', () => {
    const tabbed = createComponent({} as any);
    for (const tab of tabbed.tabs.filter(item => !item.local)) {
      tabbed.selectTab(tab.id);
      expect(tabbed.activeTab).toBe(tab.id);
    }
  });

  it('deduplicates legacy community rows only in the context selector', () => {
    const tabbed = createComponent({} as any);
    tabbed.profile = profile();
    tabbed.profile!.communities.push({ ...tabbed.profile!.communities[0], statusRecordId: 51 });

    expect(tabbed.profile!.communities.length).toBe(2);
    expect(tabbed.communityOptions.length).toBe(1);
  });

  it('locks local tabs in global context and returns to summary when context becomes global', () => {
    const tabbed = createComponent({} as any);
    tabbed.selectTab('progresso');
    expect(tabbed.activeTab).toBe('resumo');

    tabbed.selectedCommunityId = 5;
    (tabbed as any).adminService = {
      getUserCommunityContext: () => of(null),
      getUserDiscordMember: () => of(null)
    };
    for (const tab of tabbed.tabs.filter(item => item.local)) {
      tabbed.selectTab(tab.id);
      expect(tabbed.activeTab).toBe(tab.id);
    }

    tabbed.selectCommunity('global');
    expect(tabbed.activeTab).toBe('resumo');
    expect(tabbed.selectedCommunityId).toBeNull();
  });

  it('ignores errors from a stale community request after switching context', () => {
    const contextA = new Subject<any>();
    const contextB = new Subject<any>();
    const discordA = new Subject<any>();
    const discordB = new Subject<any>();
    const getUserCommunityContext = jasmine.createSpy().and.returnValues(contextA, contextB);
    const getUserDiscordMember = jasmine.createSpy().and.returnValues(discordA, discordB);
    const contextual = createComponent({ getUserCommunityContext, getUserDiscordMember });
    contextual.activeTab = 'contexto';

    contextual.selectCommunity(5);
    contextual.selectCommunity(6);

    const persistedB = {
      communityId: 6,
      memberships: [],
      progression: { state: 'not_found' },
      economy: { state: 'not_found', records: [] },
      inventory: [],
      vip: { membershipVip: false, customRoles: [] },
      temporaryRoles: []
    };
    contextB.next(persistedB);
    contextB.complete();
    discordB.next(null);
    discordB.complete();

    expect(contextual.context).toBe(persistedB as any);
    expect(contextual.contextError).toBe('');
    expect(contextual.discordMemberError).toBe('');

    contextA.error({ status: 500 });
    expect(contextual.contextError).toBe('');

    discordA.error({ status: 503 });
    expect(contextual.discordMemberError).toBe('');
    expect(contextual.context).toBe(persistedB as any);
  });

  it('keeps persisted context when live Discord is unavailable', () => {
    const persisted = { communityId: 5, memberships: [], progression: { state: 'not_found' }, economy: { state: 'not_found', records: [] }, inventory: [], vip: { membershipVip: false, customRoles: [] }, temporaryRoles: [] };
    const contextual = createComponent({
      getUserCommunityContext: () => of(persisted),
      getUserDiscordMember: () => throwError(() => ({ status: 503 }))
    });
    contextual.selectedCommunityId = 5;

    contextual.loadContext();

    expect(contextual.context).toBe(persisted as any);
    expect(contextual.discordMember).toBeNull();
    expect(contextual.discordMemberError).toContain('indisponível');
    expect(contextual.contextLoading).toBeFalse();
  });

  it('surfaces ambiguous Discord links instead of reporting generic unavailability', () => {
    const persisted = { communityId: 5, memberships: [], progression: { state: 'not_found' }, economy: { state: 'not_found', records: [] }, inventory: [], vip: { membershipVip: false, customRoles: [] }, temporaryRoles: [] };
    const contextual = createComponent({
      getUserCommunityContext: () => of(persisted),
      getUserDiscordMember: () => throwError(() => ({ status: 409 }))
    });
    contextual.selectedCommunityId = 5;

    contextual.loadContext();

    expect(contextual.context).toBe(persisted as any);
    expect(contextual.discordMemberError).toContain('múltiplos vínculos Discord legados');
  });

  it('uses only the selected community history and keeps suspected links separate', () => {
    const filtered = createComponent({} as any);
    filtered.identityHistory = {
      requestedUserId: 1,
      communityId: 5,
      confirmedUserIds: [1, 2, 3],
      warnings: [{ sourceUserId: 1, communityId: 5 }],
      bans: [{ sourceUserId: 1, communityId: 5 }],
      notes: [{ sourceUserId: 1 }],
      suspectedLinks: [{ userA: { userId: 1 }, userB: { userId: 99 } }]
    } as any;
    filtered.setModerationType('warn');

    expect(filtered.warningsFor(1).length).toBe(1);
    expect(filtered.bansFor(1).length).toBe(0);
    expect(filtered.notesFor(1).length).toBe(0);
    expect(filtered.identityHistory!.suspectedLinks[0].userB.userId).toBe(99);
  });

  it('paginates the direct history without reloading identity or reliability', () => {
    const secondPage = profile();
    secondPage.moderation.pagination = { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 };
    const getUserProfile = jasmine.createSpy().and.returnValue(of(secondPage));
    const paged = createComponent({ getUserProfile });
    paged.profile = profile();
    paged.profile!.moderation.pagination.totalPages = 2;

    paged.loadModerationPage(2);

    expect(getUserProfile).toHaveBeenCalledWith(1, 2);
    expect(paged.profile?.moderation.pagination.page).toBe(2);
    expect(paged.moderationLoading).toBeFalse();
  });

  it('confirms and revokes identity links with a reason and refreshes the history', () => {
    spyOn(window, 'prompt').and.returnValue('revisado');
    spyOn(window, 'confirm').and.returnValue(true);
    const update = jasmine.createSpy().and.returnValue(of({}));
    const revoke = jasmine.createSpy().and.returnValue(of({}));
    const adminService = {
      updateUserIdentityLink: update,
      revokeUserIdentityLink: revoke,
      getUserIdentity: () => of(identity()),
      getUserIdentityModerationHistory: () => of(history())
    };
    const linked = createComponent(adminService);
    linked.profile = profile();
    linked.identity = identity();
    const suspected = { userA: { userId: 1, discordAccounts: [] }, userB: { userId: 2, discordAccounts: [] } } as any;

    linked.confirmLink(suspected);
    linked.revokeLink(suspected);

    expect(update).toHaveBeenCalledWith(1, 2, 'CONFIRMED', 'revisado');
    expect(revoke).toHaveBeenCalledWith(1, 2, 'revisado');
    expect(linked.identityActionLoading).toBeFalse();
  });

  it('requires explicit confirmation, updates role and refreshes the current profile', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const updateUserRole = jasmine.createSpy().and.returnValue(of({ id: 1, role: 'moderator' }));
    const getUserProfile = jasmine.createSpy().and.returnValue(of(profile('moderator')));
    const roleComponent = createComponent({
      updateUserRole,
      getUserProfile,
      getUserIdentity: () => of(identity()),
      getUserReliability: () => of(reliability())
    });
    roleComponent.profile = profile();
    roleComponent.selectedRole = 'moderator';

    roleComponent.updateRole();
    expect(updateUserRole).not.toHaveBeenCalled();
    expect(roleComponent.roleMessage).toContain('Confirme');

    roleComponent.roleConfirmed = true;
    roleComponent.updateRole();
    expect(updateUserRole).toHaveBeenCalledWith(1, 'moderator');
    expect(getUserProfile).toHaveBeenCalledWith(1, 1);
    expect(roleComponent.profile?.identity.role).toBe('moderator');
    expect(roleComponent.roleMessage).toContain('Moderador');
  });

  it('shows an authorization error and restores the current role on a 403', () => {
    const denied = createComponent({ updateUserRole: () => throwError(() => ({ status: 403 })) });
    denied.profile = profile('member');
    denied.selectedRole = 'admin';
    denied.roleConfirmed = true;
    spyOn(window, 'confirm').and.returnValue(true);

    denied.updateRole();

    expect(denied.selectedRole).toBe('member');
    expect(denied.roleMessage).toContain('não possui autorização');
    expect(denied.roleMessageIsError).toBeTrue();
  });
});
