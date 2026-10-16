import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import {
  CommunityAccess,
  CommunityAccessService,
  CommunitySummary,
  CommunitySyncRun
} from '../../../core/services/community-access.service';
import { CommunitiesComponent } from './communities.component';

describe('CommunitiesComponent', () => {
  let fixture: ComponentFixture<CommunitiesComponent>;
  let component: CommunitiesComponent;
  let service: jasmine.SpyObj<CommunityAccessService>;

  const owned: CommunitySummary = {
    communityId: 10,
    name: 'BraFurries',
    ownedByMe: true,
    ownerAssigned: true,
    member: true,
    networks: [{
      type: 'DISCORD',
      externalId: '123',
      name: 'BraFurries',
      active: true
    }]
  };

  const member: CommunitySummary = {
    communityId: 20,
    name: 'Outra Comunidade',
    ownedByMe: false,
    ownerAssigned: true,
    member: true,
    networks: [{
      type: 'DISCORD',
      externalId: '456',
      name: 'Outra Comunidade',
      active: true
    }]
  };

  const ownerAccess: CommunityAccess = {
    communityId: 10,
    owner: true,
    communityAdmin: false,
    activeMember: true,
    canManageCommunityAdmins: true,
    activeRoleIds: [],
    capabilities: ['COMMUNITY_ADMIN'],
    teamScopes: []
  };

  const memberAccess: CommunityAccess = {
    communityId: 20,
    owner: false,
    communityAdmin: false,
    activeMember: true,
    canManageCommunityAdmins: false,
    activeRoleIds: [],
    capabilities: ['MEMBERS_VIEW'],
    teamScopes: []
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<CommunityAccessService>('CommunityAccessService', [
      'listCommunities',
      'getAccess',
      'getLatestSync',
      'requestSync'
    ]);
    service.listCommunities.and.returnValue(of([owned, member]));
    service.getAccess.and.callFake(id => of(id === 10 ? ownerAccess : memberAccess));
    service.getLatestSync.and.returnValue(of(null));
    service.requestSync.and.returnValue(of({ runIds: [77], queuedNetworks: 1 }));

    await TestBed.configureTestingModule({
      declarations: [CommunitiesComponent],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: CommunityAccessService, useValue: service }]
    }).compileComponents();

    fixture = TestBed.createComponent(CommunitiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads active Communities and their operational state', () => {
    expect(service.listCommunities).toHaveBeenCalled();
    expect(component.communities.map(item => item.communityId)).toEqual([10, 20]);
    expect(service.getAccess).toHaveBeenCalledWith(10);
    expect(service.getLatestSync).toHaveBeenCalledWith(10);
    expect(fixture.nativeElement.textContent).toContain('BraFurries');
    expect(fixture.nativeElement.textContent).toContain('Outra Comunidade');
  });

  it('does not expose manual Community creation or ownership claim', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Criar Community');
    expect(text).not.toContain('Reivindicar ownership');
    expect(text).toContain('Não é necessário reivindicar');
  });

  it('allows only Owner or Community Admin to request synchronization', () => {
    expect(component.canSync(owned)).toBeTrue();
    expect(component.canSync(member)).toBeFalse();

    component.requestSync(owned);

    expect(service.requestSync).toHaveBeenCalledWith(10);
    expect(component.successMessage).toContain('Sincronização');
  });

  it('polls a requested synchronization until it reaches a terminal state', fakeAsync(() => {
    const queued: CommunitySyncRun = {
      runId: 88,
      communityId: 10,
      networkType: 'DISCORD',
      externalNetworkId: '123',
      trigger: 'MANUAL',
      status: 'QUEUED',
      startedAt: null,
      completedAt: null,
      observedMembers: null,
      updatedMembers: null,
      errorCode: null
    };
    const success: CommunitySyncRun = {
      ...queued,
      status: 'SUCCESS',
      completedAt: '2026-10-02T19:30:00',
      observedMembers: 100,
      updatedMembers: 3
    };
    service.getLatestSync.calls.reset();
    service.getLatestSync.and.returnValues(of(queued), of(success));

    component.requestSync(owned);
    tick(0);

    expect(component.syncByCommunity.get(10)?.status).toBe('QUEUED');
    expect(component.syncInProgress(10)).toBeTrue();

    tick(3000);

    expect(component.syncByCommunity.get(10)?.status).toBe('SUCCESS');
    expect(component.syncInProgress(10)).toBeFalse();
  }));

  it('treats queued or running sync as in progress', () => {
    const queued: CommunitySyncRun = {
      runId: 88,
      communityId: 10,
      networkType: 'DISCORD',
      externalNetworkId: '123',
      trigger: 'MANUAL',
      status: 'QUEUED',
      startedAt: null,
      completedAt: null,
      observedMembers: null,
      updatedMembers: null,
      errorCode: null
    };
    component.syncByCommunity.set(10, queued);

    expect(component.syncInProgress(10)).toBeTrue();
    expect(component.syncStatusLabel(queued)).toBe('Aguardando o Coddy');
  });

  it('fails closed when Community listing is unavailable', () => {
    service.listCommunities.and.returnValue(
      throwError(() => ({ error: { message: 'indisponível' } }))
    );

    component.load();

    expect(component.communities).toEqual([]);
    expect(component.errorMessage).toBe('indisponível');
  });
});
