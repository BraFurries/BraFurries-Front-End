import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { AutoJoinRolesState, BumpConfigResponse, GuildResources, LogsState, ManagedServer, ManagedServersService, ModerationAccessState, PortariaBypass, PortariaBypassesState, PortariaState, ServerChannelsConfig, StaffRoles } from '../../../core/services/managed-servers.service';
import { CommunityContextService, CommunityContextState } from '../../../core/services/community-context.service';
import { RoleSelectionComponent } from './role-selection.component';
import { ServidoresComponent } from './servidores.component';

@Component({
  selector: 'app-portaria-clarification-settings',
  standalone: false,
  template: ''
})
class MockPortariaClarificationSettingsComponent {
  @Input() guildId = '';
  @Input() categories: unknown[] = [];
  @Input() canManageChannels = false;
}

@Component({
  selector: 'app-xp-leveling-panel',
  standalone: false,
  template: ''
})
class MockXpLevelingPanelComponent {
  @Input() guildId = '';
  @Input() channels: unknown[] = [];
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();
}

@Component({
  selector: 'app-ai-configuration-panel',
  standalone: false,
  template: ''
})
class MockAiConfigurationPanelComponent {
  @Input() guildId = '';
  @Input() channels: unknown[] = [];
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();
}

@Component({
  selector: 'app-vip-configuration-panel',
  standalone: false,
  template: ''
})
class MockVipConfigurationPanelComponent {
  @Input() guildId = '';
  @Input() resources: unknown;
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();
}

@Component({
  selector: 'app-backup-management-panel',
  standalone: false,
  template: ''
})
class MockBackupManagementPanelComponent {
  @Input() guildId = '';
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();
}

@Component({
  selector: 'app-theme-management-panel',
  standalone: false,
  template: ''
})
class MockThemeManagementPanelComponent {
  @Input() guildId = '';
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();
}

describe('ServidoresComponent', () => {
  let component: ServidoresComponent;
  let fixture: ComponentFixture<ServidoresComponent>;
  let service: jasmine.SpyObj<ManagedServersService>;
  let communityContext: any;
  let contextState$: BehaviorSubject<CommunityContextState>;
  let router: Router;
  let routeParams: BehaviorSubject<ParamMap>;
  let route: { paramMap: ReturnType<BehaviorSubject<ParamMap>['asObservable']>; snapshot: { paramMap: ParamMap } };
  const servers: ManagedServer[] = [
    { guildId: '1480343896461545606', name: 'Comunidade Aurora', memberCount: 2840, botOnline: true },
    { guildId: '20', name: 'Refúgio Lunar', memberCount: 728, botOnline: true }
  ];
  const resources: GuildResources = {
    guildId: '1480343896461545606',
    roles: [
      { id: '1', name: 'Cargo baixo', position: 1, managed: false, editableByBot: true },
      { id: '999999999999999999', name: 'Moderador', position: 10, managed: false, editableByBot: true },
      { id: '3', name: 'Cargo alto', position: 20, managed: false, editableByBot: false }
    ],
    channels: [
      { id: '3', name: 'voz', type: 'voice' },
      { id: '888888888888888888', name: 'fichas', type: 'text', categoryId: '777777777777777777' },
      { id: '2', name: 'geral', type: 'news' },
      { id: '4', name: 'palco', type: 'stage_voice' }, { id: '5', name: 'forum', type: 'forum' }, { id: '6', name: 'midia', type: 'media' }
    ],
    categories: [{ id: '777777777777777777', name: 'Portaria' }, { id: '7', name: 'Sem duplicata' }],
    botCapabilities: { canManageChannels: true, canManageRoles: true, canApply: true, missingPermissions: [] }
  };
  const staff: StaffRoles = { roleIds: ['999999999999999999'], roles: resources.roles };
  const moderationAccess: ModerationAccessState = {
    guildId: resources.guildId,
    staffRoles: staff,
    collaborativeModeration: {
      enabled: false,
      emoji: null,
      minReactions: 3,
      participantMode: 'ALL_NON_BOT_MEMBERS',
      protectedStaffRoleIds: staff.roleIds
    }
  };
  const portaria: PortariaState = {
    config: { enabled: true, visitanteRoleId: '999999999999999999', aprovacaoAcessoProvisorioAtivo: true, aprovacaoAcessoProvisorioDuracaoDias: 15, formularioPortariaAtivo: true, idadeMinimaContaFichaAtiva: false, idadeMinimaContaFichaDias: 0, idadeMinimaContaAcessoProvisorioAtiva: false, idadeMinimaContaAcessoProvisorioDias: 30, idadeMinimaEntradaServidorAtiva: false, idadeMinimaEntradaServidorAnos: 0 },
    flows: [{ id: 1, name: 'Portaria', type: 'portaria', targetChannelId: '888888888888888888', rejectionFeedbackEnabled: true }],
    selectedFlow: { id: 1, name: 'Portaria', type: 'portaria', targetChannelId: '888888888888888888', rejectionFeedbackEnabled: true },
    questions: [{ id: 1, label: 'Como conheceu?', placeholder: 'Conte para nós', position: 1, required: true }], configured: true, ambiguous: false
  };
  const autoJoinRoles: AutoJoinRolesState = { enabled: true, roles: [{ id: '999999999999999999', name: 'Moderador', missing: false, position: 10, protectedRole: true, protectedReason: 'PORTARIA' }], portariaVisitorRoleId: '999999999999999999', warnings: [] };
  const serverChannels: ServerChannelsConfig = { birthdayChannelId: null, aiChannelIds: [], aiChannelLimitEnabled: false, bumpProcessingChannelId: null };
  const bump: BumpConfigResponse = {
    processing: { channelId: '888888888888888888' },
    warning: { enabled: true, sourceChannelId: '2', targetChannelId: '888888888888888888', messages: ['primeiro aviso', 'segundo aviso'] },
    individualReward: { role: { enabled: true, roleId: '999999999999999999', durationMinutes: 60, message: 'Obrigado pelo bump!' }, coins: { enabled: true, amount: 25 } },
    monthlyRanking: { enabled: true, sourceChannelId: '2', roleId: '999999999999999999', rewards: [{ position: 3, roleDurationDays: 7, coins: 3 }, { position: 1, roleDurationDays: 21, coins: 10 }, { position: 2, roleDurationDays: 14, coins: 5 }] },
    operational: { warningNextAt: null, warningLastBumpAt: null }
  };
  const logs: LogsState = { logs: [{ type: 'warn', label: 'Warns', enabled: false, target: null, warnings: [] }], targets: [], legacyTypes: [] };

  beforeEach(async () => {
    routeParams = new BehaviorSubject<ParamMap>(convertToParamMap({ guildId: '1480343896461545606', section: 'overview' }));
    route = { paramMap: routeParams.asObservable(), snapshot: { paramMap: routeParams.value } };
    contextState$ = new BehaviorSubject<CommunityContextState>({
      status: 'ready',
      communities: [{
        communityId: 10,
        name: 'BraFurries',
        ownedByMe: true,
        ownerAssigned: true,
        member: true,
        networks: [
          { type: 'DISCORD', externalId: '1480343896461545606', name: 'Comunidade Aurora', active: true },
          { type: 'DISCORD', externalId: '20', name: 'Refúgio Lunar', active: true }
        ]
      }],
      activeCommunity: {
        communityId: 10,
        name: 'BraFurries',
        ownedByMe: true,
        ownerAssigned: true,
        member: true,
        networks: [
          { type: 'DISCORD', externalId: '1480343896461545606', name: 'Comunidade Aurora', active: true },
          { type: 'DISCORD', externalId: '20', name: 'Refúgio Lunar', active: true }
        ]
      },
      activeAccess: {
        communityId: 10,
        owner: false,
        communityAdmin: false,
        activeMember: true,
        canManageCommunityAdmins: false,
        activeRoleIds: [],
        capabilities: [],
        teamScopes: []
      },
      managedDiscordServers: servers,
      managedServersAvailable: true,
      errorMessage: ''
    });
    communityContext = {
      state$: contextState$.asObservable(),
      get snapshot() { return contextState$.value; },
      resolveCommunity: jasmine.createSpy('resolveCommunity').and.callFake(() =>
        of({ kind: 'ready', state: contextState$.value })
      )
    };
    service = jasmine.createSpyObj('ManagedServersService', ['getManagedServers','getResources','getServerChannels','getBump','getStaffRoles','getModerationAccess','getPortariaBypasses','getVipRoles','getPortaria','getAutoJoinRoles','getLogs','updateLog','testLog','addAutoJoinRole','removeAutoJoinRole','updateAutoJoinEnabled','updateStaffRoles','updateModerationStaffRoles','updateCollaborativeModeration','createPortariaBypass','updatePortariaBypass','removePortariaBypass','updateVipRoles','updateBirthdayChannel','updatePortariaRoles','updatePortariaEnabled','updatePortariaEntry','updatePortariaForm','updatePortariaResult','createPortariaFlow','publishPortariaFlow','updateBumpProcessing','updateBumpWarning','updateBumpIndividualReward','updateBumpMonthlyRanking']);
    service.getManagedServers.and.returnValue(of(servers)); service.getResources.and.returnValue(of(resources)); service.getServerChannels.and.returnValue(of(serverChannels)); service.getBump.and.returnValue(of(bump)); service.getStaffRoles.and.returnValue(of(staff)); service.getModerationAccess.and.returnValue(of(moderationAccess)); service.getPortariaBypasses.and.returnValue(of({ portariaEnabled: true, bypasses: [] })); service.getVipRoles.and.returnValue(of({ roleIds: ['1'], roles: [resources.roles[0]] })); service.getPortaria.and.returnValue(of(portaria)); service.getAutoJoinRoles.and.returnValue(of(autoJoinRoles));
    service.addAutoJoinRole.and.returnValue(of(autoJoinRoles)); service.removeAutoJoinRole.and.returnValue(of(autoJoinRoles)); service.updateAutoJoinEnabled.and.returnValue(of(autoJoinRoles)); service.updateModerationStaffRoles.and.returnValue(of(moderationAccess)); service.updateCollaborativeModeration.and.returnValue(of(moderationAccess)); service.updatePortariaEntry.and.returnValue(of(portaria)); service.updatePortariaForm.and.returnValue(of(portaria)); service.updatePortariaResult.and.returnValue(of(portaria)); service.createPortariaFlow.and.returnValue(of(portaria));
    service.updateVipRoles.and.returnValue(of({ roleIds: ['1'], roles: [resources.roles[0]] }));
    service.updateBirthdayChannel.and.returnValue(of(serverChannels)); service.updateBumpProcessing.and.returnValue(of(bump)); service.updateBumpWarning.and.returnValue(of(bump)); service.updateBumpIndividualReward.and.returnValue(of(bump)); service.updateBumpMonthlyRanking.and.returnValue(of(bump));
    service.updatePortariaRoles.and.returnValue(of(portaria.config));
    service.updatePortariaEnabled.and.returnValue(of(portaria));
    service.publishPortariaFlow.and.returnValue(of({ flowId: 1, channelId: '888888888888888888', messageId: '123456789012345678', created: true, reused: false, updated: false }));
    service.getLogs.and.returnValue(of(logs)); service.updateLog.and.returnValue(of(logs)); service.testLog.and.returnValue(of(void 0));
    await TestBed.configureTestingModule({ declarations: [ServidoresComponent, RoleSelectionComponent, MockPortariaClarificationSettingsComponent, MockXpLevelingPanelComponent, MockAiConfigurationPanelComponent, MockVipConfigurationPanelComponent, MockBackupManagementPanelComponent, MockThemeManagementPanelComponent], imports: [FormsModule], providers: [provideRouter([]), { provide: ActivatedRoute, useValue: route }, { provide: ManagedServersService, useValue: service }, { provide: CommunityContextService, useValue: communityContext }] }).compileComponents();
    router = TestBed.inject(Router);
  });
  function create(): void { fixture = TestBed.createComponent(ServidoresComponent); component = fixture.componentInstance; fixture.detectChanges(); }
  function setRoute(params: Record<string, string>): void { route.snapshot.paramMap = convertToParamMap(params); routeParams.next(route.snapshot.paramMap); fixture.detectChanges(); }

  it('loads real resources, Portaria and staff roles while preserving snowflakes as strings', () => {
    create();
    expect(component.selectedServerId).toBe('1480343896461545606');
    expect(component.resources?.guildId).toBe('1480343896461545606');
    expect(component.staffRoleDraft).toEqual(['999999999999999999']);
    expect(component.portariaRoleDraft.visitanteRoleId).toBe('999999999999999999');
    expect(component.newFlowTargetChannelId).toBe('888888888888888888');
    expect(component.portaria?.questions[0].label).toBe('Como conheceu?');
  });

  it('loads Bump alongside configuration and ignores a stale guild response', () => {
    const delayed = new Subject<BumpConfigResponse>();
    service.getBump.and.returnValue(delayed);
    create();
    setRoute({ guildId: '20', section: 'overview' });
    delayed.next({ ...bump, processing: { channelId: 'stale-channel' } });
    expect(component.selectedServerId).toBe('20');
    expect(component.bumpDraft?.processing.channelId).not.toBe('stale-channel');
  });

  it('saves only the processing payload and leaves the warning draft intact', () => {
    create();
    component.bumpDraft!.processing.channelId = '2';
    component.bumpDraft!.warning.messages = ['rascunho local'];
    component.saveBumpProcessing();
    expect(service.updateBumpProcessing).toHaveBeenCalledOnceWith(component.selectedServerId, { channelId: '2' });
    expect(component.bumpDraft!.warning.messages).toEqual(['rascunho local']);
  });

  it('serializes warning messages line by line and keeps operational timestamps read-only', () => {
    create();
    component.updateWarningMessages(' primeiro \n\n segundo ');
    component.saveBumpWarning();
    const payload = service.updateBumpWarning.calls.mostRecent().args[1] as unknown as Record<string, unknown>;
    expect(payload).toEqual({ enabled: true, targetChannelId: '888888888888888888', messages: ['primeiro', 'segundo'] });
    expect(payload['sourceChannelId']).toBeUndefined();
    expect(component.warningTimestamp(null)).toBe('Ainda não registrado');
    expect(component.bumpDraft?.operational.warningNextAt).toBeNull();
  });

  it('does not mark warning dirty when only the deprecated source alias changes', () => {
    create();
    component.bumpDraft!.warning.sourceChannelId = '888888888888888888';

    expect(component.isBumpCardDirty('warning')).toBeFalse();
  });

  it('keeps role and coin rewards independent and preserves unavailable configured roles', () => {
    create();
    component.bumpDraft!.individualReward.role.enabled = false;
    component.bumpDraft!.individualReward.coins.enabled = true;
    component.bumpDraft!.individualReward.coins.amount = 0;
    component.bumpDraft!.individualReward.role.roleId = 'missing-role';
    component.saveBumpIndividualReward();
    expect(service.updateBumpIndividualReward).toHaveBeenCalledWith(component.selectedServerId, jasmine.objectContaining({ role: jasmine.objectContaining({ enabled: false, roleId: 'missing-role' }), coins: jasmine.objectContaining({ enabled: true, amount: 0 }) }));
    expect(component.bumpRoleOptionsFor('missing-role').find(option => option.id === 'missing-role')?.label).toContain('Cargo configurado indisponível');
  });

  it('orders monthly tiers, preserves an unavailable role and keeps its source independent from processing', () => {
    create();
    component.bumpDraft!.monthlyRanking.roleId = 'missing-role';
    component.bumpDraft!.monthlyRanking.sourceChannelId = '2';
    component.bumpDraft!.processing.channelId = '888888888888888888';
    component.saveBumpMonthlyRanking();
    expect(component.monthlyTiers.map(tier => tier.position)).toEqual([1, 2, 3]);
    expect(service.updateBumpMonthlyRanking).toHaveBeenCalledWith(component.selectedServerId, jasmine.objectContaining({ sourceChannelId: '2', roleId: 'missing-role', rewards: jasmine.arrayContaining([jasmine.objectContaining({ position: 1 })]) }));
    expect(component.bumpRoleOptionsFor('missing-role').find(option => option.id === 'missing-role')?.disabled).toBeTrue();
  });

  it('includes Bump drafts in navigation discard and isolates saves between cards', () => {
    create();
    component.bumpDraft!.warning.messages = ['rascunho de aviso'];
    expect(component.hasUnsavedChanges()).toBeTrue();
    component.selectSection('moderation-access');
    component.discardAndNavigate();
    expect(component.bumpDraft!.warning.messages).toEqual(bump.warning.messages);
    component.bumpDraft!.warning.messages = ['aviso não salvo'];
    component.bumpDraft!.processing.channelId = '2';
    component.saveBumpProcessing();
    expect(component.bumpDraft!.warning.messages).toEqual(['aviso não salvo']);
  });

  it('serializes Bump saves until the active card response completes', () => {
    const processingResponse = new Subject<BumpConfigResponse>();
    service.updateBumpProcessing.and.returnValue(processingResponse);
    create();
    component.bumpDraft!.processing.channelId = '2';
    component.saveBumpProcessing();
    component.bumpDraft!.warning.messages = ['aviso novo'];
    component.saveBumpWarning();
    expect(service.updateBumpProcessing).toHaveBeenCalledTimes(1);
    expect(service.updateBumpWarning).not.toHaveBeenCalled();

    processingResponse.next({ ...bump, processing: { channelId: '2' } });
    component.saveBumpWarning();
    expect(service.updateBumpWarning).toHaveBeenCalledTimes(1);
  });

  it('preserves another dirty Bump card while processing is saving', () => {
    const processingResponse = new Subject<BumpConfigResponse>();
    service.updateBumpProcessing.and.returnValue(processingResponse);
    create();
    component.bumpDraft!.processing.channelId = '2';
    component.saveBumpProcessing();
    component.bumpDraft!.warning.messages = ['edição local'];

    processingResponse.next({ ...bump, processing: { channelId: '2' }, warning: { ...bump.warning, sourceChannelId: '888888888888888888', messages: ['valor do servidor'] } });

    expect(component.bumpPersisted?.processing.channelId).toBe('2');
    expect(component.bumpDraft?.processing.channelId).toBe('2');
    expect(component.bumpPersisted?.warning.sourceChannelId).toBe('888888888888888888');
    expect(component.bumpPersisted?.warning.messages).toEqual(['valor do servidor']);
    expect(component.bumpDraft?.warning.messages).toEqual(['edição local']);
  });

  it('does not render the deprecated warning source editor', () => {
    create();
    component.activeSection = 'bump';
    fixture.detectChanges();

    const warningTitle = Array.from(fixture.nativeElement.querySelectorAll('h3') as NodeListOf<HTMLElement>)
      .find((element: Element) => element.textContent?.trim() === 'Aviso de próximo bump');
    const warningCardText = warningTitle?.closest('article')?.textContent ?? '';

    expect(warningCardText).toContain('Canal do aviso');
    expect(warningCardText).not.toContain('Canal de origem');
  });

  it('preserves an edit to the same Bump card made while its save is pending', () => {
    const processingResponse = new Subject<BumpConfigResponse>();
    service.updateBumpProcessing.and.returnValue(processingResponse);
    create();
    component.bumpDraft!.processing.channelId = '2';
    component.saveBumpProcessing();
    component.bumpDraft!.processing.channelId = '888888888888888888';

    processingResponse.next({ ...bump, processing: { channelId: '2' } });

    expect(component.bumpPersisted?.processing.channelId).toBe('2');
    expect(component.bumpDraft?.processing.channelId).toBe('888888888888888888');
    expect(component.isBumpCardDirty('processing')).toBeTrue();
  });

  it('blocks Bump navigation and discard while a Bump save is pending', () => {
    const processingResponse = new Subject<BumpConfigResponse>();
    service.updateBumpProcessing.and.returnValue(processingResponse);
    create();
    spyOn(router, 'navigate').and.resolveTo(true);
    component.bumpDraft!.processing.channelId = '2';
    component.saveBumpProcessing();

    component.selectSection('moderation-access');
    component.discardAndNavigate();
    expect(component.activeSection).toBe('overview');
    expect(component.pendingNavigation).toBeUndefined();

    processingResponse.next({ ...bump, processing: { channelId: '2' } });
    component.selectSection('moderation-access');
    expect(component.pendingNavigation).toBeUndefined();
    expect(router.navigate).toHaveBeenCalledWith(['/painel/comunidades', 10, 'coddy', component.selectedServerId, 'moderation-access'], { replaceUrl: false });
  });

  it('exposes Backups as a real guild section', () => {
    create();
    const backups = component.sections.find(section => section.id === 'backups');

    expect(backups?.label).toBe('Backups');
    expect(backups?.status).toBeUndefined();
  });

  it('renders Backups without loading unrelated guild configuration', () => {
    const params = convertToParamMap({
      guildId: resources.guildId,
      section: 'backups'
    });
    route.snapshot.paramMap = params;
    routeParams.next(params);
    service.getPortaria.and.returnValue(
      throwError(() => new Error('Portaria offline'))
    );

    create();

    expect(component.activeSection).toBe('backups');
    expect(service.getResources).not.toHaveBeenCalled();
    expect(service.getPortaria).not.toHaveBeenCalled();
    expect(component.configurationError).toBe('');
    expect(
      fixture.nativeElement.querySelector('app-backup-management-panel')
    ).not.toBeNull();
  });

  it('includes Backup settings dirty state in navigation protection', () => {
    create();
    spyOn(router, 'navigate').and.resolveTo(true);
    component.backupDirty = true;

    component.selectSection('moderation-access');

    expect(component.pendingNavigation).toEqual({
      kind: 'route',
      guildId: component.selectedServerId,
      section: 'moderation-access'
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('blocks navigation while a Backup mutation is in flight', () => {
    create();
    spyOn(router, 'navigate').and.resolveTo(true);
    component.backupSaving = true;

    component.selectSection('moderation-access');

    expect(component.pendingNavigation).toBeUndefined();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('exposes XP & Leveling as a real server section instead of coming soon', () => {
    create();
    const leveling = component.sections.find(section => section.id === 'leveling');
    expect(leveling?.label).toBe('XP & Leveling');
    expect(leveling?.status).toBeUndefined();
  });

  it('includes XP draft state in navigation protection', () => {
    create();
    spyOn(router, 'navigate').and.resolveTo(true);
    component.xpDirty = true;

    component.selectSection('moderation-access');

    expect(component.pendingNavigation).toEqual({
      kind: 'route',
      guildId: component.selectedServerId,
      section: 'moderation-access'
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('blocks navigation while an XP save is in flight', () => {
    create();
    spyOn(router, 'navigate').and.resolveTo(true);
    component.xpSaving = true;

    component.selectSection('moderation-access');

    expect(component.pendingNavigation).toBeUndefined();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('includes AI draft state in navigation protection', () => {
    create();
    spyOn(router, 'navigate').and.resolveTo(true);
    component.aiDirty = true;

    component.selectSection('moderation-access');

    expect(component.pendingNavigation).toEqual({
      kind: 'route',
      guildId: component.selectedServerId,
      section: 'moderation-access'
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('blocks navigation while an AI save or credential change is in flight', () => {
    create();
    spyOn(router, 'navigate').and.resolveTo(true);
    component.aiSaving = true;

    component.selectSection('moderation-access');

    expect(component.pendingNavigation).toBeUndefined();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps Portaria publication unavailable without a selected flow or channel', () => {
    create();
    expect(component.canPublishPortariaFlow).toBeFalse();
    component.publicationChannelId = '888888888888888888';
    component.portaria = { ...component.portaria!, selectedFlow: undefined };
    expect(component.canPublishPortariaFlow).toBeFalse();
  });

  it('blocks Portaria publication while its form has unsaved changes', () => {
    create(); component.publicationChannelId = '888888888888888888';
    component.portaria!.questions[0].label = 'Pergunta alterada';

    expect(component.portariaPublicationHasUnsavedChanges).toBeTrue();
    expect(component.canPublishPortariaFlow).toBeFalse();
    component.publishPortariaFlow();
    expect(service.publishPortariaFlow).not.toHaveBeenCalled();
  });

  it('publishes using the currently selected guild, flow and only the selected channel', () => {
    create(); component.publicationChannelId = '2';

    component.publishPortariaFlow();

    expect(service.publishPortariaFlow).toHaveBeenCalledOnceWith('1480343896461545606', 1, { channelId: '2' });
  });

  it('sends only channelId through the typed publication service contract', () => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    http.post.and.returnValue(of({ flowId: 1, channelId: '2', messageId: '3', created: true, reused: false, updated: false }));
    const typedService = new ManagedServersService(http);

    typedService.publishPortariaFlow('1480343896461545606', 1, { channelId: '2' });

    expect(http.post).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/1480343896461545606/portaria/flows/1/publication',
      { channelId: '2' }
    );
  });

  it('preserves explicit empty message and custom button in the typed publication service contract', () => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    http.post.and.returnValue(of({ flowId: 1, channelId: '2', messageId: '3', created: false, reused: false, updated: true }));
    const typedService = new ManagedServersService(http);
    const request = { channelId: '2', message: '', buttonText: 'Fazer minha ficha' };

    typedService.publishPortariaFlow('1480343896461545606', 1, request);

    expect(http.post).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/1480343896461545606/portaria/flows/1/publication',
      request
    );
  });

  it('publishes optional message and button customization without dropping an empty message', () => {
    create(); component.publicationChannelId = '2';
    component.publicationCustomizeMessage = true;
    component.publicationMessage = '';
    component.publicationCustomizeButton = true;
    component.publicationButtonText = 'Fazer minha ficha';

    component.publishPortariaFlow();

    expect(service.publishPortariaFlow).toHaveBeenCalledOnceWith(
      '1480343896461545606',
      1,
      { channelId: '2', message: '', buttonText: 'Fazer minha ficha' }
    );
  });

  it('blocks publication when custom message or button exceeds its limits', () => {
    create(); component.publicationChannelId = '2';
    component.publicationCustomizeMessage = true;
    component.publicationMessage = 'x'.repeat(2001);
    expect(component.canPublishPortariaFlow).toBeFalse();
    component.publishPortariaFlow();
    expect(service.publishPortariaFlow).not.toHaveBeenCalled();

    component.publicationMessage = '';
    component.publicationCustomizeButton = true;
    component.publicationButtonText = 'x'.repeat(81);
    expect(component.canPublishPortariaFlow).toBeFalse();
    component.publishPortariaFlow();
    expect(service.publishPortariaFlow).not.toHaveBeenCalled();
  });

  it('blocks publication when a customized button is empty or whitespace', () => {
    create(); component.publicationChannelId = '2';
    component.publicationCustomizeButton = true;

    component.publicationButtonText = '';
    expect(component.canPublishPortariaFlow).toBeFalse();
    component.publishPortariaFlow();

    component.publicationButtonText = '   ';
    expect(component.canPublishPortariaFlow).toBeFalse();
    component.publishPortariaFlow();

    expect(service.publishPortariaFlow).not.toHaveBeenCalled();
  });

  it('clears the publication draft when the guild changes', () => {
    create(); component.publicationChannelId = '888888888888888888';
    component.publicationCustomizeMessage = true;
    component.publicationMessage = 'Mensagem da guild anterior';
    component.publicationCustomizeButton = true;
    component.publicationButtonText = 'Botão anterior';

    setRoute({ guildId: '20', section: 'portaria' });

    expect(component.selectedServerId).toBe('20');
    expect(component.publicationChannelId).toBe('');
    expect(component.publicationCustomizeMessage).toBeFalse();
    expect(component.publicationMessage).toBe('');
    expect(component.publicationCustomizeButton).toBeFalse();
    expect(component.publicationButtonText).toBe('Abrir formulário');
  });

  it('warns before discarding an unpublished publication draft on guild navigation', () => {
    create();
    component.publicationChannelId = '888888888888888888';
    component.publicationCustomizeMessage = true;
    component.publicationMessage = 'Mensagem ainda não publicada';

    expect(component.publicationDraftDirty).toBeTrue();
    expect(component.hasUnsavedChanges()).toBeTrue();

    const target = { value: '20' };
    component.selectServer({ target } as unknown as Event);

    expect(component.pendingNavigation).toEqual({ kind: 'route', guildId: '20', section: 'overview' });
    expect(component.publicationMessage).toBe('Mensagem ainda não publicada');

    component.discardAndNavigate();

    expect(component.pendingNavigation).toBeUndefined();
    expect(component.publicationChannelId).toBe('');
    expect(component.publicationCustomizeMessage).toBeFalse();
    expect(component.publicationMessage).toBe('');
    expect(component.publicationDraftDirty).toBeFalse();
  });

  it('marks the publication draft clean after a successful publication', () => {
    create();
    component.publicationChannelId = '888888888888888888';
    component.publicationCustomizeMessage = true;
    component.publicationMessage = 'Mensagem publicada';

    expect(component.publicationDraftDirty).toBeTrue();

    component.publishPortariaFlow();

    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(1);
    expect(component.publicationDraftDirty).toBeFalse();
  });

  it('shows distinct feedback for created, updated and reused Portaria publications', () => {
    create(); component.publicationChannelId = '888888888888888888';
    component.publishPortariaFlow();
    expect(component.operationModal?.message).toBe('Mensagem de acesso publicada com sucesso.');

    service.publishPortariaFlow.and.returnValue(of({ flowId: 1, channelId: '888888888888888888', messageId: '123456789012345678', created: false, reused: false, updated: true }));
    component.publicationChannelId = '2'; component.publishPortariaFlow();
    expect(component.operationModal?.message).toBe('Publicação atualizada com sucesso.');

    service.publishPortariaFlow.and.returnValue(of({ flowId: 1, channelId: '888888888888888888', messageId: '123456789012345678', created: false, reused: true, updated: false }));
    component.publicationChannelId = '2'; component.publishPortariaFlow();
    expect(component.operationModal?.message).toBe('Este formulário já possui uma publicação ativa nesse canal.');
  });

  it('does not show publication success when the API rejects the request', () => {
    service.publishPortariaFlow.and.returnValue(throwError(() => ({ error: { message: 'Canal indisponível' } })));
    create(); component.publicationChannelId = '888888888888888888';

    component.publishPortariaFlow();

    expect(component.operationModal?.state).toBe('error');
    expect(component.operationModal?.message).toBe('Canal indisponível');
    expect(component.saveState).toBe('error');
  });

  it('revalidates unsaved Portaria changes before retrying a failed publication', () => {
    service.publishPortariaFlow.and.returnValue(throwError(() => ({ error: { message: 'Falha temporária' } })));
    create(); component.publicationChannelId = '888888888888888888';

    component.publishPortariaFlow();
    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(1);

    component.portaria!.questions[0].label = 'Pergunta alterada depois da falha';
    expect(component.portariaPublicationHasUnsavedChanges).toBeTrue();

    component.retrySave();

    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(1);
  });

  it('revalidates the selected channel before retrying a failed publication', () => {
    service.publishPortariaFlow.and.returnValue(throwError(() => ({ error: { message: 'Falha temporária' } })));
    create(); component.publicationChannelId = '888888888888888888';

    component.publishPortariaFlow();
    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(1);

    component.publicationChannelId = '';
    component.retrySave();

    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(1);
  });

  it('revalidates publication customization before retrying a failed publication', () => {
    service.publishPortariaFlow.and.returnValue(throwError(() => ({ error: { message: 'Falha temporária' } })));
    create(); component.publicationChannelId = '888888888888888888';

    component.publishPortariaFlow();
    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(1);

    component.publicationCustomizeButton = true;
    component.publicationButtonText = '   ';
    component.retrySave();

    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(1);
  });

  it('retries a failed publication when the current Portaria state is still valid', () => {
    service.publishPortariaFlow.and.returnValues(
      throwError(() => ({ error: { message: 'Falha temporária' } })),
      of({ flowId: 1, channelId: '888888888888888888', messageId: '123456789012345678', created: true, reused: false, updated: false })
    );
    create(); component.publicationChannelId = '888888888888888888';

    component.publishPortariaFlow();
    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(1);

    component.retrySave();

    expect(service.publishPortariaFlow).toHaveBeenCalledTimes(2);
    expect(component.operationModal?.state).toBe('success');
    expect(component.operationModal?.message).toBe('Mensagem de acesso publicada com sucesso.');
  });

  it('removes the Cargos tab and exposes Moderação & Acesso as its own route', () => {
    create();
    expect(component.sections.find(section => section.label === 'Cargos')).toBeUndefined();
    expect(component.sections.find(section => section.label === 'Moderação & Acesso')?.id).toBe('moderation-access');
  });
  it('saves only the submitted birthday channel value', () => {
    create();
    component.birthdayChannelId = '888888888888888888';
    component.saveBirthdayChannel();
    expect(service.updateBirthdayChannel).toHaveBeenCalledOnceWith(resources.guildId, '888888888888888888');
  });
  it('keeps AI configuration out of the generic channels draft', () => {
    create();
    expect(component.channelsDirty).toBeFalse();
    expect(component.sections.find(section => section.id === 'ai')?.label).toBe('IA');
  });
  it('does not treat channels as dirty while loading or after a failed channel request', () => {
    const pendingChannels = new Subject<ServerChannelsConfig>();
    service.getServerChannels.and.returnValue(pendingChannels);
    create();
    expect(component.channelsDirty).toBeFalse();
    component.selectSection('logs');
    expect(component.pendingNavigation).toBeUndefined();

    service.getServerChannels.and.returnValue(throwError(() => new Error('offline')));
    component.loadConfiguration();
    expect(component.channelsDirty).toBeFalse();
    expect(component.configurationError).toContain('Não foi possível carregar');
  });
  it('detects a real channel edit after the persisted configuration loads', () => {
    create();
    expect(component.channelsDirty).toBeFalse();
    component.birthdayChannelId = '888888888888888888';
    expect(component.channelsDirty).toBeTrue();
  });
  it('includes the dedicated VIP panel in navigation dirty state', () => {
    create();
    component.vipDirty = true;
    expect(component.hasUnsavedChanges()).toBeTrue();

    component.selectSection('channels');

    expect(component.pendingNavigation).toEqual({
      kind: 'route',
      guildId: resources.guildId,
      section: 'channels'
    });
  });
  it('does not navigate away while a VIP save is in progress', () => {
    create();
    component.vipSaving = true;

    component.selectSection('channels');

    expect(component.activeSection).toBe('overview');
    expect(component.pendingNavigation).toBeUndefined();
  });
  it('updates only functional Portaria role IDs without saving entry rules', () => {
    create();
    component.portariaRoleDraft.maior18RoleId = '1';
    service.updatePortariaRoles.and.returnValue(of({ ...portaria.config, maior18RoleId: '1' }));
    component.savePortariaRoles();
    expect(service.updatePortariaRoles).toHaveBeenCalledWith(resources.guildId,
      jasmine.objectContaining({ maior18RoleId: '1', visitanteRoleId: '999999999999999999' }));
    expect(service.updatePortariaEntry).not.toHaveBeenCalled();
    expect(component.portariaRolesDirty).toBeFalse();
  });
  it('keeps the existing visitor without offering automatic-role cleanup', () => {
    create();
    component.portariaRoleDraft.maior18RoleId = '1';
    service.updatePortariaRoles.and.returnValue(of({ ...portaria.config, maior18RoleId: '1' }));
    component.savePortariaRoles();
    expect(component.visitorAutoJoinCleanupRoleId).toBeUndefined();
    expect(service.removeAutoJoinRole).not.toHaveBeenCalled();
  });
  it('offers an explicit choice when switching the visitor and can keep the old automatic role', () => {
    const switchedAutoJoin: AutoJoinRolesState = { ...autoJoinRoles, portariaVisitorRoleId: '1', roles: [
      { ...autoJoinRoles.roles[0], protectedRole: false, protectedReason: null },
      { id: '1', name: 'Cargo baixo', missing: false, position: 1, protectedRole: true, protectedReason: 'PORTARIA' }
    ] };
    service.getAutoJoinRoles.and.returnValues(of(autoJoinRoles), of(switchedAutoJoin));
    create(); component.activeSection = 'portaria'; component.portariaRoleDraft.visitanteRoleId = '1';
    service.updatePortariaRoles.and.returnValue(of({ ...portaria.config, visitanteRoleId: '1' }));
    component.savePortariaRoles(); fixture.detectChanges();
    expect(component.visitorAutoJoinCleanupRoleId).toBe('999999999999999999');
    expect(fixture.nativeElement.textContent).toContain('não foi removido automaticamente');
    component.keepPreviousVisitorAutoJoin();
    expect(component.visitorAutoJoinCleanupRoleId).toBeUndefined();
    expect(service.removeAutoJoinRole).not.toHaveBeenCalled();
  });
  it('offers cleanup when clearing the visitor and removes it only after confirmation', () => {
    const clearedAutoJoin: AutoJoinRolesState = { ...autoJoinRoles, portariaVisitorRoleId: null, roles: [
      { ...autoJoinRoles.roles[0], protectedRole: false, protectedReason: null }
    ] };
    const cleanedAutoJoin: AutoJoinRolesState = { ...clearedAutoJoin, roles: [] };
    service.getAutoJoinRoles.and.returnValues(of(autoJoinRoles), of(clearedAutoJoin));
    service.removeAutoJoinRole.and.returnValue(of(cleanedAutoJoin));
    create(); component.portariaRoleDraft.visitanteRoleId = null;
    service.updatePortariaRoles.and.returnValue(of({ ...portaria.config, visitanteRoleId: undefined }));
    component.savePortariaRoles();
    expect(component.visitorAutoJoinCleanupRoleId).toBe('999999999999999999');
    component.removePreviousVisitorAutoJoin();
    expect(service.removeAutoJoinRole).toHaveBeenCalledOnceWith(resources.guildId, '999999999999999999');
    expect(component.autoJoinRoles).toEqual(cleanedAutoJoin);
    expect(component.visitorAutoJoinCleanupRoleId).toBeUndefined();
  });
  it('reflects Community-context loading and managed-server discovery errors', () => {
    contextState$.next({ ...contextState$.value, status: 'loading' });
    create();
    expect(component.isLoading).toBeTrue();

    contextState$.next({
      ...contextState$.value,
      status: 'ready',
      managedServersAvailable: false,
      managedDiscordServers: []
    });
    expect(component.loadError).toBeTrue();
  });
  it('reloads all configuration when the opaque server id changes', () => {
    create(); spyOn(router, 'navigate').and.resolveTo(true); const select = fixture.nativeElement.querySelector('#managed-server') as HTMLSelectElement; select.value = '20'; select.dispatchEvent(new Event('change'));
    expect(router.navigate).toHaveBeenCalledWith(['/painel/comunidades', 10, 'coddy', '20', 'overview'], { replaceUrl: false });
  });
  it('keeps a failed save draft and retries the real HTTP operation', () => {
    service.updateModerationStaffRoles.and.returnValues(
      throwError(() => ({ error: { message: 'Falhou' } })),
      of(moderationAccess)
    ); create();
    component.staffRoleDraft = ['999999999999999999']; component.saveStaffRoles();
    expect(component.saveState).toBe('error'); expect(component.staffRoleDraft).toEqual(['999999999999999999']);
    component.retrySave();
    expect(service.updateModerationStaffRoles).toHaveBeenCalledTimes(2);
    expect(component.saveState).toBe('saved');
    expect(component.staffRoleDraft).toEqual(['999999999999999999']);
  });
  it('ignores stale save responses after switching guilds', () => {
    const delayedSave = new Subject<ModerationAccessState>();
    service.updateModerationStaffRoles.and.returnValue(delayedSave);
    create();
    component.saveStaffRoles();
    setRoute({ guildId: '20', section: 'overview' });
    const guildBPortaria = component.portaria;
    delayedSave.next({ ...moderationAccess, staffRoles: { roleIds: [], roles: [] } });
    expect(component.portaria).toBe(guildBPortaria);
    expect(component.staffRoleDraft).toEqual(staff.roleIds);
    expect(component.saveState).toBe('idle');
  });
  it('guards create flow against double submit', () => {
    const delayed = new Subject<PortariaState>();
    service.createPortariaFlow.and.returnValue(delayed);
    create();
    component.createFlow(); component.createFlow();
    expect(service.createPortariaFlow).toHaveBeenCalledTimes(1);
    expect(component.mutationInFlight).toBeTrue();
  });
  it('supports zero and multiple Portaria flows without selecting silently', () => {
    create(); component.portaria = { ...portaria, configured: false, flows: [], selectedFlow: undefined, questions: [] };
    expect(component.selectedFlow).toBeUndefined();
    component.portaria = { ...portaria, ambiguous: true, selectedFlow: undefined, flows: [portaria.flows[0], { ...portaria.flows[0], id: 2 }] };
    expect(component.selectedFlow).toBeUndefined();
  });
  it('edits up to five questions and derives both previews locally', () => {
    create(); component.portaria = { ...portaria, questions: [] }; for (let i = 0; i < 6; i++) component.addQuestion();
    expect(component.portaria!.questions.length).toBe(5);
    component.isolateVisitors = true;
    expect(component.portariaPreview.permissionChanges.some(change => change.target.name === 'geral' && change.effect === 'deny')).toBeTrue();
    expect(component.portariaPreview.affectedExistingResources.map(resource => resource.type)).toEqual(['category', 'category', 'voice', 'text', 'news', 'stage_voice', 'forum', 'media']);
    expect(component.privateAreaPreview.type).toBe('private-area');
  });
  it('loads logs independently and keeps configuration available when logs fail', () => {
    service.getLogs.and.returnValue(throwError(() => ({ error: { message: 'Logs offline' } }))); create(); component.loadLogs();
    expect(component.resources).toEqual(resources); expect(component.logsError).toBe('Logs offline');
  });
  it('summarizes complete, partial and limited protection without conflating structural canApply', () => {
    create();
    component.resources = { ...resources, botCapabilities: { ...resources.botCapabilities, hasAdministrator: true, roleHierarchyOk: true, protectionReady: true, rolesAboveBot: [] } };
    expect(component.protectionStatus).toBe('complete');
    component.resources = { ...resources, botCapabilities: { ...resources.botCapabilities, hasAdministrator: true, roleHierarchyOk: false, protectionReady: false, rolesAboveBot: [{ id: '3', name: 'Cargo alto', position: 20, managed: false }] } };
    expect(component.protectionStatus).toBe('partial');
    component.resources = { ...resources, botCapabilities: { ...resources.botCapabilities, hasAdministrator: false, roleHierarchyOk: false, protectionReady: false, rolesAboveBot: [] } };
    expect(component.protectionStatus).toBe('limited');
  });
  it('keeps protection unknown while a staggered rollout omits the new fields', () => {
    create(); component.resources = { ...resources, botCapabilities: { ...resources.botCapabilities } };
    expect(component.protectionStatus).toBe('unknown'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Status de proteção indisponível');
  });
  it('keeps explicit null protection fields unknown while explicit false stays limited', () => {
    create(); component.resources = { ...resources, botCapabilities: { ...resources.botCapabilities, hasAdministrator: null, roleHierarchyOk: null, protectionReady: null } };
    expect(component.protectionStatus).toBe('unknown');
    component.resources = { ...resources, botCapabilities: { ...resources.botCapabilities, hasAdministrator: false, roleHierarchyOk: false, protectionReady: false } };
    expect(component.protectionStatus).toBe('limited');
  });
  it('marks problematic log targets in the overview and leaves the overview usable after a logs error', () => {
    create(); component.logs = { logs: [{ type: 'warn', label: 'Warns', enabled: true, target: { id: '9', type: 'text', name: 'logs', parentId: null, parentName: null, writable: false, missing: false }, warnings: [] }], targets: [], legacyTypes: [] };
    expect(component.activeLogsCount).toBe(1); expect(component.logsHaveProblems).toBeTrue();
    service.getLogs.and.returnValue(throwError(() => ({ error: { message: 'offline' } }))); component.loadLogs();
    expect(component.resources).toBeDefined(); expect(component.logsError).toBe('offline');
  });
  it('keeps only unimplemented sections marked as coming-soon', () => {
    create();
    expect(component.sections.filter(section => section.status === 'coming-soon').map(section => section.id))
      .toEqual(['economy', 'tickets']);
    expect(component.sections.find(section => section.id === 'leveling')?.status).not.toBe('coming-soon');
    expect(component.sections.find(section => section.id === 'ai')?.status).not.toBe('coming-soon');
  });
  it('asks before navigation when staff, logs or Portaria has local changes', () => {
    create(); component.staffRoleDraft = []; component.selectSection('logs');
    expect(component.pendingNavigation).toEqual({ kind: 'route', guildId: component.selectedServerId, section: 'logs' });
    component.continueEditing(); component.staffRoleDraft = [...staff.roleIds]; component.updateLogTarget({ type: 'warn', label: 'Warns', enabled: false, target: null, warnings: [] }, '99'); component.selectSection('moderation-access');
    expect(component.pendingNavigation).toBeDefined(); component.continueEditing(); component.logDrafts['warn'].targetId = null; component.portaria!.questions[0].label = 'Mudou'; component.selectServer({ target: { value: '20' } } as unknown as Event);
    expect(component.pendingNavigation).toEqual({ kind: 'route', guildId: '20', section: 'overview' });
  });
  it('preserves unsaved Portaria drafts when toggling lifecycle', () => {
    create();
    component.portaria!.questions[0].label = 'Rascunho local';
    expect(component.portariaDirty).toBeTrue();

    const persisted = structuredClone(portaria);
    persisted.config.enabled = false;
    service.updatePortariaEnabled.and.returnValue(of(persisted));

    component.updatePortariaEnabled(false);

    expect(component.portaria?.config.enabled).toBeFalse();
    expect(component.portaria?.questions[0].label).toBe('Rascunho local');
    expect(component.portariaDirty).toBeTrue();
  });

  it('toggles Portaria lifecycle independently from the form setting', () => {
    create();
    expect(component.portaria?.config.enabled).toBeTrue();
    expect(component.portaria?.config.formularioPortariaAtivo).toBeTrue();

    const disabled = structuredClone(portaria);
    disabled.config.enabled = false;
    service.updatePortariaEnabled.and.returnValue(of(disabled));

    component.updatePortariaEnabled(false);

    expect(service.updatePortariaEnabled).toHaveBeenCalledWith(component.selectedServerId, false);
    expect(component.portaria?.config.enabled).toBeFalse();
    expect(component.portaria?.config.formularioPortariaAtivo).toBeTrue();
  });

  it('updates the restorable Portaria baseline only after a successful save', () => {
    create(); component.portaria!.questions[0].label = 'Alterado'; expect(component.portariaDirty).toBeTrue();
    const persisted = structuredClone(component.portaria!); service.updatePortariaForm.and.returnValue(of(persisted)); component.saveForm();
    expect(component.portaria?.questions[0].label).toBe('Alterado'); expect(component.portariaDirty).toBeFalse();
  });
  it('keeps a failed Portaria draft dirty', () => {
    service.updatePortariaForm.and.returnValue(throwError(() => ({ error: { message: 'Falhou' } }))); create(); component.portaria!.questions[0].label = 'Alterado'; component.saveForm();
    expect(component.portaria?.questions[0].label).toBe('Alterado'); expect(component.portariaDirty).toBeTrue();
  });
  it('restores the persisted Portaria state when discarding navigation', () => {
    create(); component.portaria!.questions[0].label = 'Alterado'; component.selectSection('logs'); expect(component.pendingNavigation).toBeDefined();
    component.discardAndNavigate(); expect(component.portaria?.questions[0].label).toBe('Como conheceu?'); expect(component.portariaDirty).toBeFalse();
  });
  it('keeps the current Portaria draft when continuing to edit', () => {
    create(); component.portaria!.questions[0].label = 'Alterado'; component.selectSection('logs'); component.continueEditing();
    expect(component.activeSection).toBe('overview'); expect(component.portaria?.questions[0].label).toBe('Alterado'); expect(component.portariaDirty).toBeTrue();
  });
  it('guards flow changes until discard and only then loads the requested flow', () => {
    create(); component.portaria!.questions[0].label = 'Alterado'; const event = { target: { value: '2' } } as unknown as Event;
    component.selectFlow(event); expect(component.pendingNavigation).toEqual({ kind: 'flow', flowId: 2 }); expect(service.getPortaria).toHaveBeenCalledTimes(1);
    component.continueEditing(); expect(component.portaria?.selectedFlow?.id).toBe(1); component.selectFlow(event); component.discardAndNavigate();
    expect(component.portaria?.questions[0].label).toBe('Como conheceu?'); expect(service.getPortaria).toHaveBeenCalledWith('1480343896461545606', 2);
  });
  it('tracks and restores Portaria wizard and private-area drafts', () => {
    create(); expect(component.hasUnsavedChanges()).toBeFalse(); component.portariaCategoryName = 'Entrada'; expect(component.hasUnsavedChanges()).toBeTrue();
    component.selectSection('logs'); component.discardAndNavigate(); expect(component.portariaCategoryName).toBe('Portaria');
    component.privateCategoryName = 'Nova área'; component.privateAllowedRoleIds = []; expect(component.hasUnsavedChanges()).toBeTrue(); component.selectSection('logs'); component.discardAndNavigate();
    expect(component.privateCategoryName).toBe('Staff'); expect(component.privateAllowedRoleIds).toEqual(staff.roleIds);
  });
  it('uses the current draft target when testing logs', () => {
    create(); component.loadLogs(); component.logDrafts['warn'].targetId = '123'; component.testLog(logs.logs[0]);
    expect(service.testLog).toHaveBeenCalledWith('1480343896461545606', 'warn', '123');
  });
  it('renders log cards in the requested product order', () => {
    create(); component.logs = { ...logs, logs: [
      { type: 'ban', label: 'Banimentos', enabled: false, target: null, warnings: [] },
      { type: 'profile', label: 'Alterações de perfil', enabled: false, target: null, warnings: [] },
      { type: 'warn', label: 'Warns', enabled: false, target: null, warnings: [] },
      { type: 'call', label: 'Logs de call', enabled: false, target: null, warnings: [] },
      { type: 'message_delete', label: 'Mensagens apagadas', enabled: false, target: null, warnings: [] },
      { type: 'mute', label: 'Castigos / mutes', enabled: false, target: null, warnings: [] },
      { type: 'message_edit', label: 'Mensagens editadas', enabled: false, target: null, warnings: [] },
    ] };
    expect(component.orderedLogs.map(log => log.type)).toEqual(['profile', 'message_edit', 'message_delete', 'call', 'mute', 'warn', 'ban']);
  });
  it('keeps large persisted ids as strings and exposes unavailable targets locally', () => {
    create(); const target = { id: '123456789012345678', type: 'text' as const, name: 'logs', parentId: null, parentName: null, writable: false, missing: false };
    const state: LogsState = { logs: [{ type: 'warn', label: 'Warns', enabled: true, target, warnings: [] }], targets: [], legacyTypes: [] };
    (component as any).reconcileLogs(state); expect(component.logDrafts['warn'].targetId).toBe('123456789012345678'); expect(component.logOptions(state.logs[0])[0].label).toContain('sem permissão');
  });
  it('shows the distinct no-permission warning for an existing target', () => {
    create(); component.logs = { logs: [{ type: 'warn', label: 'Warns', enabled: true, target: { id: '123', type: 'text', name: 'logs', parentId: null, parentName: null, writable: false, missing: false }, warnings: [] }], targets: [], legacyTypes: [] }; component.activeSection = 'logs'; fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Destino sem permissão');
  });
  it('refreshes clean drafts but preserves dirty drafts', () => {
    create(); const first: LogsState = { logs: [{ type: 'warn', label: 'Warns', enabled: false, target: { id: '111', type: 'text', name: 'a', parentId: null, parentName: null, writable: true, missing: false }, warnings: [] }], targets: [], legacyTypes: [] };
    (component as any).reconcileLogs(first); (component as any).reconcileLogs({ ...first, logs: [{ ...first.logs[0], target: { ...first.logs[0].target!, id: '222' } }] }); expect(component.logDrafts['warn'].targetId).toBe('222');
    component.updateLogTarget(component.logs!.logs[0], '999'); const refreshed = { ...first, targets: [], logs: [{ ...first.logs[0], target: { ...first.logs[0].target!, id: '222' } }] }; (component as any).reconcileLogs(refreshed); const draftOption = component.logOptions(refreshed.logs[0]).find(option => option.id === '999'); expect(component.logDrafts['warn'].targetId).toBe('999'); expect(component.isLogDirty(component.logs!.logs[0])).toBeTrue(); expect(draftOption?.disabled).toBeTrue(); expect(draftOption?.label).toContain('Destino selecionado indisponível');
  });
  it('selects a valid guild and Portaria from asynchronous route parameters', () => {
    routeParams.next(convertToParamMap({ guildId: '20', section: 'portaria' }));
    route.snapshot.paramMap = routeParams.value;
    create();
    expect(component.selectedServerId).toBe('20');
    expect(component.activeSection).toBe('portaria');
    expect(service.getResources).toHaveBeenCalledWith('20');
  });
  it('navigates when a section is selected in the UI', async () => {
    create(); spyOn(router, 'navigate').and.resolveTo(true);
    component.selectSection('portaria');
    await fixture.whenStable();
    expect(router.navigate).toHaveBeenCalledWith(['/painel/comunidades', 10, 'coddy', '1480343896461545606', 'portaria'], { replaceUrl: false });
  });
  it('blocks deactivation but permits repair activation while Portaria depends on Visitante', () => {
    create();
    component.activeSection = 'cargos-automaticos'; component.autoJoinRoles = autoJoinRoles;
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.secondary-button') as HTMLButtonElement;
    expect(button.textContent).toContain('Desativar'); expect(button.disabled).toBeTrue();
    component.autoJoinRoles = { ...autoJoinRoles, enabled: false }; fixture.detectChanges();
    expect(button.textContent).toContain('Ativar'); expect(button.disabled).toBeFalse();
  });
  it('refreshes automatic roles when entering their section and ignores an old guild response', () => {
    const delayed = new Subject<AutoJoinRolesState>(); service.getAutoJoinRoles.and.returnValue(delayed); create();
    setRoute({ guildId: '1480343896461545606', section: 'cargos-automaticos' });
    expect(service.getAutoJoinRoles).toHaveBeenCalledWith('1480343896461545606');
    setRoute({ guildId: '20', section: 'overview' });
    delayed.next({ ...autoJoinRoles, portariaVisitorRoleId: '456' });
    expect(component.selectedServerId).toBe('20'); expect(component.autoJoinRoles?.portariaVisitorRoleId).not.toBe('456');
  });
  it('adds then enables a missing Portaria visitor in one guarded sequence', () => {
    const missing = { enabled: false, roles: [], portariaVisitorRoleId: '123', warnings: [{ code: 'PORTARIA_VISITOR_NOT_AUTO_JOIN', message: 'incompleta' }] } as AutoJoinRolesState;
    const added = { ...missing, roles: [{ id: '123', name: 'Visitante', missing: false, protectedRole: true }], warnings: [{ code: 'PORTARIA_VISITOR_NOT_AUTO_JOIN', message: 'incompleta' }] };
    const finalState = { ...added, enabled: true, warnings: [] }; const addedResponse = new Subject<AutoJoinRolesState>();
    service.addAutoJoinRole.and.returnValue(addedResponse); service.updateAutoJoinEnabled.and.returnValue(of(finalState)); create(); component.autoJoinRoles = missing;
    component.repairPortariaVisitorAutoJoin(); component.repairPortariaVisitorAutoJoin();
    expect(service.addAutoJoinRole).toHaveBeenCalledOnceWith(component.selectedServerId, '123');
    addedResponse.next(added);
    expect(service.updateAutoJoinEnabled).toHaveBeenCalledOnceWith(component.selectedServerId, true);
    expect(component.autoJoinRoles).toEqual(finalState);
  });
  it('only enables when the Portaria visitor is already configured but disabled', () => {
    const disabled = { ...autoJoinRoles, enabled: false, warnings: [{ code: 'PORTARIA_VISITOR_NOT_AUTO_JOIN', message: 'incompleta' }] };
    const finalState = { ...disabled, enabled: true, warnings: [] };
    service.updateAutoJoinEnabled.and.returnValue(of(finalState)); create(); component.autoJoinRoles = disabled;
    component.repairPortariaVisitorAutoJoin();
    expect(service.addAutoJoinRole).not.toHaveBeenCalled();
    expect(service.updateAutoJoinEnabled).toHaveBeenCalledOnceWith(component.selectedServerId, true);
    expect(component.autoJoinRoles).toEqual(finalState);
  });
  it('recovers an invalid bookmark with no manageable Discord in the active Community', () => {
    contextState$.next({
      ...contextState$.value,
      managedDiscordServers: []
    });
    routeParams.next(convertToParamMap({ guildId: '999', section: 'portaria' }));
    route.snapshot.paramMap = routeParams.value;
    create();
    spyOn(router, 'navigate').and.resolveTo(true);

    component.backToServers();

    expect(router.navigate).toHaveBeenCalledWith(['/painel/comunidades', 10, 'coddy']);
  });
  it('recovers an invalid guild to the first valid server when one is available', () => {
    routeParams.next(convertToParamMap({ guildId: '999', section: 'portaria' })); route.snapshot.paramMap = routeParams.value;
    create(); spyOn(router, 'navigate').and.resolveTo(true);
    component.backToServers();
    expect(router.navigate).toHaveBeenCalledWith(['/painel/comunidades', 10, 'coddy', '1480343896461545606', 'overview'], { replaceUrl: false });
  });
  it('derives saved, unsaved and pending staff removal states without depending on role order', () => {
    create();
    component.staff = { roleIds: ['999999999999999999', '3'], roles: resources.roles };
    component.staffRoleDraft = ['3', '999999999999999999'];
    expect(component.staffRolesDirty).toBeFalse();
    component.staffRoleDraft = ['999999999999999999', '1'];
    expect(component.staffRolesDirty).toBeTrue();
    expect(component.pendingStaffRemovals.map(role => role.id)).toEqual(['3']);
    component.restoreStaffRole('3');
    expect(component.pendingStaffRemovals).toEqual([]);
    component.staffRoleDraft = ['999999999999999999', '3'];
    service.updateModerationStaffRoles.and.returnValue(of({ ...moderationAccess, staffRoles: { roleIds: ['999999999999999999', '3'], roles: resources.roles } }));
    component.saveStaffRoles();
    expect(component.staffRolesDirty).toBeFalse();
  });
  it('preserves a staff role added while an earlier save is pending', () => {
    const delayed = new Subject<ModerationAccessState>();
    service.updateModerationStaffRoles.and.returnValue(delayed);
    create();
    component.staff = { roleIds: ['999999999999999999', '3'], roles: resources.roles };
    component.staffRoleDraft = ['999999999999999999', '3'];
    component.saveStaffRoles();
    expect(service.updateModerationStaffRoles).toHaveBeenCalledWith(component.selectedServerId, ['999999999999999999', '3']);
    component.addRole(component.staffRoleDraft, '1');
    delayed.next({ ...moderationAccess, staffRoles: { roleIds: ['999999999999999999', '3'], roles: resources.roles } });
    expect(component.staff?.roleIds).toEqual(['999999999999999999', '3']);
    expect(component.staffRoleDraft).toEqual(['999999999999999999', '3', '1']);
    expect(component.staffRolesDirty).toBeTrue();
  });
  it('preserves a pending staff removal made while a save is pending', () => {
    const delayed = new Subject<ModerationAccessState>();
    service.updateModerationStaffRoles.and.returnValue(delayed);
    create();
    component.staff = { roleIds: ['999999999999999999', '3'], roles: resources.roles };
    component.staffRoleDraft = ['999999999999999999', '3'];
    component.saveStaffRoles();
    component.removeRole(component.staffRoleDraft, '3');
    delayed.next({ ...moderationAccess, staffRoles: { roleIds: ['999999999999999999', '3'], roles: resources.roles } });
    expect(component.staffRoleDraft).toEqual(['999999999999999999']);
    expect(component.pendingStaffRemovals.map(role => role.id)).toEqual(['3']);
    expect(component.staffRolesDirty).toBeTrue();
  });
  it('orders roles high to low and returns removed roles to the available selection', () => {
    create();
    expect(component.orderedRoles.map(role => role.id)).toEqual(['3', '999999999999999999', '1']);
    component.addRole(component.privateAllowedRoleIds, '3');
    expect(component.privateAllowedRoleIds).toContain('3');
    component.removeRole(component.privateAllowedRoleIds, '3');
    expect(component.privateAllowedRoleIds).not.toContain('3');
    expect(component.privateAllowedRoleIds).toEqual(['999999999999999999']);
  });
  it('keeps an empty role list valid and renders distinct welcome permissions with four Portaria channels', () => {
    create();
    component.portaria!.configured = false;
    component.staffRoleDraft = [];
    component.privateAllowedRoleIds = [];
    expect(component.privateAreaPreview.permissionChanges.filter(change => change.subject.kind === 'role')).toEqual([]);
    const preview = component.portariaPreview;
    expect(preview.creates.channels.map(channel => channel.name)).toEqual(['boas-vindas', 'fichas', 'aprovados', 'reprovados']);
    expect(preview.permissionChanges.some(change => change.target.name === 'boas-vindas' && change.subject.kind === 'everyone' && change.effect === 'deny')).toBeTrue();
    expect(preview.permissionChanges.some(change => change.target.name === 'boas-vindas' && change.subject.kind === 'planned-role' && change.effect === 'allow')).toBeTrue();
    expect(preview.permissionChanges.some(change => change.target.name === 'fichas' && change.subject.kind === 'everyone' && change.effect === 'deny')).toBeTrue();
    expect(preview.permissionChanges.some(change => change.target.name === 'fichas' && change.subject.kind === 'planned-role' && change.effect === 'deny')).toBeTrue();
    component.activeSection = 'portaria';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Permissões planejadas');
    expect(fixture.nativeElement.textContent).toContain('@everyone');
    expect(fixture.nativeElement.textContent).toContain('negado');
  });
  it('keeps staff global while allowing it to be removed from the private area preview', () => {
    create();
    expect(component.privateAllowedRoleIds).toEqual(staff.roleIds);
    component.removeRole(component.privateAllowedRoleIds, '999999999999999999');
    expect(component.staffRoleDraft).toEqual(['999999999999999999']);
    expect(component.privateAreaPreview.permissionChanges.some(change => change.subject.id === '999999999999999999' && change.effect === 'allow')).toBeFalse();
    component.addRole(component.privateAllowedRoleIds, '3');
    expect(component.privateAreaPreview.permissionChanges.some(change => change.subject.id === '3' && change.effect === 'allow')).toBeTrue();
    expect(component.privateAreaPreview.permissionChanges.some(change => change.subject.kind === 'everyone' && change.effect === 'deny')).toBeTrue();
  });
  it('uses only text and news channels in Portaria destinations and keeps an empty text default valid', () => {
    create();
    expect(component.textChannels.map(channel => channel.type)).toEqual(['text', 'news']);
    component.activeSection = 'portaria';
    fixture.detectChanges();
    const destinations = [...fixture.nativeElement.querySelectorAll('select.field-control')] as HTMLSelectElement[];
    const optionText = destinations.flatMap(select => Array.from(select.options).map(option => option.text));
    expect(optionText.some(text => text.includes('voz') || text.includes('palco') || text.includes('forum') || text.includes('midia'))).toBeFalse();
    component.resources = { ...resources, channels: resources.channels.filter(channel => channel.type === 'voice') };
    component.newFlowTargetChannelId = component.textChannels[0]?.id ?? '';
    expect(component.textChannels).toEqual([]);
    expect(component.newFlowTargetChannelId).toBe('');
  });
  it('hides the Discord network selector when exactly one managed network belongs to the Community', () => {
    contextState$.next({
      ...contextState$.value,
      managedDiscordServers: [servers[0]]
    });
    create();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#managed-server')).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('Configurações do Coddy');
    expect(fixture.nativeElement.textContent).toContain('Coddy online');
  });

  it('shows the Discord network selector when multiple managed networks belong to the Community', () => {
    create();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('#managed-server') as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    expect(select?.options.length).toBe(2);
  });

  it('never accepts a route guild outside the active Community managed-network intersection', () => {
    contextState$.next({
      ...contextState$.value,
      managedDiscordServers: [servers[0]]
    });
    routeParams.next(convertToParamMap({ guildId: '20', section: 'overview' }));
    route.snapshot.paramMap = routeParams.value;

    create();

    expect(component.invalidGuild).toBeTrue();
    expect(service.getResources).not.toHaveBeenCalledWith('20');
  });


  it('keeps configured bypasses ineffective while Portaria is disabled', () => {
    const configured: PortariaBypass = {
      id: 11,
      type: 'account',
      value: '555',
      accessMode: 'completo',
      requiresForm: false,
      active: true,
      effective: false,
      expiresAt: null,
      expired: false,
      createdAt: null,
      updatedAt: null
    };
    service.getPortariaBypasses.and.returnValue(of({
      portariaEnabled: false,
      bypasses: [configured]
    }));
    create();

    component.loadPortariaBypasses();

    expect(component.bypassPortariaEnabled).toBeFalse();
    expect(component.portariaBypasses[0].active).toBeTrue();
    expect(component.portariaBypasses[0].effective).toBeFalse();
  });

  it('ignores stale bypass responses for the same guild', () => {
    const first = new Subject<PortariaBypassesState>();
    const second = new Subject<PortariaBypassesState>();
    service.getPortariaBypasses.and.returnValues(first, second);
    create();

    component.loadPortariaBypasses();
    component.loadPortariaBypasses();
    second.next({ portariaEnabled: true, bypasses: [{
      id: 2, type: 'invite', value: 'NewCode', accessMode: null, requiresForm: null,
      active: true, effective: true, expiresAt: null, expired: false, createdAt: null, updatedAt: null
    }] });
    first.next({ portariaEnabled: true, bypasses: [{
      id: 1, type: 'invite', value: 'OldCode', accessMode: null, requiresForm: null,
      active: true, effective: true, expiresAt: null, expired: false, createdAt: null, updatedAt: null
    }] });

    expect(component.portariaBypasses.map(item => item.value)).toEqual(['NewCode']);
  });

  it('treats bypass type and id together as local identity', () => {
    const invite: PortariaBypass = {
      id: 1, type: 'invite', value: 'Code', accessMode: null, requiresForm: null,
      active: true, effective: true, expiresAt: null, expired: false, createdAt: null, updatedAt: null
    };
    const account: PortariaBypass = {
      id: 1, type: 'account', value: '555', accessMode: 'completo', requiresForm: false,
      active: true, effective: true, expiresAt: null, expired: false, createdAt: null, updatedAt: null
    };
    service.removePortariaBypass.and.returnValue(of(void 0));
    create();
    component.portariaBypasses = [invite, account];

    component.removePortariaBypass(invite);

    expect(component.portariaBypasses).toEqual([account]);
  });

});
