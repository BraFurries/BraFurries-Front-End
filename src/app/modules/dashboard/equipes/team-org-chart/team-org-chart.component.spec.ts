import { TeamMemberRef } from '../../../../core/services/community-team-assignments.service';
import { SimpleChange } from '@angular/core';
import { CommunityTeamRole } from '../../../../core/services/community-team-roles.service';
import { TeamOrgChartComponent, buildTeamOrgChart, flattenTeamOrgChart } from './team-org-chart.component';

describe('team organization chart', () => {
  const role = (id: number, name: string, parentRoleId: number | null = null, active = true): CommunityTeamRole => ({
    id, name, parentRoleId, active, description: null, createdAt: '', updatedAt: ''
  });

  it('builds one root with multiple children across levels', () => {
    const roots = buildTeamOrgChart([role(1, 'Dono'), role(2, 'Coordenador', 1), role(3, 'Moderador', 2), role(4, 'Colaborador', 1)]);

    expect(roots.map(node => node.role.name)).toEqual(['Dono']);
    expect(roots[0].children.map(node => node.role.name)).toEqual(['Colaborador', 'Coordenador']);
    expect(roots[0].children[1].children.map(node => node.role.name)).toEqual(['Moderador']);
  });

  it('keeps multiple roots in deterministic order', () => {
    expect(buildTeamOrgChart([role(2, 'Zulu'), role(1, 'Alpha')]).map(node => node.role.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('turns missing parents into visual roots without losing the role', () => {
    expect(buildTeamOrgChart([role(1, 'Órfão', 99)]).map(node => node.role.name)).toEqual(['Órfão']);
  });

  it('breaks an unexpected cycle without recursive rendering', () => {
    const flattened = flattenTeamOrgChart([role(1, 'Alpha', 2), role(2, 'Beta', 1)]);

    expect(flattened.map(item => item.id).sort()).toEqual([1, 2]);
  });

  it('promotes active descendants of hidden inactive roles to their nearest visible ancestor', () => {
    const roots = buildTeamOrgChart([role(1, 'Coordenador'), role(2, 'Moderador', 1, false), role(3, 'Colaborador', 2)], item => item.active);

    expect(roots[0].role.name).toBe('Coordenador');
    expect(roots[0].children.map(node => node.role.name)).toEqual(['Colaborador']);
  });

  it('keeps two hidden ancestors for hierarchy resolution without rendering them', () => {
    const allRoles = [
      role(1, 'Coordenador'),
      role(2, 'Moderador', 1, false),
      role(3, 'Assistente', 2, false),
      role(4, 'Colaborador', 3)
    ];
    const roots = buildTeamOrgChart([allRoles[0], allRoles[3]], () => true, allRoles);

    expect(roots.map(node => node.role.id)).toEqual([1]);
    expect(roots[0].children.map(node => node.role.id)).toEqual([4]);
    expect(flattenTeamOrgChart([allRoles[0], allRoles[3]], () => true, allRoles).map(item => item.id)).toEqual([1, 4]);
  });

  it('keeps a visible descendant as a root when it has no visible ancestor', () => {
    const hiddenParent = role(1, 'Coordenador', null, false);
    const visibleChild = role(2, 'Colaborador', 1);

    expect(buildTeamOrgChart([visibleChild], () => true, [hiddenParent, visibleChild]).map(node => node.role.id)).toEqual([2]);
  });

  it('uses the complete hierarchy without rendering hidden roles', () => {
    const component = new TeamOrgChartComponent();
    const allRoles = [role(1, 'Coordenador'), role(2, 'Moderador', 1, false), role(3, 'Colaborador', 2)];
    component.roles = [allRoles[0], allRoles[2]];
    component.hierarchyRoles = allRoles;
    component.showInactive = true;

    component.ngOnChanges({ roles: new SimpleChange([], component.roles, true) });

    expect(component.roots.map(node => node.role.id)).toEqual([1]);
    expect(component.roots[0].children.map(node => node.role.id)).toEqual([3]);
  });

  it('includes inactive roles when requested', () => {
    const roots = buildTeamOrgChart([role(1, 'Coordenador'), role(2, 'Moderador', 1, false)], () => true);

    expect(roots[0].children[0].role.active).toBeFalse();
  });

  it('exposes members associated with each role without changing the hierarchy', () => {
    const component = new TeamOrgChartComponent();
    const member: TeamMemberRef = {
      userId: 7,
      displayName: 'Fox',
      username: 'fox',
      profileImageUrl: null
    };    component.membersByRole = { 1: [member] };
    component.memberStateByRole = { 1: 'loaded', 2: 'error' };

    expect(component.membersFor(1).map(item => item.userId)).toEqual([7]);
    expect(component.membersFor(99)).toEqual([]);
    expect(component.memberState(1)).toBe('loaded');
    expect(component.memberState(2)).toBe('error');
    expect(component.memberState(99)).toBe('loading');
  });
});
