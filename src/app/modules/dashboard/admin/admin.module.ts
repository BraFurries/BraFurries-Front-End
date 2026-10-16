import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';

import { AdminComponent } from './admin.component';
import { AdminRoutingModule } from './admin-routing.module';
import { AdminAnnouncementsComponent } from './pages/avisos/avisos.component';
import { AdminBotComponent } from './pages/bot-coddy/bot-coddy.component';
import { AdminBotDetailsComponent } from './pages/bot-coddy-details/bot-coddy-details.component';
import { AdminMetricsComponent } from './pages/metricas/metricas.component';
import { AdminPartnersComponent } from './pages/parceiros/parceiros.component';
import { ParceiroFormComponent } from './pages/parceiros/components/parceiro-form/parceiro-form.component';
import { EditarParceiroComponent } from './pages/parceiros/editar/editar-parceiro.component';
import { NovoParceiroComponent } from './pages/parceiros/novo/novo-parceiro.component';
import { AdminUsersComponent } from './pages/usuarios/usuarios.component';
import { AdminUserProfileComponent } from './pages/usuarios/perfil/perfil-usuario.component';
import { AdminUserCommunityContextComponent } from './pages/usuarios/perfil/perfil-usuario-contexto.component';
import { AdminOverviewComponent } from './pages/visao-geral/visao-geral.component';

@NgModule({
  declarations: [
    AdminComponent,
    AdminOverviewComponent,
    AdminUsersComponent,
    AdminUserProfileComponent,
    AdminUserCommunityContextComponent,
    AdminPartnersComponent,
    ParceiroFormComponent,
    NovoParceiroComponent,
    EditarParceiroComponent,
    AdminBotComponent,
    AdminBotDetailsComponent,
    AdminMetricsComponent,
    AdminAnnouncementsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AdminRoutingModule
  ]
})
export class AdminModule { }
