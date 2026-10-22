import { BehaviorSubject, of, throwError } from 'rxjs';
import { CommunityContextService, CommunityContextState } from '../../../core/services/community-context.service';
import { RecruitmentDraftsService, RecruitmentDraft, RecruitmentStageDefinition } from '../../../core/services/recruitment-drafts.service';
import { RecrutamentoComponent } from './recrutamento.component';

describe('RecrutamentoComponent', () => {
  let state$: BehaviorSubject<CommunityContextState>;
  let service: jasmine.SpyObj<RecruitmentDraftsService>;
  let component: RecrutamentoComponent;

  const process = {
    id: 7, communityId: 10, title: 'Seleção de Staff', description: null,
    status: 'DRAFT', visibility: 'PRIVATE', enrollmentStatus: 'CLOSED', draftVersion: 1, draftRevision: 0
  };
  const stage = {
    id: 100, processId: 7, processVersionId: 30, position: 1,
    internalName: 'Prova', publicName: 'Avaliação', stageType: 'AUTO_EVALUATION' as const
  };
  const draft: RecruitmentDraft = { process, stages: [stage] };
  const definition: RecruitmentStageDefinition = {
    id: 100, processId: 7, versionId: 30, position: 1,
    internalName: 'Prova', publicName: 'Avaliação', stageType: 'AUTO_EVALUATION',
    candidateForm: null, staffForm: null, draftRevision: 0
  };
  const authorized: CommunityContextState = {
    status: 'ready',
    communities: [{
      communityId: 10, name: 'BraFurries', ownedByMe: true, ownerAssigned: true,
      member: true, networks: [{ type: 'DISCORD', externalId: '753321055682035712', name: 'BraFurries', active: true }]
    }],
    activeCommunity: {
      communityId: 10, name: 'BraFurries', ownedByMe: true, ownerAssigned: true,
      member: true, networks: [{ type: 'DISCORD', externalId: '753321055682035712', name: 'BraFurries', active: true }]
    },
    activeAccess: {
      communityId: 10, owner: true, communityAdmin: false, activeMember: true,
      canManageCommunityAdmins: true, activeRoleIds: [],
      capabilities: ['RECRUITMENT_MANAGE_PROCESSES'], teamScopes: []
    },
    managedDiscordServers: [], managedServersAvailable: true, errorMessage: ''
  };

  beforeEach(() => {
    state$ = new BehaviorSubject<CommunityContextState>(authorized);
    const context = {
      state$: state$.asObservable(),
      canAccessFeature: (_feature: string, state: CommunityContextState) =>
        state.activeAccess?.capabilities.some(capability =>
          capability === 'RECRUITMENT_MANAGE_PROCESSES'
          || capability === 'RECRUITMENT_PUBLISH_PROCESSES') === true
    } as CommunityContextService;
    service = jasmine.createSpyObj('RecruitmentDraftsService',
      ['list', 'create', 'detail', 'appendStage', 'definition', 'saveStage', 'reorder', 'removeStage',
        'previewPublication', 'configureEligibility', 'publishProcess']);
    service.list.and.returnValue(of([{ ...process }]));
    service.detail.and.returnValue(of({ process: { ...process }, stages: [{ ...stage }] }));
    service.definition.and.returnValue(of(definition));
    service.reorder.and.returnValue(of([stage]));
    service.saveStage.and.returnValue(of({ ...definition, candidateForm: { questions: [] } }));
    service.removeStage.and.returnValue(of(void 0));
    service.previewPublication.and.returnValue(of({
      processId: 7, processVersionId: 30, draftRevision: 0, ready: true,
      stageCount: 1, blockers: [],
      configuredEligibility: { minMembershipDays: 0, requireVip: false, requirePartner: false }
    }));
    service.configureEligibility.and.returnValue(of({
      processId: 7, processVersionId: 30, draftRevision: 1, ready: true,
      stageCount: 1, blockers: [],
      configuredEligibility: { minMembershipDays: 30, requireVip: false, requirePartner: false }
    }));
    service.publishProcess.and.returnValue(of({
      processId: 7, versionId: 30, draftRevision: 1,
      processStatus: 'ACTIVE', versionStatus: 'PUBLISHED',
      enrollmentStatus: 'CLOSED', visibility: 'PRIVATE'
    }));
    component = new RecrutamentoComponent(context, service);
    component.ngOnInit();
  });

  afterEach(() => component.ngOnDestroy());

  it('loads only scoped process drafts when authorized', () => {
    expect(component.communityId).toBe(10);
    expect(component.processes.map(p => p.id)).toEqual([7]);
    expect(service.list).toHaveBeenCalledOnceWith(10);
    component.openProcess(7);
    expect(service.detail).toHaveBeenCalledOnceWith(10, 7);
    expect(component.process?.process.status).toBe('DRAFT');
  });

  it('provides independent candidate and staff questions', () => {
    component.openProcess(7);
    component.openStage(stage);
    component.addQuestion();
    expect(component.activeQuestions[0].type).toBe('SINGLE_CHOICE');
    expect(component.activeQuestions[0].correctAnswers).toEqual(['a']);

    component.setAudience('staff');
    expect(component.activeQuestions).toEqual([]);
    component.addQuestion();
    expect(component.activeQuestions[0].type).toBe('LONG_TEXT');
    expect(component.activeQuestions[0].correctAnswers).toEqual([]);
    expect(component.selectedStage?.candidateForm?.questions.length).toBe(1);
    expect(component.selectedStage?.staffForm?.questions.length).toBe(1);
  });

  it('preserves unsaved form and only reloads stale editor after explicit action', () => {
    component.openProcess(7);
    component.openStage(stage);
    component.addQuestion();
    const unsaved = component.selectedStage!.candidateForm!.questions;
    expect(unsaved.length).toBe(1);

    const conflict = { status: 409 };
    service.saveStage.and.returnValue(throwError(() => conflict));
    component.saveStage();

    expect(component.revisionConflict).toBeTrue();
    expect(component.selectedStage?.candidateForm?.questions.length).toBe(1);
    expect(service.detail).toHaveBeenCalledTimes(1);

    component.reloadAfterConflict();
    expect(service.detail).toHaveBeenCalledTimes(2);
    expect(component.revisionConflict).toBeFalse();
  });

  it('never loads drafts after losing recruitment capability', () => {
    state$.next({ ...authorized, activeAccess: {
      ...authorized.activeAccess!, capabilities: []
    }});
    expect(component.communityId).toBeNull();
    expect(component.process).toBeNull();
    expect(component.processes).toEqual([]);
    component.createProcess();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('configures eligibility with expected revision and refreshes preflight', () => {
    component.openProcess(7);
    expect(service.previewPublication).toHaveBeenCalledOnceWith(10, 7);
    component.eligibility.minMembershipDays = 30;
    component.saveEligibility();
    expect(service.configureEligibility).toHaveBeenCalledOnceWith(10, 7, 0, {
      minMembershipDays: 30, requireVip: false, requirePartner: false
    });
    expect(component.process?.process.draftRevision).toBe(1);
  });

  it('publishes only after confirmation and leaves intake closed', () => {
    state$.next({ ...authorized, activeAccess: {
      ...authorized.activeAccess!,
      capabilities: ['RECRUITMENT_MANAGE_PROCESSES', 'RECRUITMENT_PUBLISH_PROCESSES']
    }});
    component.openProcess(7);
    component.publishProcess();
    expect(service.publishProcess).not.toHaveBeenCalled();
    component.confirmPublication = true;
    component.publishProcess();
    expect(service.publishProcess).toHaveBeenCalledOnceWith(10, 7, 0);
    expect(component.process?.process.status).toBe('ACTIVE');
    expect(component.process?.process.enrollmentStatus).toBe('CLOSED');
    expect(component.process?.process.visibility).toBe('PRIVATE');
  });

  it('publish-only staff can inspect selection but cannot edit gabaritos', () => {
    state$.next({ ...authorized, activeAccess: {
      ...authorized.activeAccess!, capabilities: ['RECRUITMENT_PUBLISH_PROCESSES']
    }});
    component.openProcess(7);
    expect(component.canManage).toBeFalse();
    expect(component.canPublish).toBeTrue();
    expect(component.canEdit).toBeFalse();
    component.openStage(stage);
    expect(service.definition).not.toHaveBeenCalled();
    component.createProcess();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('submits exact stage permutation without modifying local stages first', () => {
    component.openProcess(7);
    const other = { ...stage, id: 101, position: 2 };
    component.process!.stages = [stage, other];
    service.reorder.and.returnValue(of([{ ...other, position: 1 }, { ...stage, position: 2 }]));
    component.moveStage(0, 1);
    expect(service.reorder).toHaveBeenCalledOnceWith(10, 7, [101, 100], 0);
    expect(component.process?.process.draftRevision).toBe(1);
    expect(component.process?.stages.map(s => s.id)).toEqual([101, 100]);
  });
});
