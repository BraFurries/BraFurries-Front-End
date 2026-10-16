import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomePageComponent } from './pages/home-page/home-page.component';
import { SobreNosComponent } from './pages/sobre-nos/sobre-nos.component';
import { TOSComponent } from './pages/tos/tos.component';
import { PrivacidadeComponent } from './pages/privacidade/privacidade.component';
import { ContestacaoComponent } from './pages/contestacao/contestacao.component';
import { RegrasComponent } from './pages/regras/regras.component';
import { EventTransferInviteComponent } from './pages/event-transfer-invite/event-transfer-invite.component';
import { ComunidadeComponent } from './pages/comunidade/comunidade.component';
import { CoddyComponent } from './pages/coddy/coddy.component';

const routes: Routes = [
  {
    path: '',
    // component: LayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: HomePageComponent
      },
      {
        path: 'sobre',
        component: SobreNosComponent
      },
      { path: 'sobre-nos', pathMatch: 'full', redirectTo: 'sobre' },
      { path: 'comunidade', component: ComunidadeComponent },
      { path: 'coddy', pathMatch: 'full', component: CoddyComponent },
      { path: 'coddy/docs', loadChildren: () => import('./pages/documentacao/documentacao-page.module').then(m => m.DocumentacaoPageModule) },
      {
        path: 'tos',
        component: TOSComponent
      },
      {
        path: 'privacidade',
        component: PrivacidadeComponent
      },
      {
        path: 'contestacao',
        component: ContestacaoComponent
      },
      {
        path: 'regras',
        component: RegrasComponent
      },
      { path: 'documentacao', pathMatch: 'full', redirectTo: 'coddy/docs' },
      {
        path: 'convite/transferir-evento/:token',
        component: EventTransferInviteComponent
      }
      
    ]
  },
  
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HomeRoutingModule { }
