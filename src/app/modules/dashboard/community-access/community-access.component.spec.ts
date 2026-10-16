import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';

import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import { CommunityCapabilityService } from '../../../core/services/community-capability.service';
import { CommunityAccessComponent } from './community-access.component';

describe('CommunityAccessComponent', () => {
  let component: CommunityAccessComponent;
  let fixture: ComponentFixture<CommunityAccessComponent>;
  let context$: BehaviorSubject<CommunityContextState>;
  let context: any;

  const community = {
    communityId: 1,
    name: 'BraFurries',
    ownedByMe: true,
    ownerAssigned: true,
    member: true,
    networks: []
  };

  const ownerAccess = {
    communityId: 1,
    owner: true,
    communityAdmin: false,
    activeMember: true,
    canManageCommunityAdmins: true,
    activeRoleIds: [],
    capabilities: ['TEAM_VIEW', 'MEMBERS_VIEW'],
    teamScopes: []
  };

  const capabilityService = {
    catalog: jasmine.createSpy('catalog').and.returnValue(of({
      capabilities: [
        { code: 'COMMUNITY_ADMIN', directGrantAllowed: true, roleGrantAllowed: false, hierarchicalTeamScope: false },
        { code: 'MEMBERS_VIEW', directGrantAllowed: true, roleGrantAllowed: true, hierarchicalTeamScope: false },
        { code: 'TEAM_MANAGE_STRUCTURE', directGrantAllowed: false, roleGrantAllowed: true, hierarchicalTeamScope: true },
        { code: 'TEAM_VIEW', directGrantAllowed: false, roleGrantAllowed: false, hierarchicalTeamScope: false }
      ]
    })),
    listMembers: jasmine.createSpy('listMembers').and.returnValue(of({
      items: [{
        userId: 7,
        displayName: 'Fox',
        username: 'fox',
        profileImageUrl: null,
        status: 'active',
        roleIds: [3]
      }],
      pagination: { page: 1, pageSize: 100, totalElements: 1, totalPages: 1 }
    })),
    listRoles: jasmine.createSpy('listRoles').and.returnValue(of([{
      id: 3,
      name: 'Coordenação',
      description: null,
      parentRoleId: null,
      active: true,
      createdAt: '2026-10-01T00:00:00',
      updatedAt: '2026-10-01T00:00:00'
    }])),
    directGrants: jasmine.createSpy('directGrants').and.returnValue(of({ userId: 7, capabilities: ['MEMBERS_VIEW'] })),
    roleGrants: jasmine.createSpy('roleGrants').and.returnValue(of({ roleId: 3, capabilities: [] })),
    grantDirect: jasmine.createSpy('grantDirect').and.returnValue(
      of({ userId: 7, capabilities: ['MEMBERS_VIEW', 'COMMUNITY_ADMIN'] })
    ),
    revokeDirect: jasmine.createSpy('revokeDirect').and.returnValue(
      of({ userId: 7, capabilities: [] })
    ),
    grantRole: jasmine.createSpy('grantRole').and.returnValue(
      of({ roleId: 3, capabilities: ['TEAM_MANAGE_STRUCTURE'] })
    ),
    revokeRole: jasmine.createSpy('revokeRole').and.returnValue(
      of({ roleId: 3, capabilities: [] })
    )
  };

  beforeEach(async () => {
    context$ = new BehaviorSubject<CommunityContextState>({
      status: 'ready',
      communities: [community],
      activeCommunity: community,
      activeAccess: ownerAccess,
      managedDiscordServers: [],
      managedServersAvailable: true,
      errorMessage: ''
    });
    context = {
      state$: context$.asObservable(),
      get snapshot() { return context$.value; },
      refreshActiveAccess: jasmine.createSpy('refreshActiveAccess').and.returnValue(of(ownerAccess))
    };

    capabilityService.catalog.calls.reset();
    capabilityService.listMembers.calls.reset();
    capabilityService.listRoles.calls.reset();
    capabilityService.grantRole.calls.reset();
    capabilityService.revokeRole.calls.reset();

    await TestBed.configureTestingModule({
      declarations: [CommunityAccessComponent],
      imports: [CommonModule, FormsModule],
      providers: [
        { provide: CommunityContextService, useValue: context },
        { provide: CommunityCapabilityService, useValue: capabilityService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CommunityAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads canonical targets for the active Community only', () => {
    expect(component.selectedCommunityId).toBe(1);
    expect(capabilityService.catalog).toHaveBeenCalledWith(1);
    expect(capabilityService.listMembers).toHaveBeenCalledWith(1, 1, 100, '');
    expect(component.members.map(member => member.userId)).toEqual([7]);
    expect(component.roles.map(role => role.id)).toEqual([3]);
  });

  it('reloads targets when the global Community changes', () => {
    context$.next({
      ...context$.value,
      activeCommunity: { ...community, communityId: 2, name: 'Outra' },
      activeAccess: { ...ownerAccess, communityId: 2 }
    });

    expect(component.selectedCommunityId).toBe(2);
    expect(capabilityService.catalog).toHaveBeenCalledWith(2);
    expect(component.selectedMember).toBeUndefined();
    expect(component.selectedRole).toBeUndefined();
  });

  it('shows COMMUNITY_ADMIN only to an Owner who can manage admins', () => {
    expect(component.directDefinitions().map(definition => definition.code))
      .toContain('COMMUNITY_ADMIN');

    context$.next({
      ...context$.value,
      activeAccess: {
        ...ownerAccess,
        owner: false,
        communityAdmin: true,
        canManageCommunityAdmins: false
      }
    });

    expect(component.directDefinitions().map(definition => definition.code))
      .not.toContain('COMMUNITY_ADMIN');
  });

  it('keeps implicit TEAM_VIEW out of grantable role capabilities', () => {
    expect(component.roleDefinitions().map(definition => definition.code))
      .toEqual(['MEMBERS_VIEW', 'TEAM_MANAGE_STRUCTURE']);
  });

  it('mutates grants through the API and refreshes active access for the sidebar', () => {
    component.selectRole(component.roles[0]);
    component.toggleRole(
      component.catalog.find(definition => definition.code === 'TEAM_MANAGE_STRUCTURE')!
    );

    expect(capabilityService.grantRole).toHaveBeenCalledWith(1, 3, 'TEAM_MANAGE_STRUCTURE');
    expect(component.hasRole('TEAM_MANAGE_STRUCTURE')).toBeTrue();
    expect(context.refreshActiveAccess).toHaveBeenCalled();
  });
});
