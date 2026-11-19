import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, ParamMap, RouterModule } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  CreatorCalendarItem, CreatorCommission, CreatorCommissionStep, CreatorStudioService
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../shared/models/user';
import { CreatorCommissionDetailsComponent } from './creator-commission-details.component';
import { CreatorCalendarComponent } from './creator-calendar.component';

describe('CreatorCommissionDetailsComponent', () => {
  let fixture: ComponentFixture<CreatorCommissionDetailsComponent>;
  let component: CreatorCommissionDetailsComponent;
  let studio: jasmine.SpyObj<CreatorStudioService>;
  let users: jasmine.SpyObj<UserService>;
  let user$: BehaviorSubject<User | null>;
  let routeParams$: BehaviorSubject<ParamMap>;
  const user: User = {
    id:31,name:'Artista',email:'artist@example.invalid',
    roles:[],permissions:[],profileImageUrl:null
  };
  const commission: CreatorCommission = {
    id:85,title:'Ref Sheet',clientName:'Cliente',description:'Detalhes',
    privateNotes:'Privado',requestedOn:'2026-11-12',dueOn:null,
    artTypeId:null,status:'IN_PROGRESS',
    createdAtUtc:'2026-11-17T12:00:00',updatedAtUtc:'2026-11-17T12:00:00',
    completedAtUtc:null,currentStageName:'Rascunho',currentStagePosition:1
  };

  const step: CreatorCommissionStep={id:90,commissionId:85,position:1,name:'Rascunho',
    stageDefinitionId:7,status:'PENDING',notes:'Manter pose',completedAtUtc:null};
  const plan: CreatorCalendarItem={kind:'STEP',commissionId:85,stepId:90,title:'Ref Sheet',
    clientName:'Cliente',stepName:'Rascunho',commissionStatus:'IN_PROGRESS',stepStatus:'PENDING',date:null};

  beforeEach(async () => {
    user$ = new BehaviorSubject<User | null>(user);
    routeParams$ = new BehaviorSubject<ParamMap>(convertToParamMap({id:'85'}));
    users=jasmine.createSpyObj<UserService>(
      'UserService',['getUser'],{user$:user$.asObservable()});
    users.getUser.and.callFake(() => user$.value);
    studio=jasmine.createSpyObj<CreatorStudioService>('CreatorStudioService',
      ['myAccess','findCommission','references','activity',
       'createReference','updateReference','deleteReference','createActivity','commissionPlanning','setPlanningDate',
       'artTypes','commissionSteps','update','changeStatus','moveCommissionToStep','updateCommissionStep',
       'stageDefinitions','workflows','addCommissionStep','deleteCommissionStep','copyWorkflowToCommission']);
    studio.myAccess.and.returnValue(of({
      allowed:true,tier:'PRO',status:'ACTIVE',sourceKind:'PILOT',expiresAtUtc:null
    }));
    studio.findCommission.and.returnValue(of(commission));
    studio.references.and.returnValue(of([]));
    studio.commissionPlanning.and.returnValue(of([plan]));
    studio.artTypes.and.returnValue(of([{id:7,name:'Reference Sheet',workflowId:null}]));
    studio.commissionSteps.and.returnValue(of([step]));
    studio.stageDefinitions.and.returnValue(of([{id:7,name:'Rascunho'}]));
    studio.workflows.and.returnValue(of([{id:8,name:'Modelo',isDefault:false,steps:[]}]));
    studio.addCommissionStep.and.returnValue(of(step));
    studio.deleteCommissionStep.and.returnValue(of(undefined));
    studio.copyWorkflowToCommission.and.returnValue(of([step]));
    studio.update.and.returnValue(of(commission));
    studio.changeStatus.and.returnValue(of(commission));
    studio.moveCommissionToStep.and.returnValue(of([step]));
    studio.updateCommissionStep.and.returnValue(of(step));
    studio.setPlanningDate.and.returnValue(of(undefined));
    studio.activity.and.returnValue(of({items:[],page:1,pageSize:20,total:0}));
    studio.createReference.and.returnValue(of({
      id:5,commissionId:85,label:'Pose',url:'https://example.com/pose',position:0
    }));
    studio.createActivity.and.returnValue(of({
      id:51,commissionId:85,eventKind:'REVISION_REQUEST',
      description:'Corrigir pose',occurredOn:'2026-11-12',
      createdAtUtc:'2026-11-17T20:00:00'
    }));

    await TestBed.configureTestingModule({
      declarations:[CreatorCommissionDetailsComponent],
      imports:[CommonModule,FormsModule,CreatorCalendarComponent,RouterModule.forRoot([])],
      providers:[
        {provide:UserService,useValue:users},
        {provide:CreatorStudioService,useValue:studio},
        {provide:ActivatedRoute,useValue:{paramMap:routeParams$.asObservable()}}
      ]
    }).compileComponents();
    fixture=TestBed.createComponent(CreatorCommissionDetailsComponent);
    component=fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    user$.complete();
    routeParams$.complete();
  });

  it('shows only the current Pro owner’s commission details', () => {
    expect(component.allowed).toBeTrue();
    expect(studio.findCommission).toHaveBeenCalledWith(85);
    expect(studio.commissionPlanning).toHaveBeenCalledWith(85);
    expect(studio.references).toHaveBeenCalledWith(85);
    expect(studio.activity).toHaveBeenCalledWith(85,1,20);
    expect(fixture.nativeElement.textContent).toContain('Ref Sheet');
  });

  it('removes private details when the user changes to Free', () => {
    studio.myAccess.and.returnValue(of({
      allowed:true,tier:'FREE',status:'ACTIVE',sourceKind:'INVITE',expiresAtUtc:null
    }));
    user$.next({...user,id:99});
    fixture.detectChanges();
    expect(component.allowed).toBeFalse();
    expect(component.commission).toBeNull();
    expect(component.references).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Cliente: Cliente');
  });

  it('never reads a malformed or unsafe commission id', () => {
    routeParams$.next(convertToParamMap({id:'../../123'}));
    fixture.detectChanges();
    expect(component.allowed).toBeFalse();
    expect(component.commission).toBeNull();
    expect(component.error).toContain('inválido');
    expect(studio.findCommission).toHaveBeenCalledTimes(1);
  });

  it('saves references to the currently selected commission, not the user profile', () => {
    component.referenceDraft={label:'Pose',url:'https://example.com/pose'};
    component.saveReference();
    expect(studio.createReference).toHaveBeenCalledWith(85,{
      label:'Pose',url:'https://example.com/pose'
    });
  });

  it('records the actual date and manual revision kind independently', () => {
    component.activityDraft={
      eventKind:'REVISION_REQUEST',description:'Corrigir pose',
      occurredOn:'2026-11-11'
    };
    component.saveActivity();
    expect(studio.createActivity).toHaveBeenCalledWith(85,{
      eventKind:'REVISION_REQUEST',
      description:'Corrigir pose',
      occurredOn:'2026-11-11'
    });
  });

  it('ignores an outdated detail fetch after a newer refresh', () => {
    const old$ = new Subject<CreatorCommission>();
    const latest$ = new Subject<CreatorCommission>();
    studio.findCommission.and.returnValues(old$.asObservable(), latest$.asObservable());

    component.load();
    component.load();
    latest$.next({...commission,title:'Atualizada'});
    latest$.complete();
    old$.next({...commission,title:'Antiga'});
    old$.complete();

    expect(component.commission?.title).toBe('Atualizada');
  });

  it('edits only order metadata and never replaces the materialized workflow',()=>{
    component.startOrderEdit();
    component.orderDraft!.title='  Novo título  ';
    component.orderDraft!.dueOn='2026-12-03';
    component.saveOrder();
    expect(studio.update).toHaveBeenCalledOnceWith(85,{
      title:'Novo título',clientName:'Cliente',description:'Detalhes',privateNotes:'Privado',
      requestedOn:'2026-11-12',dueOn:'2026-12-03',artTypeId:null
    });
    expect(studio.changeStatus).not.toHaveBeenCalled();
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
    expect(component.orderDraft).toBeNull();
  });

  it('shows only the current step by default and reveals others on demand',()=>{
    studio.commissionSteps.and.returnValue(of([step,{...step,id:91,position:2,name:'Pintura'}]));
    component.load();fixture.detectChanges();
    expect(component.visibleSteps.map(row=>row.id)).toEqual([90]);
    expect(fixture.nativeElement.querySelectorAll('[data-step-id]').length).toBe(1);
    component.toggleSteps();fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-step-id]').length).toBe(2);
  });

  it('edits, adds, deletes and copies steps only for the current order',()=>{
    component.openStepEditor(step);
    component.stepEditor!.name='Novo rascunho';
    component.saveStepEditor();
    expect(studio.updateCommissionStep).toHaveBeenCalledOnceWith(85,90,{name:'Novo rascunho',stageDefinitionId:7,status:'PENDING',notes:'Manter pose'});
    component.openStepEditor();component.chooseStepDefinition(7);component.saveStepEditor();
    expect(studio.addCommissionStep).toHaveBeenCalledOnceWith(85,{name:'Rascunho',stageDefinitionId:7});
    spyOn(window,'confirm').and.returnValue(true);
    component.openStepEditor(step);component.removeEditedStep();
    expect(studio.deleteCommissionStep).toHaveBeenCalledOnceWith(85,90);
    component.importWorkflowId=8;component.copyWorkflow();
    expect(studio.copyWorkflowToCommission).not.toHaveBeenCalled();
    studio.commissionSteps.and.returnValue(of([]));component.load();component.importWorkflowId=8;component.copyWorkflow();
    expect(studio.copyWorkflowToCommission).toHaveBeenCalledOnceWith(85,8);
  });

  it('changes situation independently and moves only to an actual step of the current order',()=>{
    component.statusDraft='PAUSED';component.saveStatus();
    expect(studio.changeStatus).toHaveBeenCalledOnceWith(85,'PAUSED');
    component.targetStepId=999;component.moveToStep();
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
    component.targetStepId=90;component.moveToStep();
    expect(studio.moveCommissionToStep).toHaveBeenCalledOnceWith(85,90);
    component.changeStepStatus(90,'WAITING_APPROVAL');
    expect(studio.updateCommissionStep).toHaveBeenCalledOnceWith(85,90,{
      name:'Rascunho',stageDefinitionId:7,notes:'Manter pose',status:'WAITING_APPROVAL'
    });
  });

  it('plans one step without changing status, supports clearing and blocks completed planning',()=>{
    component.startPlanning(plan);component.planningDate='2026-02-30';component.savePlanning(plan);
    expect(studio.setPlanningDate).not.toHaveBeenCalled();
    component.planningDate='2026-12-01';component.savePlanning(plan);
    expect(studio.setPlanningDate).toHaveBeenCalledWith(85,90,'2026-12-01');
    const dated={...plan,date:'2026-12-01'};
    studio.commissionPlanning.and.returnValue(of([dated]));component.load();
    component.startPlanning(dated);component.savePlanning(dated,true);
    expect(studio.setPlanningDate).toHaveBeenCalledWith(85,90,null);
    expect(studio.changeStatus).not.toHaveBeenCalled();
    const finished={...dated,stepStatus:'DONE' as const};
    studio.commissionPlanning.and.returnValue(of([finished]));component.load();
    component.startPlanning(finished);component.savePlanning(finished,true);
    expect(studio.setPlanningDate.calls.count()).toBe(2);
  });

  it('shows the editable workspace and preserves the order after a failed refresh',()=>{
    const root=fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Dados do pedido');
    expect(root.textContent).toContain('Rascunho');
    expect(root.textContent).not.toContain('Adicionar referência');
    component.tab='references';fixture.detectChanges();
    expect(root.textContent).toContain('Adicionar referência');
    const failing=new Subject<CreatorCommission>();
    studio.findCommission.and.returnValue(failing);
    component.load();failing.error(new HttpErrorResponse({status:500}));
    expect(component.canManage).toBeFalse();
    expect(component.commission?.id).toBe(85);
    component.statusDraft='PAUSED';component.saveStatus();
    expect(studio.changeStatus).not.toHaveBeenCalled();
  });

  it('clears production, drafts and private details on route or account changes',()=>{
    component.startOrderEdit();component.startPlanning(plan);
    studio.myAccess.and.returnValue(of({allowed:false,tier:null,status:'INACTIVE',sourceKind:null,expiresAtUtc:null}));
    user$.next({...user,id:99});fixture.detectChanges();
    expect(component.orderDraft).toBeNull();
    expect(component.planningKey).toBeNull();
    expect(component.steps).toEqual([]);
    expect(component.planning).toEqual([]);
  });

  it('prevents stale mutations from applying to a different route and clears data on denial',()=>{
    const pending=new Subject<CreatorCommission>();
    studio.update.and.returnValue(pending);
    component.startOrderEdit();component.saveOrder();
    routeParams$.next(convertToParamMap({id:'86'}));
    pending.next(commission);pending.complete();
    expect(component.notice).toBe('');
    expect(component.commissionId).toBe(86);
    routeParams$.next(convertToParamMap({id:'85'}));
    const denied=new Subject<CreatorCommission>();
    studio.changeStatus.and.returnValue(denied);
    component.statusDraft='PAUSED';component.saveStatus();
    denied.error(new HttpErrorResponse({status:403}));fixture.detectChanges();
    expect(component.allowed).toBeFalse();
    expect(component.planning).toEqual([]);
    expect(component.steps).toEqual([]);
  });

  it('refuses to submit http links client-side before asking the API', () => {
    component.referenceDraft={label:'Referência',url:'http://example.com'};
    component.saveReference();
    expect(studio.createReference).not.toHaveBeenCalled();
    expect(component.actionError).toContain('https://');
  });
});
