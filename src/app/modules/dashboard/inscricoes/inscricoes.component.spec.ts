import { BehaviorSubject, of, throwError } from 'rxjs';
import { CommunityContextService, CommunityContextState } from '../../../core/services/community-context.service';
import {
  RecruitmentCandidatesService, CandidateApplicationForm
} from '../../../core/services/recruitment-candidates.service';
import { InscricoesComponent } from './inscricoes.component';
import { RecruitmentTrackingService } from '../../../core/services/recruitment-tracking.service';

describe('InscricoesComponent', () => {
  let subject: BehaviorSubject<CommunityContextState>;
  let api: jasmine.SpyObj<RecruitmentCandidatesService>;
  let tracking: jasmine.SpyObj<RecruitmentTrackingService>;
  let component: InscricoesComponent;

  const process = { id: 70, title: 'Staff', description: 'Seleção',
    enrollmentEndsAt: '2026-11-10T22:00:00Z' };
  const application: CandidateApplicationForm = {
    process, publishedVersionId: 71, firstStageId: 72,
    form: { questions: [
      { id: 'motivation', label: 'Motivação', type: 'SHORT_TEXT', required: true,
        options: [], minValue: null, maxValue: null },
      { id: 'skills', label: 'Habilidades', type: 'MULTIPLE_CHOICE', required: true,
        options: [{id:'a',label:'A'},{id:'b',label:'B'}], minValue: null, maxValue: null }
    ]},
    termsText: 'Declaro que li e aceito os termos da seleção BraFurries.',
    termsHash: 'a'.repeat(64), eligible: true, eligibilityBlockers: []
  };
  const state: CommunityContextState = {
    status: 'ready',
    communities: [{
      communityId: 11, name: 'BraFurries', ownedByMe: false, ownerAssigned: true,
      member: true, networks: [{type:'DISCORD', externalId:'753321055682035712',
        name:'BraFurries', active:true}]
    }],
    activeCommunity: {
      communityId: 11, name: 'BraFurries', ownedByMe: false, ownerAssigned: true,
      member: true, networks: [{type:'DISCORD', externalId:'753321055682035712',
        name:'BraFurries', active:true}]
    },
    activeAccess: {
      communityId: 11, owner: false, communityAdmin: false, activeMember: true,
      canManageCommunityAdmins: false, activeRoleIds: [], capabilities: [],
      teamScopes: []
    },
    managedDiscordServers: [], managedServersAvailable: true, errorMessage:''
  };

  beforeEach(() => {
    subject = new BehaviorSubject<CommunityContextState>(state);
    const context = {
      state$: subject.asObservable(),
      canAccessFeature: (_feature: string, next: CommunityContextState) =>
        next.activeAccess?.activeMember === true
    } as CommunityContextService;
    api = jasmine.createSpyObj('RecruitmentCandidatesService', ['list','form','submit']);
    api.list.and.returnValue(of([process]));
    api.form.and.returnValue(of(application));
    api.submit.and.returnValue(of({
      applicationId: 123, publishedVersionId: 71,
      status:'IN_PROGRESS',submittedAt:'2026-10-22T11:00:00Z'
    }));
    tracking = jasmine.createSpyObj('RecruitmentTrackingService',['mine']);
    tracking.mine.and.returnValue(of([{ id: 400, processId: 70, processTitle: 'Seleção encerrada',
      submittedAt: '2026-10-20T11:00:00Z', publicStatus: 'RECEIVED' }]));
    component = new InscricoesComponent(context,api,tracking);
    component.ngOnInit();
  });

  afterEach(() => component.ngOnDestroy());

  it('shows only open recruitment processes to eligible community members', () => {
    expect(api.list).toHaveBeenCalledOnceWith(11);
    expect(component.processes.map(p=>p.id)).toEqual([70]);
    component.open(70);
    expect(api.form).toHaveBeenCalledOnceWith(11,70);
    expect(component.selected?.form.questions.length).toBe(2);
  });

  it('shows own receipt even when intake is no longer open, without internal result', () => {
    expect(tracking.mine).toHaveBeenCalledOnceWith(11);
    expect(component.ownApplications.map(x => x.publicStatus)).toEqual(['RECEIVED']);
    expect(component.ownApplications[0].processTitle).toBe('Seleção encerrada');
    expect(component.ownApplications[0].id).toBe(400);
  });

  it('requires explicit terms and submits only candidate response values', () => {
    component.open(70);
    component.answers['motivation'] = 'Quero ajudar';
    component.toggleMultiple(application.form.questions[1],'a',true);
    component.apply();
    expect(api.submit).not.toHaveBeenCalled();
    component.acceptedTerms = true;
    component.apply();
    expect(api.submit).toHaveBeenCalledOnceWith(11,70,'a'.repeat(64),{
      motivation:'Quero ajudar',skills:['a']
    });
    expect(component.submitted?.applicationId).toBe(123);
    expect(component.answers).toEqual({});
    expect(tracking.mine).toHaveBeenCalledTimes(2);
  });

  it('never sends a form when server says candidate is ineligible', () => {
    api.form.and.returnValue(of({
      ...application, eligible:false,
      eligibilityBlockers:['Membro VIP obrigatório']
    }));
    component.open(70);
    component.acceptedTerms = true;
    expect(component.canSubmit).toBeFalse();
    component.apply();
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('does not automatically retry a duplicate candidacy', () => {
    api.submit.and.returnValue(throwError(() => ({status:409})));
    component.open(70);
    component.acceptedTerms = true;
    component.apply();
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(component.error).toContain('já existe uma candidatura');
  });

  it('clears answers on access loss or community switch', () => {
    component.open(70);
    component.answers['motivation'] = 'private';
    subject.next({...state, activeAccess:{...state.activeAccess!,activeMember:false}});
    expect(component.communityId).toBeNull();
    expect(component.answers).toEqual({});
    expect(component.selected).toBeNull();
    expect(component.ownApplications).toEqual([]);
    expect(api.list).toHaveBeenCalledTimes(1);
  });
});
