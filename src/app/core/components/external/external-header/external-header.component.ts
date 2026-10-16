import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-external-header',
  standalone: false,
  templateUrl: './external-header.component.html',
  styleUrl: './external-header.component.scss'
})
export class ExternalHeaderComponent {
  @Input() isHome: boolean = false;
}
