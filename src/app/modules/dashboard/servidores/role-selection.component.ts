import { Component, EventEmitter, Input, Output } from '@angular/core';

import { GuildRole } from '../../../core/services/managed-servers.service';

@Component({
  selector: 'app-role-selection',
  standalone: false,
  templateUrl: './role-selection.component.html',
  styleUrl: './role-selection.component.scss'
})
export class RoleSelectionComponent {
  @Input({ required: true }) roles: GuildRole[] = [];
  @Input({ required: true }) selectedRoleIds: string[] = [];
  @Input() persistedRoleIds: string[] = [];
  @Input() label = 'Cargos selecionados';
  @Input() description = '';
  @Input() showBotEditability = false;
  @Input() selectedStateLabel = 'Selecionado';
  @Input() showPersistenceState = false;
  @Output() addRole = new EventEmitter<string>();
  @Output() removeRole = new EventEmitter<string>();

  get selectedRoles(): GuildRole[] { return this.orderedRoles.filter(role => this.selectedRoleIds.includes(role.id)); }
  get availableRoles(): GuildRole[] { return this.orderedRoles.filter(role => !this.selectedRoleIds.includes(role.id)); }
  get orderedRoles(): GuildRole[] { return [...this.roles].sort((first, second) => second.position - first.position); }
  roleState(role: GuildRole): string { return this.showPersistenceState ? (this.persistedRoleIds.includes(role.id) ? 'Salvo' : 'Não salvo') : this.selectedStateLabel; }

  select(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) return;
    this.addRole.emit(id);
    (event.target as HTMLSelectElement).value = '';
  }
}
