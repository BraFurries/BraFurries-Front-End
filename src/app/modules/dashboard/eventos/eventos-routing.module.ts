import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GeralComponent } from './geral/geral.component';
import { UnicoComponent } from './unico/unico.component';
import { GerenciamentoComponent } from './gerenciamento/gerenciamento.component';
import { isNumericGuard } from '../../../core/guards/is-numeric.guard';
import { FormComponent } from './form/form.component';

const routes: Routes = [
  {path: '', component: GeralComponent},
  {path: 'gerenciar', component: GerenciamentoComponent},
  {path: 'novo', component: FormComponent},
  {path: ':id/editar', component: FormComponent, canMatch: [isNumericGuard]},
  {path: ':id', component: UnicoComponent, canMatch: [isNumericGuard]},
  {path: '**', redirectTo: ''}
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class EventosRoutingModule { }
