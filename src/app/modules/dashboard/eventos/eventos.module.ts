import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { EventosRoutingModule } from './eventos-routing.module';
import { GeralComponent } from './geral/geral.component';
import { UnicoComponent } from './unico/unico.component';
import { GerenciamentoComponent } from './gerenciamento/gerenciamento.component';
import { FormComponent } from './form/form.component';
import { SharedModule } from '../../../shared/shared.module';
import { EventAvailabilityDialogComponent } from './form/event-availability-dialog/event-availability-dialog.component';

@NgModule({
  declarations: [
    GeralComponent,
    UnicoComponent,
    GerenciamentoComponent,
    FormComponent,
    EventAvailabilityDialogComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    EventosRoutingModule
  ]
})
export class EventosModule { }
