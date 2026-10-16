import { Component, EventEmitter, Input, Output } from '@angular/core';

export type OperationModalState = 'confirmation' | 'success' | 'error' | 'cancelled';

@Component({ selector: 'app-operation-modal', standalone: false, templateUrl: './operation-modal.component.html', styleUrl: './operation-modal.component.scss' })
export class OperationModalComponent {
  @Input({ required: true }) state: OperationModalState = 'confirmation';
  @Input({ required: true }) title = '';
  @Input({ required: true }) message = '';
  @Input() details: string[] = [];
  @Input() busy = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
}
