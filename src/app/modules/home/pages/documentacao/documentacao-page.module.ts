import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentacaoComponent } from './documentacao.component';
import { DocumentacaoPageRoutingModule } from './documentacao-page-routing.module';
import { SharedModule } from '../../../../shared/shared.module';

@NgModule({
  declarations: [DocumentacaoComponent],
  imports: [CommonModule, SharedModule, DocumentacaoPageRoutingModule],
})
export class DocumentacaoPageModule {}
