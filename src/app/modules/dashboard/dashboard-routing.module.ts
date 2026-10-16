import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BaseLayoutDashboardComponent } from '../../core/components/dashboard/base-layout-dashboard/base-layout-dashboard.component';
import { InicioComponent } from './inicio/inicio.component';
import { PerfilComponent } from './perfil/perfil.component';
import { ServidoresComponent } from './servidores/servidores.component';
import { EquipesComponent } from './equipes/equipes.component';
import { MembrosComponent } from './membros/membros.component';
import { CommunityAccessComponent } from './community-access/community-access.component';
import { CommunitiesComponent } from './communities/communities.component';
import { CommunityActivityComponent } from './community-activity/community-activity.component';
import { CommunityContextLayoutComponent } from './community-context/community-context-layout.component';

const routes: Routes = [
  {
    path: '',
    component: BaseLayoutDashboardComponent,
    children: [
      { path: '', component: InicioComponent },
      { path: 'perfil', component: PerfilComponent },
      { path: 'comunidades', component: CommunitiesComponent },
      {
        path: 'comunidades/:communityId',
        component: CommunityContextLayoutComponent,
        children: [
          { path: 'membros', component: MembrosComponent, data: { communityFeature: 'membros' } },
          { path: 'times', component: EquipesComponent, data: { communityFeature: 'times' } },
          { path: 'acessos', component: CommunityAccessComponent, data: { communityFeature: 'acessos' } },
          { path: 'atividade', component: CommunityActivityComponent, data: { communityFeature: 'atividade' } },
          { path: 'coddy', component: ServidoresComponent, data: { communityFeature: 'coddy' } },
          { path: 'coddy/:guildId', component: ServidoresComponent, data: { communityFeature: 'coddy' } },
          { path: 'coddy/:guildId/:section', component: ServidoresComponent, data: { communityFeature: 'coddy' } }
        ]
      },
      {
        path: 'eventos',
        loadChildren: () => import('./eventos/eventos.module').then(m => m.EventosModule)
      },
      {
        path: 'admin',
        loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule)
      },
      {
        path: '**',
        redirectTo: '',
      },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardRoutingModule { }
