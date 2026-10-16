import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ExternalFooterComponent } from './external/external-footer/external-footer.component';
import { ExternalHeaderComponent } from './external/external-header/external-header.component';



@NgModule({
  declarations: [
    ExternalFooterComponent,
    ExternalHeaderComponent
  ],
  imports: [
    CommonModule,
    RouterModule,
  ],
  exports: [
    ExternalFooterComponent,
    ExternalHeaderComponent
  ]
})
export class ExternalModule { }
