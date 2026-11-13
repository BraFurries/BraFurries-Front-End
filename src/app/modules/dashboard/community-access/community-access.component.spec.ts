import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import {
  CommunityCapabilityDefinition,
  CommunityCapabilityService,
  CommunityMemberSummary
} from '../../../core/services/community-capability.service';
import { CommunityAccessComponent } from './community-access.component';

describe('CommunityAccessComponent', () => {
  let component: CommunityAccessComponent;
  let fixture: ComponentFixture<CommunityAccessComponent>;
  let context$: BehaviorSubject<CommunityContextState>;
  let context: { state$: any; snapshot: CommunityContextState; refreshActiveAccess: jasmine.Spy };
  let capabilities: jasmine.SpyObj<CommunityCapabilityService>;
  let memberServerGrants: Map<string, Set<string>>;
  let roleServerGrants: Map<string, Set<string>>;

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
  const members: CommunityMemberSummary[] = [
    { userId: 7, displayName: 'Fox', username: 'fox', profileImageUrl: null, status: 'active', roleIds: [3] },
    { userId: 8, displayName: 'Dragon', username: 'dragon', profileImageUrl: null, status: 'active', roleIds: [4] }
  ];
  const roles = [
    { id: 3, name: 'Coordenação', description: null, parentRoleId: null, active: true,
      createdAt: '2026-10-01T00:00:00', updatedAt: '2026-10-01T00:00:00' },
    { id: 4, name: 'Monitor', description: null, parentRoleId: 3, active: true,
      createdAt: '2026-10-01T00:00:00', updatedAt: '2026-10-01T00:00:00' }
  ];
  const catalog: CommunityCapabilityDefinition[] = [
    { code: 'COMMUNITY_ADMIN', directGrantAllowed: true, roleGrantAllowed: false, hierarchicalTeamScope: false },
    { code: 'MEMBERS_VIEW', directGrantAllowed: true, roleGrantAllowed: true, hierarchicalTeamScope: false },
    { code: 'MEMBER_NOTES_VIEW', directGrantAllowed: true, roleGrantAllowed: false, hierarchicalTeamScope: false },
    { code: 'TEAM_MANAGE_STRUCTURE', directGrantAllowed: false, roleGrantAllowed: true, hierarchicalTeamScope: true },
    { code: 'TEAM_VIEW', directGrantAllowed: false, roleGrantAllowed: false, hierarchicalTeamScope: false },
    { code: 'RECRUITMENT_MANAGE_PROCESSES', directGrantAllowed: true, roleGrantAllowed: true, hierarchicalTeamScope: false },
    { code: 'RECRUITMENT_PUBLISH_PROCESSES', directGrantAllowed: true, roleGrantAllowed: true, hierarchicalTeamScope: false },
    { code: 'RECRUITMENT_REVIEW_APPLICATIONS', directGrantAllowed: true, roleGrantAllowed: true, hierarchicalTeamScope: false }
  ];

  const find = (code: string): CommunityCapabilityDefinition => catalog.find(item => item.code === code)!;
  const key = (communityId: number, id: number): string => `${communityId}:${id}`;

  beforeEach(async () => {
    memberServerGrants = new Map([['1:7', new Set(['MEMBERS_VIEW'])]]);
    roleServerGrants = new Map();

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

    capabilities = jasmine.createSpyObj<CommunityCapabilityService>('CommunityCapabilityService', [
      'catalog', 'listMembers', 'listRoles', 'directGrants', 'roleGrants',
      'grantDirect', 'revokeDirect', 'grantRole', 'revokeRole'
    ]);
    capabilities.catalog.and.returnValue(of({ capabilities: catalog }));
    capabilities.listMembers.and.returnValue(of({
      items: members, pagination: { page: 1, pageSize: 100, totalElements: 2, totalPages: 1 }
    }));
    capabilities.listRoles.and.returnValue(of(roles));
    capabilities.directGrants.and.callFake((communityId, userId) =>
      of({ userId, capabilities: [...(memberServerGrants.get(key(communityId, userId)) ?? new Set())] })
    );
    capabilities.roleGrants.and.callFake((communityId, roleId) =>
      of({ roleId, capabilities: [...(roleServerGrants.get(key(communityId, roleId)) ?? new Set())] })
    );
    capabilities.grantDirect.and.callFake((communityId, userId, code) => {
      const group = key(communityId, userId);
      const grants = memberServerGrants.get(group) ?? new Set<string>();
      grants.add(code);
      memberServerGrants.set(group, grants);
      return of({ userId, capabilities: [...grants] });
    });
    capabilities.revokeDirect.and.callFake((communityId, userId, code) => {
      const grants = memberServerGrants.get(key(communityId, userId)) ?? new Set<string>();
      grants.delete(code);
      return of({ userId, capabilities: [...grants] });
    });
    capabilities.grantRole.and.callFake((communityId, roleId, code) => {
      const group = key(communityId, roleId);
      const grants = roleServerGrants.get(group) ?? new Set<string>();
      grants.add(code);
      roleServerGrants.set(group, grants);
      return of({ roleId, capabilities: [...grants] });
    });
    capabilities.revokeRole.and.callFake((communityId, roleId, code) => {
      const grants = roleServerGrants.get(key(communityId, roleId)) ?? new Set<string>();
      grants.delete(code);
      return of({ roleId, capabilities: [...grants] });
    });

    await TestBed.configureTestingModule({
      declarations: [CommunityAccessComponent],
      imports: [CommonModule, FormsModule],
      providers: [
        { provide: CommunityContextService, useValue: context },
        { provide: CommunityCapabilityService, useValue: capabilities }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CommunityAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture?.destroy());

  it('loads canonical targets from only the active Community', () => {
    expect(capabilities.catalog).toHaveBeenCalledWith(1);
    expect(capabilities.listMembers).toHaveBeenCalledWith(1, 1, 100, '');
    expect(component.members.map(member => member.userId)).toEqual([7, 8]);
    expect(component.roles.map(role => role.id)).toEqual([3, 4]);
    expect(component.pendingCount).toBe(0);
  });

  it('translates recruitment capabilities while preserving their API codes', () => {
    expect(component.capabilityLabel('RECRUITMENT_MANAGE_PROCESSES')).toBe('Gerenciar processos seletivos');
    expect(component.capabilityLabel('RECRUITMENT_PUBLISH_PROCESSES')).toBe('Publicar processos seletivos');
    expect(component.capabilityLabel('RECRUITMENT_REVIEW_APPLICATIONS')).toBe('Avaliar candidaturas');
    expect(component.capabilityHelp(find('RECRUITMENT_REVIEW_APPLICATIONS'))).toContain('candidaturas');
    expect(component.capabilityLabel('UNRECOGNIZED_CAPABILITY')).toBe('UNRECOGNIZED_CAPABILITY');
  });

  it('never writes when a checkbox is clicked, only on Save', () => {
    component.selectMember(members[0]);
    component.toggleDirect(find('RECRUITMENT_REVIEW_APPLICATIONS'));
    fixture.detectChanges();

    expect(component.hasDirect('RECRUITMENT_REVIEW_APPLICATIONS')).toBeTrue();
    expect(component.pendingCount).toBe(1);
    expect(component.dirty).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('1 alteração pendente');
    expect(capabilities.grantDirect).not.toHaveBeenCalled();
    expect(capabilities.revokeDirect).not.toHaveBeenCalled();

    component.saveChanges();

    expect(capabilities.grantDirect).toHaveBeenCalledOnceWith(1, 7, 'RECRUITMENT_REVIEW_APPLICATIONS');
    expect(component.pendingCount).toBe(0);
    expect(component.successMessage).toContain('alteração salva');
    expect(context.refreshActiveAccess).toHaveBeenCalledTimes(1);
  });

  it('saves staged changes for several members and roles with one click', () => {
    component.selectMember(members[0]);
    component.toggleDirect(find('RECRUITMENT_REVIEW_APPLICATIONS'));
    component.selectMember(members[1]);
    component.toggleDirect(find('MEMBER_NOTES_VIEW'));
    component.selectRole(roles[0]);
    component.toggleRole(find('RECRUITMENT_MANAGE_PROCESSES'));
    component.selectMember(members[0]);

    expect(component.hasDirect('RECRUITMENT_REVIEW_APPLICATIONS')).toBeTrue();
    expect(component.pendingCount).toBe(3);
    expect(capabilities.grantDirect).not.toHaveBeenCalled();
    expect(capabilities.grantRole).not.toHaveBeenCalled();

    component.saveChanges();

    expect(capabilities.grantDirect).toHaveBeenCalledWith(1, 7, 'RECRUITMENT_REVIEW_APPLICATIONS');
    expect(capabilities.grantDirect).toHaveBeenCalledWith(1, 8, 'MEMBER_NOTES_VIEW');
    expect(capabilities.grantRole).toHaveBeenCalledWith(1, 3, 'RECRUITMENT_MANAGE_PROCESSES');
    expect(component.pendingCount).toBe(0);
    expect(context.refreshActiveAccess).toHaveBeenCalledTimes(1);
  });

  it('discards all pending changes without sending mutations', () => {
    component.selectMember(members[0]);
    component.toggleDirect(find('MEMBERS_VIEW'));
    component.selectRole(roles[0]);
    component.toggleRole(find('TEAM_MANAGE_STRUCTURE'));
    expect(component.pendingCount).toBe(2);

    component.discardChanges();

    expect(component.pendingCount).toBe(0);
    expect(component.hasDirect('MEMBERS_VIEW')).toBeTrue();
    expect(component.hasRole('TEAM_MANAGE_STRUCTURE')).toBeFalse();
    expect(capabilities.revokeDirect).not.toHaveBeenCalled();
    expect(capabilities.grantRole).not.toHaveBeenCalled();
  });

  it('preserves the unsaved operations after a partial API failure', () => {
    component.selectMember(members[0]);
    component.toggleDirect(find('RECRUITMENT_REVIEW_APPLICATIONS'));
    component.selectRole(roles[0]);
    component.toggleRole(find('TEAM_MANAGE_STRUCTURE'));
    capabilities.grantRole.and.returnValue(throwError(() => ({ error: { message: 'Falha simulada' } })));

    component.saveChanges();

    expect(capabilities.grantDirect).toHaveBeenCalledOnceWith(1, 7, 'RECRUITMENT_REVIEW_APPLICATIONS');
    expect(capabilities.grantRole).toHaveBeenCalledTimes(1);
    expect(component.errorMessage).toContain('1 de 2 alterações confirmadas');
    expect(component.pendingCount).toBe(1);
    expect(context.refreshActiveAccess).toHaveBeenCalledTimes(1);

    capabilities.grantRole.and.callFake((communityId, roleId, code) =>
      of({ roleId, capabilities: [code] })
    );
    component.saveChanges();

    expect(capabilities.grantDirect).toHaveBeenCalledTimes(1);
    expect(capabilities.grantRole).toHaveBeenCalledTimes(2);
    expect(component.pendingCount).toBe(0);
  });

  it('does not leak drafts or submit writes to a different Community', () => {
    component.selectMember(members[0]);
    component.toggleDirect(find('MEMBER_NOTES_VIEW'));
    expect(component.pendingCount).toBe(1);

    context$.next({
      ...context$.value,
      activeCommunity: { ...community, communityId: 2, name: 'Outra' },
      activeAccess: { ...ownerAccess, communityId: 2 }
    });

    expect(component.selectedCommunityId).toBe(2);
    expect(component.selectedMember).toBeUndefined();
    expect(component.selectedRole).toBeUndefined();
    expect(component.pendingCount).toBe(0);
    expect(component.errorMessage).toContain('descartadas');
    expect(capabilities.catalog).toHaveBeenCalledWith(2);

    component.selectMember(members[0]);
    expect(capabilities.directGrants).toHaveBeenCalledWith(2, 7);
    component.saveChanges();
    expect(capabilities.grantDirect).not.toHaveBeenCalled();
  });

  it('protects Community Admin grants when the actor lacks owner authority', () => {
    expect(component.directDefinitions().some(item => item.code === 'COMMUNITY_ADMIN')).toBeTrue();

    context$.next({
      ...context$.value,
      activeAccess: { ...ownerAccess, owner: false, communityAdmin: true, canManageCommunityAdmins: false }
    });

    expect(component.directDefinitions().some(item => item.code === 'COMMUNITY_ADMIN')).toBeFalse();
    component.selectMember(members[0]);
    component.toggleDirect(find('COMMUNITY_ADMIN'));
    expect(component.pendingCount).toBe(0);
  });

  it('does not expose implicit or disallowed capabilities as grantable', () => {
    expect(component.roleDefinitions().some(item => item.code === 'TEAM_VIEW')).toBeFalse();
    expect(component.directDefinitions().some(item => item.code === 'TEAM_MANAGE_STRUCTURE')).toBeFalse();
  });

  it('warns before leaving with pending changes', () => {
    component.selectRole(roles[0]);
    component.toggleRole(find('RECRUITMENT_MANAGE_PROCESSES'));
    const confirmation = spyOn(window, 'confirm').and.returnValue(false);

    expect(component.canDeactivate()).toBeFalse();
    expect(confirmation).toHaveBeenCalled();
    confirmation.and.returnValue(true);
    expect(component.canDeactivate()).toBeTrue();

    component.discardChanges();
    expect(component.canDeactivate()).toBeTrue();
  });

  it('blocks additional edits while the save request is in flight', () => {
    const response = new Subject<{ userId: number; capabilities: string[] }>();
    capabilities.revokeDirect.and.returnValue(response.asObservable());
    component.selectMember(members[0]);
    component.toggleDirect(find('MEMBERS_VIEW'));
    expect(component.canSave).toBeTrue();

    component.saveChanges();
    expect(component.saving).toBeTrue();
    expect(component.canSave).toBeFalse();
    expect(component.canDeactivate()).toBeFalse();

    component.toggleDirect(find('MEMBER_NOTES_VIEW'));
    expect(component.hasDirect('MEMBER_NOTES_VIEW')).toBeFalse();
    expect(capabilities.revokeDirect).toHaveBeenCalledTimes(1);

    response.next({ userId: 7, capabilities: [] });
    response.complete();
    expect(component.saving).toBeFalse();
    expect(component.pendingCount).toBe(0);
  });
});
