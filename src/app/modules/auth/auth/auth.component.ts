import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { ApiErrorResponse } from '../../../shared/models/api/errors/error';
import { getSocialAuthErrorMessage } from '../../../shared/utils/social-auth-error-message';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.component.html',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: './auth.component.scss'
})
export class AuthComponent implements OnInit {
  errorMessage = '';

  constructor(
    private userService: UserService,
    private router: Router
  ) { }

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
      this.router.navigate(['/social-register'], {
        queryParams: {
          registrationToken,
          email: params.get('email'),
          displayName: params.get('display_name') ?? params.get('name'),
          provider: params.get('provider'),
          returnUrl
        }
      });
      return;
    }

    this.userService.completeSocialLoginFromCallback(params).subscribe({
      next: () => this.router.navigateByUrl(returnUrl),
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
