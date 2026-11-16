import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type LoginStatus = 'authenticating' | 'success';

@Component({
  selector: 'app-login-status-overlay',
  standalone: true,
  templateUrl: './login-status-overlay.component.html',
  styleUrl: './login-status-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginStatusOverlayComponent {
  @Input() state: LoginStatus = 'authenticating';
}
