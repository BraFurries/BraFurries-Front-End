import { Component, Input } from '@angular/core';
import { AdminDiscordMemberState, AdminUserCommunityContext } from '../../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-user-community-context',
  standalone: false,
  templateUrl: './perfil-usuario-contexto.component.html',
  styleUrls: ['./perfil-usuario.component.scss']
})
export class AdminUserCommunityContextComponent {
  @Input({ required: true }) activeTab: string = 'contexto';
  @Input({ required: true }) context!: AdminUserCommunityContext;
  @Input() discordMember: AdminDiscordMemberState | null = null;
  @Input() discordMemberError = '';

  formatDate(value?: string | null): string {
    if (!value) return 'Não disponível';
    const civilDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (civilDate) return `${civilDate[3]}/${civilDate[2]}/${civilDate[1]}`;
    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  }

  presenceLabel(value?: boolean | null): string {
    return value === true ? 'Presente' : value === false ? 'Não está mais nesta comunidade' : 'Presença ainda não verificada';
  }

  booleanLabel(value?: boolean | null): string {
    return value === true ? 'Sim' : value === false ? 'Não' : 'Não verificado';
  }

  contextStateLabel(state: AdminUserCommunityContext['progression']['state']): string {
    return state === 'ambiguous' ? 'Dados legados ambíguos' : state === 'not_found' ? 'Sem registro' : 'Disponível';
  }
}
