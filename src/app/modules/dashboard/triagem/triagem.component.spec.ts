import { BehaviorSubject, of, throwError } from 'rxjs';
import { CommunityContextService, CommunityContextState } from '../../../core/services/community-context.service';
import {
  RecruitmentTrackingService, ReviewApplication, ReviewQueueItem
} from '../../../core/services/recruitment-tracking.service';
import { TriagemComponent } from './triagem.component';

describe('TriagemComponent', () => {
  let state$: BehaviorSubject<CommunityContextState>;
  let tracking: jasmine.SpyObj<RecruitmentTrackingService>;
  let component: TriagemComponent;

  const state: CommunityContextState = {
    status: 'ready',
    communities: [{
      communityId: 11, name: 'BraFurries', ownedByMe: false, ownerAssigned: true,
      member: true, networks: [{type:'DISCORD',externalId:'753321055682035712',
        name:'BraFurries',active:true}]
    }],
    activeCommunity: {
      communityId: 11, name: 'BraFurries', ownedByMe: false, ownerAssigned: true,
      member: true, networks: [{type:'DISCORD',externalId:'753321055682035712',
        name:'BraFurries',active:true}]
    },
    activeAccess: {
      communityId: 11, owner: false, communityAdmin: false, activeMember: true,
      canManageCommunityAdmins: false, activeRoleIds: [],
      capabilities: ['RECRUITMENT_REVIEW_APPLICATIONS'], teamScopes: []
    },
    managedDiscordServers: [], managedServersAvailable: true, errorMessage:''
  };

  const queueItem: ReviewQueueItem = {
    id: 50, processId: 70, processVersionId: 80,
    candidateUserId: 99, processTitle: 'Staff', internalStatus: 'IN_PROGRESS',
    submittedAt: '2026-10-22T10:00:00Z'
  };
  const details: ReviewApplication = {
    application: queueItem,
    stages: [{
      stageId: 90, position: 1, publicName: 'Inscrição', stageType: 'APPLICATION',
      internalStatus: 'AWAITING_REVIEW', enteredAt: '2026-10-22T10:00:00Z',
      completedAt: null
    }],
    submittedStageId: 90,
    candidateAnswers: { motivation: 'Quero ajudar', availability: ['sáb','dom'] }
  };

  beforeEach(() => {
    state$ = new BehaviorSubject<CommunityContextState>(state);
    const context = {
      state$: state$.asObservable(),
      canAccessFeature: (_feature: string, current: CommunityContextState) =>
        current.activeAccess?.capabilities.includes('RECRUITMENT_REVIEW_APPLICATIONS') === true
    } as CommunityContextService;
    tracking = jasmine.createSpyObj('RecruitmentTrackingService',
      ['reviewProcesses','queue','reviewDetail','assessmentForm','ownAssessment','submitAssessment']);
    tracking.reviewProcesses.and.returnValue(of([{ id: 70, title: 'Staff' }]));
    tracking.queue.and.returnValue(of([queueItem]));
    tracking.reviewDetail.and.returnValue(of(details));
    tracking.assessmentForm.and.returnValue(of({questions: []}));
    tracking.ownAssessment.and.returnValue(throwError(() => ({status:404})));
    tracking.submitAssessment.and.returnValue(of({
      id: 6, applicationId: 50, stageId: 90, evaluatorUserId: 77,
      score: 80, opinion: 'Bom', staffAnswers: {}, submittedAt: '2026-10-22T12:00:00Z'
    }));
    component = new TriagemComponent(context, tracking);
    component.ngOnInit();
  });

  afterEach(() => component.ngOnDestroy());

  it('loads only permitted process and queue in current Community', () => {
    expect(tracking.reviewProcesses).toHaveBeenCalledOnceWith(11);
    expect(tracking.queue).toHaveBeenCalledOnceWith(11,70,undefined);
    expect(component.queue[0].id).toBe(50);
    expect(component.processId).toBe(70);
  });

  it('displays candidate submitted answers as plain values, not decisions', () => {
    component.detail(queueItem);
    expect(tracking.reviewDetail).toHaveBeenCalledOnceWith(11,50);
    expect(component.selected?.stages[0].internalStatus).toBe('AWAITING_REVIEW');
    expect(component.answerEntries).toEqual([
      {question:'motivation',answer:'Quero ajudar'},
      {question:'availability',answer:'["sáb","dom"]'}
    ]);
  });

  it('drops sensitive review content immediately after losing reviewer access', () => {
    component.detail(queueItem);
    state$.next({...state,activeAccess: {
      ...state.activeAccess!, capabilities: ['RECRUITMENT_MANAGE_PROCESSES']
    }});
    expect(component.communityId).toBeNull();
    expect(component.selected).toBeNull();
    expect(component.queue).toEqual([]);
    expect(component.processes).toEqual([]);
  });

  it('opens only assigned review stage form and saves a private opinion', () => {
    component.detail(queueItem);
    component.openAssessment(details.stages[0]);
    expect(tracking.assessmentForm).toHaveBeenCalledOnceWith(11,50,90);
    expect(component.assessmentForm?.questions).toEqual([]);
    component.score = 80;
    component.opinion = 'Bom';
    component.submitAssessment();
    expect(tracking.submitAssessment).toHaveBeenCalledOnceWith(
      11,50,90,{score:80, opinion:'Bom', staffAnswers:{}}
    );
    expect(component.savedAssessment?.opinion).toBe('Bom');
    component.submitAssessment();
    expect(tracking.submitAssessment).toHaveBeenCalledTimes(1);
  });

  it('drops private form, answers and score on Community access revocation', () => {
    component.detail(queueItem);
    component.openAssessment(details.stages[0]);
    component.score = 40;
    component.opinion = 'Confidencial';
    component.staffAnswers['private'] = 'segredo';
    state$.next({...state,activeAccess: {
      ...state.activeAccess!, capabilities: []
    }});
    expect(component.selected).toBeNull();
    expect(component.assessmentForm).toBeNull();
    expect(component.assessmentStage).toBeNull();
    expect(component.savedAssessment).toBeNull();
    expect(component.staffAnswers).toEqual({});
    expect(component.score).toBeNull();
    expect(component.opinion).toBe('');
  });

  it('never offers automatic evaluation as a human assessment', () => {
    component.detail(queueItem);
    const automatic = {...details.stages[0], stageType:'AUTO_EVALUATION'};
    expect(component.canAssess(automatic)).toBeFalse();
    component.openAssessment(automatic);
    expect(tracking.assessmentForm).not.toHaveBeenCalled();
  });

  it('does not retry inaccessible candidate details', () => {
    tracking.reviewDetail.and.returnValue(throwError(() => ({status:403})));
    component.detail(queueItem);
    expect(component.selected).toBeNull();
    expect(component.error).toContain('não tem permissão');
    expect(tracking.reviewDetail).toHaveBeenCalledTimes(1);
  });
});
