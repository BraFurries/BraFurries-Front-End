import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '../../shared/shared.module';
import { WidgetsModule } from '../../widgets/widgets.module';
import { HomeRoutingModule } from './home-routing.module';
import { HomePageComponent } from './pages/home-page/home-page.component';
import { SobreNosComponent } from './pages/sobre-nos/sobre-nos.component';
import { ExternalModule } from '../../core/components/external.module';
import { TOSComponent } from './pages/tos/tos.component';
import { PrivacidadeComponent } from './pages/privacidade/privacidade.component';
import { ContestacaoComponent } from './pages/contestacao/contestacao.component';
import { RegrasComponent } from './pages/regras/regras.component';
import { EventTransferInviteComponent } from './pages/event-transfer-invite/event-transfer-invite.component';
import { ComunidadeComponent } from './pages/comunidade/comunidade.component';
import { CoddyComponent } from './pages/coddy/coddy.component';


@NgModule({
  declarations: [
    HomePageComponent,
    SobreNosComponent,
    TOSComponent,
    PrivacidadeComponent,
    ContestacaoComponent,
    RegrasComponent,
    EventTransferInviteComponent,
    ComunidadeComponent,
    CoddyComponent
  ],
  imports: [
    CommonModule,
    HomeRoutingModule,
    SharedModule,
    WidgetsModule,
    ExternalModule
  ]
})
export class HomeModule { }
