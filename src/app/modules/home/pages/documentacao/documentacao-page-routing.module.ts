import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DocumentacaoComponent } from './documentacao.component';

const routes: Routes = [
  {
    path: '',
    component: DocumentacaoComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DocumentacaoPageRoutingModule {}
