import { CommonModule } from '@angular/common';
import { CdkDragEnd, CdkDragMove, CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    fixture.componentRef.setInput('workflowId',33);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    user$.complete();
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

  it('only shows commissions whose stored process matches the selected workflow', () => {
    expect(component.mode).toBe('process');
    expect(component.workflow?.name).toBe('Ícones');
    expect(component.columns[0].items).toEqual([card]);
    expect(component.columns[1].items).toEqual([]);
    expect(component.columns[2].movable).toBeFalse();
    expect(studio.commissionsForBoard).toHaveBeenCalledWith({workflowId:33},1,100);
    expect(fixture.nativeElement.textContent).toContain('Ícone do Lupi');
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
