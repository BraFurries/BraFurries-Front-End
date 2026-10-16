import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { CommunityAccess } from '../../../core/services/community-access.service';
import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import {
  CommunityTeamAssignment,
  CommunityTeamAssignmentsService,
  TeamMemberRef
} from '../../../core/services/community-team-assignments.service';
import {
  CommunityTeamDemand,
  CommunityTeamDemandsService
} from '../../../core/services/community-team-demands.service';
import {
  CommunityTeamRole,
  CommunityTeamRolesService
} from '../../../core/services/community-team-roles.service';
import { EquipesComponent } from './equipes.component';

describe('EquipesComponent', () => {
  let context$: BehaviorSubject<CommunityContextState>;
  let context: CommunityContextService;
  let teamRoles: jasmine.SpyObj<CommunityTeamRolesService>;
  let teamDemands: jasmine.SpyObj<CommunityTeamDemandsService>;
  let teamAssignments: jasmine.SpyObj<CommunityTeamAssignmentsService>;
  let component: EquipesComponent;

  const community = {
    communityId: 10,
    name: 'BraFurries',
    ownedByMe: true,
    ownerAssigned: true,
    member: true,
    networks: []
  };
  const ownerAccess: CommunityAccess = {
    communityId: 10,
    owner: true,
    communityAdmin: false,
    activeMember: true,
    canManageCommunityAdmins: true,
    activeRoleIds: [],
    capabilities: [
      'TEAM_VIEW',
      'TEAM_ASSIGN_MEMBERS',
      'TEAM_MANAGE_STRUCTURE',
      'TEAM_MANAGE_DEMANDS',
      'MEMBERS_VIEW'
    ],
    teamScopes: [
      { capability: 'TEAM_ASSIGN_MEMBERS', unrestricted: true, sourceRoleIds: [], targetRoleIds: [] },
      { capability: 'TEAM_MANAGE_STRUCTURE', unrestricted: true, sourceRoleIds: [], targetRoleIds: [] },
      { capability: 'TEAM_MANAGE_DEMANDS', unrestricted: true, sourceRoleIds: [], targetRoleIds: [] }
    ]
  };
  const state: CommunityContextState = {
    status: 'ready',
    communities: [community],
    activeCommunity: community,
    activeAccess: ownerAccess,
    managedDiscordServers: [],
    managedServersAvailable: true,
    errorMessage: ''
  };
  const role: CommunityTeamRole = {
    id: 1,
    name: 'Coordenador',
    description: null,
    parentRoleId: null,
    active: true,
    createdAt: '2026-09-17T12:00:00',
    updatedAt: '2026-09-17T12:00:00'
  };
  const demand: CommunityTeamDemand = {
    id: 1,
    name: 'Recepção',
    description: null,
    roleIds: [1],
    createdAt: '2026-09-17T12:00:00',
    updatedAt: '2026-09-17T12:00:00'
  };
  const member: TeamMemberRef = {
    userId: 7,
    displayName: 'Fox',
    username: 'fox',
    profileImageUrl: null
  };

  beforeEach(() => {
    context$ = new BehaviorSubject<CommunityContextState>(state);
    context = {
      state$: context$.asObservable(),
      get snapshot() { return context$.value; }
    } as CommunityContextService;

    teamRoles = jasmine.createSpyObj('CommunityTeamRolesService', [
      'listCommunity',
      'createCommunity',
      'updateCommunity',
      'setActiveCommunity',
      'deletionImpactCommunity',
      'deleteCommunity'
    ]);
    teamDemands = jasmine.createSpyObj('CommunityTeamDemandsService', [
      'listCommunity',
      'createCommunity',
      'updateCommunity',
      'deleteCommunity'
    ]);
    teamAssignments = jasmine.createSpyObj('CommunityTeamAssignmentsService', [
      'listMembersCommunity',
      'listMemberCandidatesCommunity',
      'assignCommunity',
      'removeCommunity',
      'listRolesCommunity'
    ]);

    teamRoles.listCommunity.and.returnValue(of([]));
    teamRoles.createCommunity.and.returnValue(of(role));
    teamRoles.updateCommunity.and.returnValue(of(role));
    teamRoles.setActiveCommunity.and.returnValue(of(role));
    teamRoles.deletionImpactCommunity.and.returnValue(of({
      canDelete: true,
      childRoleCount: 0,
      demandCount: 0,
      assignmentCount: 0
    }));
    teamRoles.deleteCommunity.and.returnValue(of(void 0));
    teamDemands.listCommunity.and.returnValue(of([]));
    teamDemands.createCommunity.and.returnValue(of(demand));
    teamDemands.updateCommunity.and.returnValue(of(demand));
    teamDemands.deleteCommunity.and.returnValue(of(void 0));
    teamAssignments.listMembersCommunity.and.returnValue(of([]));
    teamAssignments.listMemberCandidatesCommunity.and.returnValue(of({
      items: [],
      pagination: { page: 1, pageSize: 100, totalElements: 0, totalPages: 0 }
    }));
    teamAssignments.assignCommunity.and.returnValue(
      of({ roleId: 1, userId: 7, createdAt: null } as CommunityTeamAssignment)
    );
    teamAssignments.removeCommunity.and.returnValue(of(void 0));
    teamAssignments.listRolesCommunity.and.returnValue(of([]));

    component = new EquipesComponent(context, teamRoles, teamDemands, teamAssignments);
    component.ngOnInit();
  });

  afterEach(() => component.ngOnDestroy());

  function setAccess(access: CommunityAccess, communityId = 10): void {
    context$.next({
      ...state,
      activeCommunity: { ...community, communityId },
      activeAccess: { ...access, communityId }
    });
  }

  it('loads roles and demands only for the active Community context', () => {
    expect(teamRoles.listCommunity).toHaveBeenCalledWith(10);
    expect(teamDemands.listCommunity).toHaveBeenCalledWith(10);
  });

  it('resets tenant-local state and reloads when global Community changes', () => {
    component.roles = [role];
    component.demands = [demand];
    component.roleSearchTerm = 'coord';

    setAccess(ownerAccess, 20);

    expect(component.selectedCommunityId).toBe(20);
    expect(component.roles).toEqual([]);
    expect(component.demands).toEqual([]);
    expect(component.roleSearchTerm).toBe('');
    expect(teamRoles.listCommunity).toHaveBeenCalledWith(20);
    expect(teamDemands.listCommunity).toHaveBeenCalledWith(20);
  });

  it('ignores an older role response after a newer load', () => {
    const first = new Subject<CommunityTeamRole[]>();
    const second = new Subject<CommunityTeamRole[]>();
    teamRoles.listCommunity.and.returnValues(first, second);

    component.loadRoles();
    component.loadRoles();
    second.next([{ ...role, name: 'Atual' }]);
    first.next([{ ...role, name: 'Obsoleto' }]);

    expect(component.roles.map(item => item.name)).toEqual(['Atual']);
  });

  it('opens Meu time for an assigned member and keeps one parent plus descendants', () => {
    const direction = { ...role, id: 1, name: 'Direção' };
    const coordination = { ...role, id: 2, name: 'Coordenação', parentRoleId: 1 };
    const moderation = { ...role, id: 3, name: 'Moderação', parentRoleId: 2 };
    const collaborator = { ...role, id: 4, name: 'Colaborador', parentRoleId: 3 };
    const events = { ...role, id: 5, name: 'Eventos', parentRoleId: 1 };

    setAccess({
      ...ownerAccess,
      owner: false,
      activeRoleIds: [2],
      capabilities: ['TEAM_VIEW'],
      teamScopes: []
    });
    component.roles = [direction, coordination, moderation, collaborator, events];
    component.refreshRoleViews();

    expect(component.teamViewMode).toBe('mine');
    expect(component.filteredRoleList.map(item => item.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it('can show the full organogram without gaining edit authority', () => {
    setAccess({
      ...ownerAccess,
      owner: false,
      activeRoleIds: [1],
      capabilities: ['TEAM_VIEW'],
      teamScopes: []
    });
    component.roles = [role, { ...role, id: 2, name: 'Eventos' }];
    component.refreshRoleViews();

    component.setTeamViewMode('all');

    expect(component.filteredRoleList.map(item => item.id)).toEqual([1, 2]);
    expect(component.canManageStructureRole(2)).toBeFalse();
  });

  it('projects TEAM_MANAGE_STRUCTURE only to strict descendants', () => {
    const source = { ...role, id: 2, name: 'Coordenação' };
    const child = { ...role, id: 3, name: 'Moderação', parentRoleId: 2 };
    component.roles = [source, child];

    setAccess({
      ...ownerAccess,
      owner: false,
      activeRoleIds: [2],
      capabilities: ['TEAM_VIEW', 'TEAM_MANAGE_STRUCTURE'],
      teamScopes: [{
        capability: 'TEAM_MANAGE_STRUCTURE',
        unrestricted: false,
        sourceRoleIds: [2],
        targetRoleIds: [3]
      }]
    });
    component.roles = [source, child];

    expect(component.canManageStructureRole(2)).toBeFalse();
    expect(component.canManageStructureRole(3)).toBeTrue();
    expect(component.canCreateRootRole()).toBeFalse();

    component.openCreate();
    expect(component.draft.parentRoleId).toBe(2);
  });

  it('lets MEMBERS_VIEW inspect role membership without granting assignment mutation', () => {
    setAccess({
      ...ownerAccess,
      owner: false,
      capabilities: ['TEAM_VIEW', 'MEMBERS_VIEW'],
      teamScopes: [],
      activeRoleIds: []
    });
    component.roles = [role];
    teamAssignments.listMembersCommunity.and.returnValue(of([member]));

    component.openRoleMembers(role);

    expect(component.canViewRoleMembers(role.id)).toBeTrue();
    expect(component.canAssignRole(role.id)).toBeFalse();
    expect(teamAssignments.listMembersCommunity).toHaveBeenCalledWith(10, role.id);
    expect(teamAssignments.listMemberCandidatesCommunity).not.toHaveBeenCalled();
  });

  it('allows scoped assignment only to allowed descendant roles', () => {
    const source = { ...role, id: 2, name: 'Coordenação' };
    const child = { ...role, id: 3, name: 'Moderação', parentRoleId: 2 };
    setAccess({
      ...ownerAccess,
      owner: false,
      capabilities: ['TEAM_VIEW', 'TEAM_ASSIGN_MEMBERS'],
      activeRoleIds: [2],
      teamScopes: [{
        capability: 'TEAM_ASSIGN_MEMBERS',
        unrestricted: false,
        sourceRoleIds: [2],
        targetRoleIds: [3]
      }]
    });
    component.roles = [source, child];
    teamAssignments.listMembersCommunity.and.returnValue(of([]));
    teamAssignments.listMemberCandidatesCommunity.and.returnValue(of({
      items: [member],
      pagination: { page: 1, pageSize: 100, totalElements: 1, totalPages: 1 }
    }));

    expect(component.canViewRoleMembers(source.id)).toBeFalse();
    expect(component.canViewRoleMembers(child.id)).toBeTrue();

    component.openRoleMembers(child);
    component.assignMember(member);

    expect(teamAssignments.assignCommunity).toHaveBeenCalledWith(10, 3, 7);
  });

  it('does not expose organization member names for TEAM_VIEW alone', () => {
    setAccess({
      ...ownerAccess,
      owner: false,
      capabilities: ['TEAM_VIEW'],
      teamScopes: [],
      activeRoleIds: [1]
    });
    component.roles = [role];

    component.toggleOrgMembers();

    expect(component.showOrgMembers).toBeFalse();
    expect(teamAssignments.listMembersCommunity).not.toHaveBeenCalled();
  });

  it('restricts demand management to one source subtree', () => {
    const sourceA = { ...role, id: 2, name: 'A' };
    const childA = { ...role, id: 3, name: 'A1', parentRoleId: 2 };
    const sourceB = { ...role, id: 5, name: 'B' };
    const childB = { ...role, id: 6, name: 'B1', parentRoleId: 5 };
    setAccess({
      ...ownerAccess,
      owner: false,
      capabilities: ['TEAM_VIEW', 'TEAM_MANAGE_DEMANDS'],
      activeRoleIds: [2, 5],
      teamScopes: [{
        capability: 'TEAM_MANAGE_DEMANDS',
        unrestricted: false,
        sourceRoleIds: [2, 5],
        targetRoleIds: [3, 6]
      }]
    });
    component.roles = [sourceA, childA, sourceB, childB];

    expect(component.canManageDemand({ ...demand, roleIds: [3] })).toBeTrue();
    expect(component.canManageDemand({ ...demand, roleIds: [3, 6] })).toBeFalse();
  });

  it('keeps delete errors visible instead of closing the operation', () => {
    teamDemands.deleteCommunity.and.returnValue(
      throwError(() => ({ error: { message: 'Demanda em uso' } }))
    );
    component.demands = [demand];

    component.openDemandDelete(demand);
    component.confirmDemandDelete();

    expect(component.deletingDemand).toBe(demand);
    expect(component.demandDeleteError).toBe('Demanda em uso');
  });
});
