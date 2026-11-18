import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Data } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { CreatorStudioService } from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../shared/models/user';
import { CreatorProductionComponent } from './creator-production.component';

describe('CreatorProductionComponent', () => {
  let fixture: ComponentFixture<CreatorProductionComponent>;
  let component: CreatorProductionComponent;
  let studio: jasmine.SpyObj<CreatorStudioService>;
  let users: jasmine.SpyObj<UserService>;
  let user$: BehaviorSubject<User | null>;
  let routeData$: BehaviorSubject<Data>;
  const user: User = {
    id: 31, name: 'Artista', email:'artist@example.invalid',
    roles:[],permissions:[],profileImageUrl:null
  };

  beforeEach(async () => {
    user$ = new BehaviorSubject<User | null>(user);
    routeData$ = new BehaviorSubject<Data>({section:'home'});
    studio = jasmine.createSpyObj<CreatorStudioService>('CreatorStudioService',
      ['myAccess','artTypes','stageDefinitions','workflows',
        'createArtType','updateArtType','createStageDefinition',
        'createWorkflow','updateWorkflow','globalWorkflows','importGlobalWorkflow']);
    studio.myAccess.and.returnValue(of({
      allowed:true,tier:'PRO',status:'ACTIVE',sourceKind:'PILOT',expiresAtUtc:null
    }));
    studio.artTypes.and.returnValue(of([]));
    studio.stageDefinitions.and.returnValue(of([{id:7,name:'Sketch'}]));
    studio.workflows.and.returnValue(of([]));
    studio.globalWorkflows.and.returnValue(of([{
      id:8,name:'Processo básico',description:'Para começar',active:true,
      steps:[{id:31,name:'Alinhamento',position:0},{id:32,name:'Entrega',position:1}]
    }]));
    studio.importGlobalWorkflow.and.returnValue(of({
      id:12,name:'Processo básico',isDefault:true,
      steps:[{id:41,name:'Alinhamento',stageDefinitionId:null,position:0}]
    }));
    studio.createWorkflow.and.returnValue(of({id:12,name:'Ref Sheet',
      isDefault:true,steps:[]}));
    studio.createArtType.and.returnValue(of({id:4,name:'Ref Sheet',workflowId:12}));
    studio.createStageDefinition.and.returnValue(of({id:9,name:'Revisão'}));
    users = jasmine.createSpyObj<UserService>(
      'UserService',['getUser'],{user$:user$.asObservable()});
    users.getUser.and.callFake(() => user$.value);
    await TestBed.configureTestingModule({
      declarations:[CreatorProductionComponent],
      imports:[CommonModule,FormsModule],
      providers:[
        {provide:CreatorStudioService,useValue:studio},
        {provide:UserService,useValue:users},
        {provide:ActivatedRoute,useValue:{data:routeData$.asObservable()}}
      ]
    }).compileComponents();
    fixture=TestBed.createComponent(CreatorProductionComponent);
    component=fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    user$.complete();
    routeData$.complete();
  });

  it('loads only the signed-in artist’s Pro catalog', () => {
    expect(component.allowed).toBeTrue();
    expect(studio.artTypes).toHaveBeenCalledTimes(1);
    expect(studio.stageDefinitions).toHaveBeenCalledTimes(1);
    expect(studio.workflows).toHaveBeenCalledTimes(1);
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Meu ateliê');
    expect(content).toContain('Artes que faço');
    expect(content).toContain('Meus processos');
    expect(content).not.toContain('Etapas reutilizáveis');
    expect(content).not.toContain('Usar modelo');
  });

  it('shows global starter templates only inside the processes page', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Processo básico');
    routeData$.next({section:'processes'});
    fixture.detectChanges();
    expect(studio.globalWorkflows).toHaveBeenCalledTimes(1);
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Modelos prontos');
    expect(html).toContain('Processo básico');
    expect(html).toContain('Usar modelo');
  });

  it('uses separate focused pages and only opens the art editor on request', () => {
    routeData$.next({section:'arts'});
    fixture.detectChanges();
    const read = () => fixture.nativeElement.textContent as string;
    expect(read()).toContain('Artes que faço');
    expect(read()).not.toContain('Modelos prontos');
    expect(read()).not.toContain('Como você chama essa arte?');
    component.startType();
    fixture.detectChanges();
    expect(read()).toContain('Como você chama essa arte?');
    expect(read()).not.toContain('Processo usado neste tipo');
    component.resetType();
    fixture.detectChanges();
    expect(read()).not.toContain('Como você chama essa arte?');
  });

  it('guides process editing through two steps and hides advanced fields', () => {
    routeData$.next({section:'processes'});
    fixture.detectChanges();
    component.startWorkflow();
    fixture.detectChanges();
    expect(component.workflowEditorStep).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Passo 1 de 2');
    expect(fixture.nativeElement.textContent).not.toContain('Adicionar etapa');
    component.nextWorkflowStep();
    expect(component.error).toContain('Dê um nome');
    component.workflow.name = 'Processo de ícones';
    component.nextWorkflowStep();
    fixture.detectChanges();
    expect(component.workflowEditorStep).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Passo 2 de 2');
    expect(fixture.nativeElement.textContent).toContain('Adicionar etapa');
    component.addWorkflowStep();
    component.workflow.steps[0].name = 'Rascunho';
    component.saveWorkflow();
    expect(studio.createWorkflow).toHaveBeenCalledWith({
      name:'Processo de ícones',isDefault:false,
      steps:[{name:'Rascunho',stageDefinitionId:null}]
    });
    expect(component.workflowFormOpen).toBeFalse();
  });

  it('opens existing models without losing their reusable stage references', () => {
    routeData$.next({section:'processes'});
    const source = {id:4,name:'Arte final',isDefault:false,
      steps:[{id:55,name:'Sketch',stageDefinitionId:7,position:0}]};
    component.editWorkflow(source);
    fixture.detectChanges();
    expect(component.workflowFormOpen).toBeTrue();
    expect(component.showStepLibrary).toBeTrue();
    component.workflowEditorStep=2;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Usar uma etapa reutilizável');
    expect(component.workflow.steps[0].stageDefinitionId).toBe(7);
  });

  it('clears draft and catalog data on account switch', () => {
    routeData$.next({section:'arts'});
    component.startType();
    component.typeName='Dados de outro artista';
    // The next account does not have Pro access. Old data and form state
    // must disappear, instead of being refetched using the first account's mock.
    studio.myAccess.and.returnValue(of({
      allowed:false,tier:null,status:'NOT_AUTHORIZED',sourceKind:null,expiresAtUtc:null
    }));
    user$.next({...user,id:52});
    fixture.detectChanges();
    expect(component.typeFormOpen).toBeFalse();
    expect(component.typeName).toBe('');
    expect(component.artTypes).toEqual([]);
    expect(component.globalWorkflows).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Dados de outro artista');
  });

  it('adopts global starter as artist default only when there are no personal models', () => {
    component.adoptGlobalWorkflow(component.globalWorkflows[0]);
    expect(studio.importGlobalWorkflow).toHaveBeenCalledWith(8,true);
    expect(component.notice).toContain('Modelo copiado para sua conta');
    component.workflows=[{id:77,name:'Já existe',isDefault:true,steps:[]}];
    component.adoptGlobalWorkflow(component.globalWorkflows[0]);
    expect(studio.importGlobalWorkflow).toHaveBeenCalledWith(8,false);
  });

  it('sends reusable stage references with the copied workflow step order', () => {
    component.workflow={name:'Ref Sheet',isDefault:true,steps:[]};
    component.addWorkflowStep();
    component.setSharedDefinition(component.workflow.steps[0],7);
    expect(component.workflow.steps[0]).toEqual({
      name:'Sketch',stageDefinitionId:7
    });
    component.addWorkflowStep();
    component.workflow.steps[1].name='Revisão final';
    component.moveStep(1,-1);
    component.saveWorkflow();
    expect(studio.createWorkflow).toHaveBeenCalledWith({
      name:'Ref Sheet',isDefault:true,
      steps:[
        {name:'Revisão final',stageDefinitionId:null},
        {name:'Sketch',stageDefinitionId:7}
      ]
    });
  });

  it('allows an art type to select a workflow without any user or Community ID', () => {
    component.typeName='Ref Sheet';
    component.typeWorkflowId=12;
    component.saveType();
    expect(studio.createArtType).toHaveBeenCalledWith('Ref Sheet',12);
  });

  it('denies catalog display to an authorized Free user', () => {
    studio.myAccess.and.returnValue(of({
      allowed:true,tier:'FREE',status:'ACTIVE',
      sourceKind:'INVITE',expiresAtUtc:null
    }));
    user$.next({...user,id:32});
    fixture.detectChanges();
    expect(component.allowed).toBeFalse();
    expect(component.definitions).toEqual([]);
    expect(component.globalWorkflows).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('exclusiva das contas Pro');
  });

  it('does not allow a new template with blank stage names', () => {
    component.workflow={name:'Teste',isDefault:false,
      steps:[{name:' ',stageDefinitionId:null}]};
    component.saveWorkflow();
    expect(studio.createWorkflow).not.toHaveBeenCalled();
    expect(component.error).toContain('preencha cada etapa');
  });
});
