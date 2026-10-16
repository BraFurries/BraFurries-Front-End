import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './admin.component';
import { AdminAnnouncementsComponent } from './pages/avisos/avisos.component';
import { AdminBotComponent } from './pages/bot-coddy/bot-coddy.component';
import { AdminBotDetailsComponent } from './pages/bot-coddy-details/bot-coddy-details.component';
import { AdminMetricsComponent } from './pages/metricas/metricas.component';
import { AdminPartnersComponent } from './pages/parceiros/parceiros.component';
import { EditarParceiroComponent } from './pages/parceiros/editar/editar-parceiro.component';
import { NovoParceiroComponent } from './pages/parceiros/novo/novo-parceiro.component';
import { AdminUsersComponent } from './pages/usuarios/usuarios.component';
import { AdminUserProfileComponent } from './pages/usuarios/perfil/perfil-usuario.component';
import { AdminOverviewComponent } from './pages/visao-geral/visao-geral.component';

const routes: Routes = [
  {
    path: '',
    component: AdminComponent,
    children: [
      { path: '', redirectTo: 'visao-geral', pathMatch: 'full' },
      { path: 'visao-geral', component: AdminOverviewComponent },
      { path: 'usuarios', component: AdminUsersComponent },
      { path: 'usuarios/:id', component: AdminUserProfileComponent },
      { path: 'parceiros/novo', component: NovoParceiroComponent },
      { path: 'parceiros/:id/editar', component: EditarParceiroComponent },
      { path: 'parceiros', component: AdminPartnersComponent, pathMatch: 'full' },
      { path: 'bot-coddy', component: AdminBotComponent },
      { path: 'bot-coddy/detalhes', component: AdminBotDetailsComponent },
      { path: 'metricas', component: AdminMetricsComponent },
      { path: 'avisos', component: AdminAnnouncementsComponent }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
