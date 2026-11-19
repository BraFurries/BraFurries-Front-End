import { CommonModule } from '@angular/common';
import { CdkDrag, CdkDragEnd, CdkDragMove, CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import {
  CreatorCommission, CreatorCommissionStep, CreatorStudioService,
  CreatorWorkflow
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../shared/models/user';
import { CreatorStageBoardComponent } from './creator-stage-board.component';

describe('CreatorStageBoardComponent', () => {
  let component: CreatorStageBoardComponent;
  let fixture: ComponentFixture<CreatorStageBoardComponent>;
  let studio: jasmine.SpyObj<CreatorStudioService>;
  let users: jasmine.SpyObj<UserService>;
  let user$: BehaviorSubject<User | null>;

  const user: User = {
    id:31, name:'Artista', email:'artist@example.invalid',
    roles:[], permissions:[], profileImageUrl:null
  };
  const workflow: CreatorWorkflow = {
    id:33, name:'Ícones', isDefault:false,
    steps:[
      {id:1,name:'Rascunho',stageDefinitionId:10,position:0},
      {id:2,name:'Pintura',stageDefinitionId:20,position:1}
    ]
  };
  const card: CreatorCommission = {
    id:7,title:'Ícone do Lupi',clientName:'Lupi',
    description:null,privateNotes:null,requestedOn:'2026-11-12',dueOn:null,
    artTypeId:4,status:'IN_PROGRESS',createdAtUtc:'2026-11-18T00:00:00',
    updatedAtUtc:'2026-11-18T00:00:00',completedAtUtc:null,
    currentStageName:'Rascunho',currentStageDefinitionId:10,
    sourceWorkflowId:33,currentStagePosition:0
  };
  const steps: CreatorCommissionStep[] = [
    {id:70,commissionId:7,name:'Rascunho',stageDefinitionId:10,
      position:0,status:'IN_PROGRESS',notes:'Guardar cor',completedAtUtc:null},
    {id:71,commissionId:7,name:'Pintura',stageDefinitionId:20,
      position:1,status:'PENDING',notes:null,completedAtUtc:null}
  ];

  beforeEach(async () => {
    localStorage.removeItem('brf.creator-studio.shared-stage-order.v1.31');
    localStorage.removeItem('brf.creator-studio.shared-stage-order.v1.99');
    user$ = new BehaviorSubject<User | null>(user);
    studio = jasmine.createSpyObj<CreatorStudioService>('CreatorStudioService',
      ['myAccess','workflows','stageDefinitions','commissionsForBoard',
        'commissionSteps','moveCommissionToStep']);
    studio.myAccess.and.returnValue(of({
      allowed:true,tier:'PRO',status:'ACTIVE',sourceKind:'PILOT',expiresAtUtc:null
    }));
    studio.workflows.and.returnValue(of([workflow]));
    studio.stageDefinitions.and.returnValue(of([
      {id:10,name:'Rascunho'}, {id:20,name:'Pintura'}
    ]));
    studio.commissionsForBoard.and.callFake(filter => of({
      items:filter.workflowId === 33 || filter.stageDefinitionId === 10 ? [card] : [],
      page:1,pageSize:100,
      total:filter.workflowId === 33 || filter.stageDefinitionId === 10 ? 1 : 0
    }));
    studio.commissionSteps.and.returnValue(of(steps));
    studio.moveCommissionToStep.and.returnValue(of(steps));
    users = jasmine.createSpyObj<UserService>(
      'UserService',['getUser'],{user$:user$.asObservable()});
    users.getUser.and.callFake(() => user$.value);
    await TestBed.configureTestingModule({
      declarations:[CreatorStageBoardComponent],
      imports:[CommonModule,FormsModule,DragDropModule,RouterModule.forRoot([])],
      providers:[
        {provide:CreatorStudioService,useValue:studio},
        {provide:UserService,useValue:users}
      ]
    }).compileComponents();
    fixture=TestBed.createComponent(CreatorStageBoardComponent);
    component=fixture.componentInstance;
    fixture.componentRef.setInput('readOnly',false);
    fixture.componentRef.setInput('workflowId',33);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    user$.complete();
    localStorage.removeItem('brf.creator-studio.shared-stage-order.v1.31');
    localStorage.removeItem('brf.creator-studio.shared-stage-order.v1.99');
  });

  function zones(): {key:string;x:number;y:number}[] {
    const elements = Array.from(
      fixture.nativeElement.querySelectorAll('[data-stage-target]')) as HTMLElement[];
    return elements.map((element,i) => {
      const left=i*300;
      if (!jasmine.isSpy(element.getBoundingClientRect)) {
        spyOn(element,'getBoundingClientRect').and.returnValue({
          left,right:left+280,top:40,bottom:440,width:280,height:400
        } as DOMRect);
      }
      return {key:element.dataset['stageTarget']!,x:left+80,y:130};
    });
  }

  function start(cardData: CreatorCommission): void {
    component.dragStart({
      source:{getPlaceholderElement:() => ({getBoundingClientRect:() => ({height:145})})}
    } as unknown as CdkDragStart<CreatorCommission>,cardData);
  }

  it('blocks order movement in read-only mode even when a process is selected',()=>{
    fixture.componentRef.setInput('readOnly',true);fixture.detectChanges();
    expect(component.canMoveCard(card)).toBeFalse();
    start(card);
    expect(studio.commissionSteps).not.toHaveBeenCalled();
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('article [data-drag-indicator]')).toBeNull();
  });

  it('only shows commissions whose stored process matches the selected workflow', () => {
    expect(component.mode).toBe('process');
    expect(component.workflow?.name).toBe('Ícones');
    expect(component.columns[0].items).toEqual([card]);
    expect(component.columns[1].items).toEqual([]);
    expect(component.columns[2].movable).toBeFalse();
    expect(studio.commissionsForBoard).toHaveBeenCalledWith({workflowId:33},1,100);
    expect(fixture.nativeElement.textContent).toContain('Ícone do Lupi');
    expect(fixture.nativeElement.querySelector('article [data-drag-indicator]')).not.toBeNull();
  });

  it('provides a separate shared-stage board filtered by canonical IDs', () => {
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    expect(component.mode).toBe('shared');
    expect(component.columns.map(lane => lane.name)).toEqual([
      'Rascunho','Pintura','Sem etapa reutilizável'
    ]);
    expect(studio.commissionsForBoard).toHaveBeenCalledWith({stageDefinitionId:10},1,12);
    expect(studio.commissionsForBoard).toHaveBeenCalledWith({unlinked:true},1,12);
    expect(component.columns[0].items[0].id).toBe(7);
  });

  it('switches from general stages to the actual selected process including exclusive stages and restores movement', () => {
    const selected: CreatorWorkflow = {
      id:34,name:'Stickers',isDefault:false,
      steps:[
        {id:1,name:'Pintura',position:0,stageDefinitionId:20},
        {id:2,name:'Particular',position:1,stageDefinitionId:null},
        {id:3,name:'Rascunho',position:2,stageDefinitionId:10}
      ]
    };
    const selectedCard={...card,sourceWorkflowId:34,currentStageDefinitionId:20,currentStageName:'Pintura',currentStagePosition:0};
    studio.workflows.and.returnValue(of([workflow, selected]));
    studio.stageDefinitions.and.returnValue(of([
      {id:10,name:'Rascunho'},{id:20,name:'Pintura'},{id:30,name:'Acabamento'}
    ]));
    studio.commissionsForBoard.and.callFake(filter=>of({
      items:filter.workflowId===34?[selectedCard]:filter.stageDefinitionId===10?[card]:[],
      total:filter.workflowId===34||filter.stageDefinitionId===10?1:0,page:1,pageSize:100
    }));
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:10','shared:20','shared:30','unlinked']);
    expect(fixture.debugElement.query(By.directive(CdkDrag)).injector.get(CdkDrag).disabled).toBeTrue();
    studio.commissionsForBoard.calls.reset();
    fixture.componentRef.setInput('workflowId',34);
    fixture.detectChanges();
    expect(component.mode).toBe('process');
    expect(component.columns.map(lane=>lane.name)).toEqual(['Pintura','Particular','Rascunho','Etapas personalizadas / finalizadas']);
    expect(studio.commissionsForBoard.calls.allArgs()).toEqual([[{workflowId:34},1,100]]);
    expect(component.columns[0].items).toEqual([selectedCard]);
    expect(component.canOrganizeStages).toBeFalse();
    expect(component.canMoveCard(card)).toBeFalse();
    expect(fixture.debugElement.query(By.directive(CdkDrag)).injector.get(CdkDrag).disabled).toBeFalse();
    studio.commissionSteps.and.returnValue(of([
      {id:80,commissionId:7,name:'Pintura',stageDefinitionId:20,position:0,status:'IN_PROGRESS',notes:null,completedAtUtc:null},
      {id:81,commissionId:7,name:'Particular',stageDefinitionId:null,position:1,status:'PENDING',notes:null,completedAtUtc:null}
    ]));
    const target=zones().find(zone=>zone.key==='position:1')!;
    start(selectedCard);
    component.dragEnd({event:{clientX:target.x,clientY:target.y}} as unknown as CdkDragEnd<CreatorCommission>,selectedCard,'position:0');
    expect(studio.moveCommissionToStep).toHaveBeenCalledOnceWith(7,81);
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:10','shared:20','shared:30','unlinked']);
    expect(fixture.debugElement.query(By.directive(CdkDrag)).injector.get(CdkDrag).disabled).toBeTrue();
  });

  it('blocks card movement in the general view, including keyboard and direct event calls', () => {
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    const drag = fixture.debugElement.query(By.directive(CdkDrag)).injector.get(CdkDrag);
    expect(drag.disabled).toBeTrue();
    expect(component.columns.every(lane=>!lane.movable)).toBeTrue();
    expect(fixture.nativeElement.querySelector('article').getAttribute('tabindex')).toBeNull();
    expect(fixture.nativeElement.querySelector('article [data-drag-indicator]')).toBeNull();
    const target=zones().find(zone=>zone.key==='shared:20')!;
    start(card);
    component.dragEnd({event:{clientX:target.x,clientY:target.y}} as unknown as CdkDragEnd<CreatorCommission>,card,'shared:10');
    const element=fixture.nativeElement.querySelector('article');
    component.moveByKeyboard({key:'ArrowRight',target:element,currentTarget:element,
      preventDefault:()=>{}} as unknown as KeyboardEvent,card,'shared:10');
    expect(studio.commissionSteps).not.toHaveBeenCalled();
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
  });

  function orderZones(): HTMLElement[] {
    const elements = Array.from(fixture.nativeElement.querySelectorAll('[data-order-stage-id]')) as HTMLElement[];
    spyOn(elements[0].parentElement!, 'getBoundingClientRect').and.returnValue({
      left:0,right:900,top:20,bottom:180,width:900,height:160
    } as DOMRect);
    elements.forEach((element,i) => spyOn(element,'getBoundingClientRect').and.returnValue({
      left:i*300,right:i*300+280,top:40,bottom:160,width:280,height:120
    } as DOMRect));
    return elements;
  }

  it('keeps column previews fixed while dragging, shows insertion at destination and commits only on drop', () => {
    studio.stageDefinitions.and.returnValue(of([
      {id:10,name:'Rascunho'},{id:20,name:'Pintura'},{id:30,name:'Finalização'}
    ]));
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    component.openStageOrder();
    fixture.detectChanges();
    const elements=orderZones();
    expect(elements.length).toBe(3);
    const drag = fixture.debugElement.query(By.directive(CdkDrag)).injector.get(CdkDrag);
    expect(drag.disabled).toBeFalse();
    const first=component.orderDraft![0];
    component.orderDragStarted(first);
    component.orderDragMoved({source:{data:first},event:{clientX:650,clientY:100}} as unknown as CdkDragMove<typeof first>);
    fixture.detectChanges();
    expect(component.orderTargetIndex).toBe(2);
    expect(component.orderDraft!.map(definition=>definition.id)).toEqual([10,20,30]);
    expect(elements[2].querySelector('[data-order-insertion]')).not.toBeNull();
    expect(elements[2].querySelector('[data-order-insertion]')!.classList.contains('-right-2')).toBeTrue();
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:10','shared:20','shared:30','unlinked']);
    component.orderDragEnded({event:{clientX:887,clientY:100}} as unknown as CdkDragEnd<typeof first>,first);
    fixture.detectChanges();
    expect(component.orderDragId).toBeNull();
    expect(component.orderTargetIndex).toBeNull();
    expect(component.orderDraft!.map(definition=>definition.id)).toEqual([20,30,10]);
    expect(localStorage.getItem('brf.creator-studio.shared-stage-order.v1.31')).toBeNull();
    component.saveStageOrder();
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:20','shared:30','shared:10','unlinked']);
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
  });

  it('supports moving columns backwards by drag or keyboard and ignores cancelled/outside drops', () => {
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    component.openStageOrder();
    fixture.detectChanges();
    const elements=orderZones();
    const last=component.orderDraft![1];
    component.orderDragStarted(last);
    component.orderDragMoved({source:{data:last},event:{clientX:40,clientY:100}} as unknown as CdkDragMove<typeof last>);
    fixture.detectChanges();
    expect(elements[0].querySelector('[data-order-insertion]')!.classList.contains('-left-2')).toBeTrue();
    component.orderDragEnded({event:{clientX:-10,clientY:100}} as unknown as CdkDragEnd<typeof last>,last);
    expect(component.orderDraft!.map(definition=>definition.id)).toEqual([10,20]);
    expect(component.orderTargetIndex).toBeNull();
    component.orderDragStarted(last);
    component.orderDragEnded({event:{clientX:40,clientY:100}} as unknown as CdkDragEnd<typeof last>,last);
    expect(component.orderDraft!.map(definition=>definition.id)).toEqual([20,10]);
    fixture.detectChanges();
    const firstArticle=fixture.nativeElement.querySelector('[data-order-stage-id="20"] article') as HTMLElement;
    const key = new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});
    firstArticle.dispatchEvent(key);
    expect(component.orderDraft!.map(definition=>definition.id)).toEqual([10,20]);
    component.cancelStageOrder();
    expect(component.orderDraft).toBeNull();
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:10','shared:20','unlinked']);
  });

  it('reorders only general columns, keeps loaded data, restores preference by account and ignores stale IDs', () => {
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    const previous=component.columns[0];
    const originalCalls=studio.commissionsForBoard.calls.count();
    component.openStageOrder();
    component.moveStageOrder(0,1);
    component.cancelStageOrder();
    expect(component.columns[0]).toBe(previous);
    component.openStageOrder();
    component.moveStageOrder(0,1);
    component.saveStageOrder();
    fixture.detectChanges();
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:20','shared:10','unlinked']);
    expect(component.columns[1]).toBe(previous);
    expect(studio.commissionsForBoard.calls.count()).toBe(originalCalls);
    expect(localStorage.getItem('brf.creator-studio.shared-stage-order.v1.31')).toBe('[20,10]');
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
    localStorage.setItem('brf.creator-studio.shared-stage-order.v1.31','[20,20,999,10]');
    studio.stageDefinitions.and.returnValue(of([{id:10,name:'Rascunho'},{id:20,name:'Pintura'},{id:30,name:'Nova'}]));
    user$.next({...user,id:99});
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:10','shared:20','shared:30','unlinked']);
    user$.next(user);
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:20','shared:10','shared:30','unlinked']);
    fixture.componentRef.setInput('workflowId',33);
    fixture.detectChanges();
    expect(component.columns.map(lane=>lane.key)).toEqual(['position:0','position:1','other']);
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    expect(component.columns.map(lane=>lane.key)).toEqual(['shared:20','shared:10','shared:30','unlinked']);
  });

  it('ignores stale general responses after choosing a process with only exclusive stages', () => {
    const exclusive: CreatorWorkflow={id:44,name:'Exclusivo',isDefault:false,
      steps:[{id:1,name:'Só local',position:0,stageDefinitionId:null}]};
    studio.workflows.and.returnValue(of([workflow,exclusive]));
    const pending = new Subject<{items:CreatorCommission[];total:number;page:number;pageSize:number}>();
    studio.commissionsForBoard.and.callFake(filter=>filter.workflowId===44
      ? of({items:[],total:0,page:1,pageSize:100})
      : pending.asObservable());
    fixture.componentRef.setInput('workflowId',null);
    fixture.detectChanges();
    expect(component.loadingBoard).toBeTrue();
    fixture.componentRef.setInput('workflowId',44);
    fixture.detectChanges();
    expect(component.columns.map(lane=>lane.name)).toEqual(['Só local','Etapas personalizadas / finalizadas']);
    expect(component.loadingBoard).toBeFalse();
    pending.next({items:[card],total:1,page:1,pageSize:12});
    pending.complete();
    expect(component.columns.every(lane=>lane.items.length===0)).toBeTrue();
  });

  it('keeps a fixed blank ghost at the destination without moving existing cards', () => {
    const target=zones().find(zone => zone.key === 'position:1')!;
    start(card);
    const drag=(y:number) => component.dragMove({
      source:{data:card},event:{clientX:target.x,clientY:y}
    } as unknown as CdkDragMove<CreatorCommission>,'position:0');
    drag(100);
    fixture.detectChanges();
    expect(component.hoveredKey).toBe('position:1');
    expect(component.ghostIndex).toBe(0);
    expect(component.columns[0].items).toEqual([card]);
    drag(340);
    fixture.detectChanges();
    expect(component.ghostIndex).toBe(0);
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
    const dest=fixture.nativeElement.querySelector('[data-stage-target="position:1"]');
    expect(dest.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('moves only to actual step snapshot after dropping into a valid lane', () => {
    const target=zones().find(zone => zone.key === 'position:1')!;
    const pending=new Subject<CreatorCommissionStep[]>();
    studio.moveCommissionToStep.and.returnValue(pending.asObservable());
    start(card);
    component.dragEnd({
      event:{clientX:target.x,clientY:target.y}
    } as unknown as CdkDragEnd<CreatorCommission>,card,'position:0');
    expect(studio.commissionSteps).toHaveBeenCalledWith(7);
    expect(studio.moveCommissionToStep).toHaveBeenCalledOnceWith(7,71);
    expect(component.columns[0].items[0]).toBe(card);
    const moved={...card,currentStageDefinitionId:20,currentStageName:'Pintura',
      currentStagePosition:1};
    studio.commissionsForBoard.and.returnValue(of({
      items:[moved],page:1,pageSize:100,total:1
    }));
    pending.next(steps);
    pending.complete();
    expect(component.columns[0].items.length).toBe(0);
    expect(component.columns[1].items[0].id).toBe(7);
  });

  it('rejects stages absent from the original snapshot, without mutating anything', () => {
    const target=zones().find(zone => zone.key === 'position:1')!;
    studio.commissionSteps.and.returnValue(of([steps[0]]));
    start(card);
    component.dragEnd({
      event:{clientX:target.x,clientY:target.y}
    } as unknown as CdkDragEnd<CreatorCommission>,card,'position:0');
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
    expect(component.columns[0].items[0].id).toBe(7);
    expect(component.error).toContain('não possui uma etapa');
  });

  it('does not drop onto the same lane, outside the board or onto an unmovable lane', () => {
    const all=zones();
    start(card);
    const same=all.find(zone=>zone.key==='position:0')!;
    component.dragEnd({
      event:{clientX:same.x,clientY:same.y}
    } as unknown as CdkDragEnd<CreatorCommission>,card,'position:0');
    start(card);
    const other=all.find(zone=>zone.key==='other')!;
    component.dragEnd({
      event:{clientX:other.x,clientY:other.y}
    } as unknown as CdkDragEnd<CreatorCommission>,card,'position:0');
    start(card);
    component.dragEnd({
      event:{clientX:-100,clientY:-100}
    } as unknown as CdkDragEnd<CreatorCommission>,card,'position:0');
    expect(studio.moveCommissionToStep).not.toHaveBeenCalled();
  });

  it('guards the board when Pro is revoked and clears previous account data', () => {
    studio.myAccess.and.returnValue(of({
      allowed:false,tier:'PRO',status:'REVOKED',sourceKind:'PILOT',expiresAtUtc:null
    }));
    user$.next({...user,id:99});
    fixture.detectChanges();
    expect(component.allowed).toBeFalse();
    expect(component.columns).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Ícone do Lupi');
  });
});
