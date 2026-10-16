import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { InputWrapperComponent } from './input-wrapper/input-wrapper.component';


@NgModule({
  declarations: [
    InputWrapperComponent
  ],
  imports: [
    CommonModule,
    SharedModule
  ], 
  exports: [
    InputWrapperComponent
  ]
})
export class WidgetsModule { }
