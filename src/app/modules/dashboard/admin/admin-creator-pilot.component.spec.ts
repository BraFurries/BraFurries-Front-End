import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import {
  CreatorPilotCandidate, CreatorPilotInvitation, CreatorStudioPilotAdminService
} from '../../../core/services/creator-studio-pilot-admin.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../shared/models/user';
import { AdminCreatorPilotComponent } from './admin-creator-pilot.component';

describe('AdminCreatorPilotComponent', () => {
  let component: AdminCreatorPilotComponent;
  let fixture: ComponentFixture<AdminCreatorPilotComponent>;
  let pilot: jasmine.SpyObj<CreatorStudioPilotAdminService>;
  let platform: jasmine.SpyObj<PlatformAccessService>;
  let users: jasmine.SpyObj<UserService>;
  let user$: BehaviorSubject<User | null>;

  const ownerUser: User = {
    id:1, name:'Responsável', email:'owner@example.invalid',
    roles:[],permissions:[],profileImageUrl:null
  };
  const candidate: CreatorPilotCandidate = {
    userId:22,displayName:'Artista convidada',mergedAccount:false,
    currentAccess:{
      allowed:false,tier:null,status:'NOT_AUTHORIZED',
      sourceKind:null,expiresAtUtc:null
    }
  };
  const participant: CreatorPilotInvitation = {
    userId:22,displayName:'Artista convidada',tier:'PRO',
    sourceKind:'PILOT',status:'ACTIVE',active:true,
    startsAtUtc:'2026-11-17T20:00:00',expiresAtUtc:null,mergedAccount:false
  };

  async function init(owner: boolean): Promise<void> {
    user$ = new BehaviorSubject<User | null>(ownerUser);
    users = jasmine.createSpyObj<UserService>(
      'UserService', ['getUser'], {user$:user$.asObservable()});
    users.getUser.and.callFake(() => user$.value);

    platform = jasmine.createSpyObj<PlatformAccessService>('PlatformAccessService',['myAccess']);
    platform.myAccess.and.returnValue(of({enabled:true,owner,permissions:[]}));

    pilot = jasmine.createSpyObj<CreatorStudioPilotAdminService>(
      'CreatorStudioPilotAdminService',
      ['list','candidate','grantLifetimePro','revoke',
       'inspectHold','placeHold','releaseHold','retentionDryRun']);
    pilot.list.and.returnValue(of({items:[participant],page:1,pageSize:25,total:1}));
    pilot.candidate.and.returnValue(of(candidate));
    pilot.grantLifetimePro.and.returnValue(of({allowed:true,tier:'PRO',
      status:'ACTIVE',sourceKind:'PILOT',expiresAtUtc:null}));
    pilot.revoke.and.returnValue(of(void 0));
    pilot.inspectHold.and.returnValue(of({
      artistUserId:22,commissionId:88,category:'DISPUTE',
      reason:'Solicitação de correção pendente',active:true
    }));
    pilot.placeHold.and.returnValue(of({
      artistUserId:22,commissionId:88,category:'DISPUTE',
      reason:'Solicitação de correção pendente',active:true
    }));
    pilot.releaseHold.and.returnValue(of(void 0));
    pilot.retentionDryRun.and.returnValue(of({
      expiredCommissions:9,blockedByHold:2,blockedByMissingD30:3,
      blockedByMissingD7:4,smtpAcceptedBoth:0,providerConfirmedBoth:0,deliveryProofSupported:false
    }));

    await TestBed.configureTestingModule({
      declarations:[AdminCreatorPilotComponent],
      imports:[CommonModule,FormsModule,RouterModule.forRoot([])],
      providers:[
        {provide:UserService,useValue:users},
        {provide:PlatformAccessService,useValue:platform},
        {provide:CreatorStudioPilotAdminService,useValue:pilot}
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminCreatorPilotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    user$?.complete();
  });

  it('does not load participant data for ordinary admins or non-owners', async () => {
    await init(false);
    expect(component.owner).toBeFalse();
    expect(pilot.list).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Somente o proprietário');
  });

  it('shows pilot grants only for the configured platform owner', async () => {
    await init(true);
    expect(component.owner).toBeTrue();
    expect(pilot.list).toHaveBeenCalledWith('ALL',1,25);
    expect(fixture.nativeElement.textContent).toContain('Artista convidada');
    expect(fixture.nativeElement.textContent).toContain('Piloto vitalício');
  });

  it('previews a candidate before permitting grant', async () => {
    await init(true);
    expect(component.canGrantPilot).toBeFalse();
    component.candidateInput='22';
    component.lookupCandidate();
    expect(pilot.candidate).toHaveBeenCalledWith(22);
    expect(component.canGrantPilot).toBeTrue();
  });

  it('refuses merged accounts and future billing subscriptions', async () => {
    await init(true);
    component.candidate={...candidate,mergedAccount:true};
    expect(component.canGrantPilot).toBeFalse();
    component.candidate={...candidate,currentAccess:{
      allowed:true,tier:'PRO',status:'ACTIVE',
      sourceKind:'BILLING',expiresAtUtc:'2026-12-01T12:00:00'
    }};
    expect(component.canGrantPilot).toBeFalse();
    component.grantPilot();
    expect(pilot.grantLifetimePro).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation to grant lifetime Pro', async () => {
    await init(true);
    component.candidate=candidate;
    spyOn(window,'confirm').and.returnValue(true);
    component.grantPilot();
    expect(window.confirm).toHaveBeenCalled();
    expect(pilot.grantLifetimePro).toHaveBeenCalledWith(22);
    expect(component.successMessage).toContain('Pro vitalício');
  });

  it('cannot revoke a billing grant and confirms pilot revocation separately', async () => {
    await init(true);
    spyOn(window,'confirm').and.returnValue(true);
    component.revokePilot({...participant,sourceKind:'BILLING'});
    expect(pilot.revoke).not.toHaveBeenCalled();
    component.revokePilot(participant);
    expect(pilot.revoke).toHaveBeenCalledWith(22);
    expect(component.successMessage).toContain('revogado');
  });

  it('clears the private participant list on account change to a non-owner', async () => {
    await init(true);
    platform.myAccess.and.returnValue(of({enabled:true,owner:false,permissions:[]}));
    user$.next({...ownerUser,id:71});
    fixture.detectChanges();
    expect(component.owner).toBeFalse();
    expect(component.participants).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Artista convidada');
  });

  it('cannot inspect a legal hold without platform owner permission', async () => {
    await init(false);
    component.holdArtistId='22';
    component.holdCommissionId='88';
    component.inspectHold();
    expect(pilot.inspectHold).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and reason to place a legal hold', async () => {
    await init(true);
    component.holdArtistId='22';
    component.holdCommissionId='88';
    component.holdReason='Solicitação de correção pendente';
    spyOn(window,'confirm').and.returnValue(false);
    component.placeHold();
    expect(pilot.placeHold).not.toHaveBeenCalled();
    (window.confirm as jasmine.Spy).and.returnValue(true);
    component.placeHold();
    expect(pilot.placeHold).toHaveBeenCalledWith({
      artistUserId:22,commissionId:88,category:'DISPUTE',
      reason:'Solicitação de correção pendente'
    });
    expect(component.hold?.active).toBeTrue();
  });

  it('blocks release if the current hold is not the selected commission', async () => {
    await init(true);
    component.holdArtistId='22';
    component.holdCommissionId='89';
    component.hold={artistUserId:22,commissionId:88,category:'DISPUTE',
      reason:'Contestação',active:true};
    component.releaseHold();
    expect(pilot.releaseHold).not.toHaveBeenCalled();
  });

  it('clears private legal hold details when the account changes', async () => {
    await init(true);
    component.hold={artistUserId:22,commissionId:88,category:'DISPUTE',
      reason:'Contestação',active:true};
    platform.myAccess.and.returnValue(of({enabled:true,owner:false,permissions:[]}));
    user$.next({...ownerUser,id:99});
    fixture.detectChanges();
    expect(component.hold).toBeNull();
    expect(component.owner).toBeFalse();
  });

  it('loads a dry-run only on demand for the owner and renders SMTP disclaimer', async () => {
    await init(true);
    expect(pilot.retentionDryRun).not.toHaveBeenCalled();
    component.loadRetentionReport();
    fixture.detectChanges();
    expect(pilot.retentionDryRun).toHaveBeenCalledTimes(1);
    expect(component.retentionReport?.expiredCommissions).toBe(9);
    expect(fixture.nativeElement.textContent).toContain('Aceites SMTP sem prova');
    expect(fixture.nativeElement.textContent).toContain('não comprova entrega');
  });

  it('forbids the retention report for non-owners', async () => {
    await init(false);
    component.loadRetentionReport();
    expect(pilot.retentionDryRun).not.toHaveBeenCalled();
  });

  it('drops in-flight retention reports when the active account changes', async () => {
    await init(true);
    const pending = new Subject<{
      expiredCommissions:number;blockedByHold:number;blockedByMissingD30:number;
      blockedByMissingD7:number;smtpAcceptedBoth:number;providerConfirmedBoth:number;deliveryProofSupported:boolean;
    }>();
    pilot.retentionDryRun.and.returnValue(pending.asObservable());
    component.loadRetentionReport();
    platform.myAccess.and.returnValue(of({enabled:true,owner:false,permissions:[]}));
    user$.next({...ownerUser,id:77});
    pending.next({
      expiredCommissions:1,blockedByHold:0,blockedByMissingD30:1,
      blockedByMissingD7:0,smtpAcceptedBoth:0,providerConfirmedBoth:0,deliveryProofSupported:false
    });
    fixture.detectChanges();
    expect(component.owner).toBeFalse();
    expect(component.retentionReport).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Aceites SMTP sem prova');
    pending.complete();
  });

  it('invalidates the previous diagnosis when a hold changes', async () => {
    await init(true);
    component.loadRetentionReport();
    expect(component.retentionReport).not.toBeNull();
    component.holdArtistId='22';
    component.holdCommissionId='88';
    component.holdReason='Contestação formal';
    spyOn(window,'confirm').and.returnValue(true);
    component.placeHold();
    expect(component.retentionReport).toBeNull();
  });

  it('rejects invalid IDs before previewing or inviting anybody', async () => {
    await init(true);
    component.candidateInput='not-an-id';
    component.lookupCandidate();
    expect(pilot.candidate).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('ID de usuário válido');
  });
});
