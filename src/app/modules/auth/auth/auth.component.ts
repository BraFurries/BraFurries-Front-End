import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { ApiErrorResponse } from '../../../shared/models/api/errors/error';
import { getSocialAuthErrorMessage } from '../../../shared/utils/social-auth-error-message';
import { LoginStatus, LoginStatusOverlayComponent } from '../components/login-status-overlay/login-status-overlay.component';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.component.html',
  standalone: true,
  imports: [CommonModule, RouterModule, LoginStatusOverlayComponent],
  styleUrl: './auth.component.scss'
})
export class AuthComponent implements OnInit, OnDestroy {
  errorMessage = '';
  loginState: LoginStatus = 'authenticating';
  private successTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private userService: UserService,
    private router: Router
  ) { }

  ngOnDestroy(): void {
    if (this.successTimeout) clearTimeout(this.successTimeout);
  }

  ngOnInit(): void {
    const params = this.getCallbackParams();
    const callbackError = params.get('error');

    if (callbackError) {
      this.errorMessage = getSocialAuthErrorMessage(params.get('error_description') || callbackError)
        ?? 'Nao foi possivel autenticar com o provedor selecionado.';
      return;
    }

    const returnUrl = this.userService.getSocialLoginReturnUrl(params.get('state'));
    const registrationToken = params.get('registration_token');
    const requiresRegistration = params.get('requires_registration') === 'true';

    if (registrationToken || requiresRegistration) {
      if (!registrationToken) {
        this.errorMessage = 'A comprovação OAuth expirou. Inicie novamente o cadastro.';
        return;
      }
      // Do not leak OAuth onboarding proof or provider e-mail through URL
      // query params, analytics, browser history or referrers.
      sessionStorage.setItem('pending_social_registration_token', registrationToken);
      window.history.replaceState(null, '', window.location.pathname);
      this.router.navigate(['/social-register']);
      return;
    }

    this.userService.completeSocialLoginFromCallback(params).subscribe({
      next: () => {
        this.loginState = 'success';
        this.successTimeout = setTimeout(() => this.router.navigateByUrl(returnUrl), 1500);
      },
      error: (err: HttpErrorResponse | Error) => {
        const apiError = 'error' in err ? err.error as ApiErrorResponse : null;

        const mappedMessage = getSocialAuthErrorMessage(apiError?.message);

        if (mappedMessage) {
          this.errorMessage = mappedMessage;
          return;
        }

        this.errorMessage = 'Nao foi possivel concluir o login social. Tente novamente.';
      }
    });
  }

  private getCallbackParams(): URLSearchParams {
    const params = new URLSearchParams(window.location.search);
    const fragment = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const fragmentParams = new URLSearchParams(fragment);

    fragmentParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });

    return params;
  }

}
