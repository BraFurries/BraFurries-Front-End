import { GuildRole } from '../../../core/services/managed-servers.service';
import { RoleSelectionComponent } from './role-selection.component';

describe('RoleSelectionComponent', () => {
  const roles: GuildRole[] = [
    { id: 'low', name: 'Baixo', position: 1, managed: false, editableByBot: true },
    { id: 'high', name: 'Alto', position: 10, managed: false, editableByBot: true },
    { id: 'middle', name: 'Médio', position: 5, managed: false, editableByBot: true }
  ];

  it('orders roles from highest to lowest and excludes selected roles from the dropdown', () => {
    const component = new RoleSelectionComponent();
    component.roles = roles;
    component.selectedRoleIds = ['middle'];

    expect(component.selectedRoles.map(role => role.id)).toEqual(['middle']);
    expect(component.availableRoles.map(role => role.id)).toEqual(['high', 'low']);
  });

  it('emits an add request and clearing the selection makes the role available again', () => {
    const component = new RoleSelectionComponent();
    component.roles = roles;
    component.selectedRoleIds = ['high'];
    const added: string[] = [];
    component.addRole.subscribe(id => added.push(id));

    component.select({ target: { value: 'low' } } as unknown as Event);
    expect(added).toEqual(['low']);
    component.selectedRoleIds = [];
    expect(component.availableRoles.map(role => role.id)).toEqual(['high', 'middle', 'low']);
  });

  it('reports persisted and draft selection states independently from bot editability', () => {
    const component = new RoleSelectionComponent();
    component.roles = roles;
    component.selectedRoleIds = ['high', 'low'];
    component.persistedRoleIds = ['high'];
    component.showPersistenceState = true;

    expect(component.roleState(roles[1])).toBe('Salvo');
    expect(component.roleState(roles[0])).toBe('Não salvo');
  });
});
