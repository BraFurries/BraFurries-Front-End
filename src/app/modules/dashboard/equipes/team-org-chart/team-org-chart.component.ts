import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { TeamMemberRef } from '../../../../core/services/community-team-assignments.service';
import { CommunityTeamRole } from '../../../../core/services/community-team-roles.service';

export interface TeamOrgChartNode {
  role: CommunityTeamRole;
  children: TeamOrgChartNode[];
}

export type TeamOrgRoleFilter = (role: CommunityTeamRole) => boolean;

export function buildTeamOrgChart(
  roles: CommunityTeamRole[],
  includeRole: TeamOrgRoleFilter = () => true,
  hierarchyRoles: CommunityTeamRole[] = roles
): TeamOrgChartNode[] {
  const allById = new Map(hierarchyRoles.map(role => [role.id, role]));
  const included = [...roles].filter(includeRole).sort(compareRoles);
  const includedById = new Map(included.map(role => [role.id, role]));
  const nodes = new Map<number, TeamOrgChartNode>(included.map(role => [role.id, { role, children: [] }]));
  const attachedParents = new Map<number, number>();
  const roots: TeamOrgChartNode[] = [];

  for (const role of included) {
    const parentId = nearestVisibleParent(role, allById, includedById);
    const node = nodes.get(role.id)!;
    if (parentId === null || createsCycle(role.id, parentId, attachedParents)) {
      roots.push(node);
      continue;
    }
    nodes.get(parentId)!.children.push(node);
    attachedParents.set(role.id, parentId);
  }

  return roots;
}

export function flattenTeamOrgChart(
  roles: CommunityTeamRole[],
  includeRole: TeamOrgRoleFilter = () => true,
  hierarchyRoles: CommunityTeamRole[] = roles
): CommunityTeamRole[] {
  const flattened: CommunityTeamRole[] = [];
  const visit = (node: TeamOrgChartNode): void => {
    flattened.push(node.role);
    node.children.forEach(visit);
  };
  buildTeamOrgChart(roles, includeRole, hierarchyRoles).forEach(visit);
  return flattened;
}

function compareRoles(first: CommunityTeamRole, second: CommunityTeamRole): number {
  return first.name.localeCompare(second.name, 'pt-BR') || first.id - second.id;
}

function nearestVisibleParent(role: CommunityTeamRole, allById: Map<number, CommunityTeamRole>, includedById: Map<number, CommunityTeamRole>): number | null {
  const visited = new Set<number>([role.id]);
  let parentId = role.parentRoleId;
  while (parentId !== null) {
    if (visited.has(parentId)) return null;
    visited.add(parentId);
    if (includedById.has(parentId)) return parentId;
    const parent = allById.get(parentId);
    if (!parent) return null;
    parentId = parent.parentRoleId;
  }
  return null;
}

function createsCycle(roleId: number, parentId: number, attachedParents: Map<number, number>): boolean {
  const visited = new Set<number>();
  let current: number | undefined = parentId;
  while (current !== undefined) {
    if (current === roleId || visited.has(current)) return true;
    visited.add(current);
    current = attachedParents.get(current);
  }
  return false;
}

@Component({
  selector: 'app-team-org-chart',
  standalone: false,
  templateUrl: './team-org-chart.component.html'
})
export class TeamOrgChartComponent implements OnChanges {
  @Input() roles: CommunityTeamRole[] = [];
  @Input() hierarchyRoles: CommunityTeamRole[] = [];
  @Input() showInactive = false;
  @Input() showMembers = false;
  @Input() membersByRole: Record<number, TeamMemberRef[]> = {};
  @Input() memberStateByRole: Record<number, 'loading' | 'loaded' | 'error'> = {};
  @Input() emptyMessage = 'Nenhum cargo cadastrado para montar o organograma.';
  roots: TeamOrgChartNode[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['roles'] || changes['hierarchyRoles'] || changes['showInactive']) {
      this.roots = buildTeamOrgChart(
        this.roles,
        role => this.showInactive || role.active,
        this.hierarchyRoles.length ? this.hierarchyRoles : this.roles
      );
    }
  }

  membersFor(roleId: number): TeamMemberRef[] {
    return this.membersByRole[roleId] ?? [];
  }

  memberState(roleId: number): 'loading' | 'loaded' | 'error' {
    return this.memberStateByRole[roleId] ?? 'loading';
  }
}
