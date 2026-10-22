import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BaseLayoutDashboardComponent } from '../../core/components/dashboard/base-layout-dashboard/base-layout-dashboard.component';
import { DashboardRoutingModule } from './dashboard-routing.module';
import { InicioComponent } from './inicio/inicio.component';
import { PerfilComponent } from './perfil/perfil.component';
import { ServidoresComponent } from './servidores/servidores.component';
import { XpLevelingPanelComponent } from './servidores/xp-leveling-panel.component';
import { AiConfigurationPanelComponent } from './servidores/ai-configuration-panel.component';
import { VipConfigurationPanelComponent } from './servidores/vip-configuration-panel.component';
import { BackupManagementPanelComponent } from './servidores/backup-management-panel.component';
import { ThemeManagementPanelComponent } from './servidores/theme-management-panel.component';
import { RoleSelectionComponent } from './servidores/role-selection.component';
import { OperationModalComponent } from './servidores/operation-modal.component';
import { EquipesComponent } from './equipes/equipes.component';
import { TeamOrgChartComponent } from './equipes/team-org-chart/team-org-chart.component';
import { MembrosComponent } from './membros/membros.component';
import { CommunityAccessComponent } from './community-access/community-access.component';
import { CommunitiesComponent } from './communities/communities.component';
import { CommunityActivityComponent } from './community-activity/community-activity.component';
import { CommunityContextLayoutComponent } from './community-context/community-context-layout.component';
import { RecrutamentoComponent } from './recrutamento/recrutamento.component';

@NgModule({
  declarations: [
    BaseLayoutDashboardComponent,
    InicioComponent,
    PerfilComponent,
    ServidoresComponent,
    XpLevelingPanelComponent,
    AiConfigurationPanelComponent,
    VipConfigurationPanelComponent,
    BackupManagementPanelComponent,
    ThemeManagementPanelComponent,
    RoleSelectionComponent,
    OperationModalComponent,
    EquipesComponent,
    TeamOrgChartComponent,
    MembrosComponent,
    CommunityAccessComponent,
    CommunityActivityComponent,
    CommunityContextLayoutComponent,
    RecrutamentoComponent,
    CommunitiesComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    DashboardRoutingModule
  ]
})
export class DashboardModule { }
