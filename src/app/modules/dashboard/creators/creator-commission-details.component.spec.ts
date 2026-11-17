import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, ParamMap, RouterModule } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import {
  CreatorCommission, CreatorStudioService
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../shared/models/user';
import { CreatorCommissionDetailsComponent } from './creator-commission-details.component';

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
    completedAtUtc:null
  };

  beforeEach(async () => {
    user$ = new BehaviorSubject<User | null>(user);
    routeParams$ = new BehaviorSubject<ParamMap>(convertToParamMap({id:'85'}));
    users=jasmine.createSpyObj<UserService>(
      'UserService',['getUser'],{user$:user$.asObservable()});
    users.getUser.and.callFake(() => user$.value);
    studio=jasmine.createSpyObj<CreatorStudioService>('CreatorStudioService',
      ['myAccess','findCommission','references','activity',
       'createReference','updateReference','deleteReference','createActivity']);
    studio.myAccess.and.returnValue(of({
      allowed:true,tier:'PRO',status:'ACTIVE',sourceKind:'PILOT',expiresAtUtc:null
    }));
    studio.findCommission.and.returnValue(of(commission));
    studio.references.and.returnValue(of([]));
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
      imports:[CommonModule,FormsModule,RouterModule.forRoot([])],
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

  it('refuses to submit http links client-side before asking the API', () => {
    component.referenceDraft={label:'Referência',url:'http://example.com'};
    component.saveReference();
    expect(studio.createReference).not.toHaveBeenCalled();
    expect(component.actionError).toContain('https://');
  });
});
