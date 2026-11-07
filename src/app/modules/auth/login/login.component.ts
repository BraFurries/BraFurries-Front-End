import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { SocialAuthProvider, UserService } from '../../../core/services/user.service';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorResponse } from '../../../shared/models/api/errors/error';
import { getSocialAuthErrorMessage } from '../../../shared/utils/social-auth-error-message';
import { SeoService } from '../../../core/services/seo-service.service';
import { SharedModule } from '../../../shared/shared.module';
import { WidgetsModule } from '../../../widgets/widgets.module';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  standalone: true,
  imports: [CommonModule, SharedModule, WidgetsModule],
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnDestroy {
  loginForm: FormGroup;
  isSubmitting = false;
  isLoggingIn = false;
  errorMessage = '';
  pendingEmailConfirmation = false;
  confirmationResent = false;
  private errorTimeout: any;

  returnUrl: string = '/painel';
  accountConsolidated = false;
  private readonly authReturnUrls = new Set([
    '/login',
    '/social-login',
    '/social-register',
    '/register',
    '/confirm-email',
    '/forgot-password',
    '/reset-password'
  ]);

  constructor(
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private seoService: SeoService
  ) {
    this.seoService.updateMetaTags(
      'Login - BraFurries',
      'Entre na sua conta BraFurries para acessar o painel, gerenciar seu perfil e acompanhar recursos da comunidade.'
    );
    this.returnUrl = this.getSafeReturnUrl(this.route.snapshot.queryParams['returnUrl']);
    this.accountConsolidated = this.userService.consumeAccountConsolidationNotice();

    this.loginForm = new FormGroup({
      email: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required]),
      rememberMe: new FormControl(false)
    });
  }

  ngOnDestroy(): void {
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
    }
  }

  private showError(message: string): void {
    this.errorMessage = message;
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
    }
    this.errorTimeout = setTimeout(() => {
      this.errorMessage = '';
    }, 5000);
  }

  private getSafeReturnUrl(returnUrl: unknown): string {
    if (typeof returnUrl !== 'string' || !returnUrl.startsWith('/') || returnUrl.startsWith('//')) {
      return '/painel';
    }

    const path = returnUrl.split('?')[0].split('#')[0];
    return this.authReturnUrls.has(path) ? '/painel' : returnUrl;
  }

  login(): void {
    if (this.loginForm.invalid || this.isSubmitting) {
      this.loginForm.markAllAsTouched();
      this.showError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.pendingEmailConfirmation = false;
    this.confirmationResent = false;
    if (this.errorTimeout) clearTimeout(this.errorTimeout);

    const { email, password, rememberMe } = this.loginForm.value;

    this.userService.login(email, password, Boolean(rememberMe)).subscribe({
      next: () => {
        this.isLoggingIn = true;
        setTimeout(() => {
          this.isSubmitting = false;
          this.router.navigateByUrl(this.returnUrl);
        }, 1500);
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        const apiError = err.error as ApiErrorResponse;

        if (err.status === 401 && apiError?.message === 'Confirme seu e-mail antes de acessar a conta') {
          this.pendingEmailConfirmation = true;
          this.showError('Confirme seu e-mail antes de acessar a conta. Você pode solicitar um novo link.');
        }
        else if (apiError?.details && Object.keys(apiError.details).length > 0) {
          const firstErrorKey = Object.keys(apiError.details)[0];
          this.showError(apiError.details[firstErrorKey]);
        }
        else if (apiError?.message) {
          this.showError(getSocialAuthErrorMessage(apiError.message) || apiError.message);
        }
        else {
          this.showError('Usuário ou senha inválidos.');
        }
      }
    });
  }

  resendConfirmation(): void {
    if (!this.pendingEmailConfirmation || this.isSubmitting) return;
    const { email, password } = this.loginForm.getRawValue();
    if (!email || !password) return;
    this.isSubmitting = true;
    this.userService.resendEmailConfirmation(email, password).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.confirmationResent = true;
        this.showError('Se o cadastro estiver pendente, uma nova confirmação será enviada ao seu e-mail.');
      },
      error: () => {
        this.isSubmitting = false;
        this.showError('Não foi possível solicitar a confirmação. Tente novamente mais tarde.');
      }
    });
  }

  socialLogin(provider: SocialAuthProvider): void {
    if (this.isSubmitting) {
      return;
    }

    this.errorMessage = '';
    if (this.errorTimeout) clearTimeout(this.errorTimeout);
    this.userService.startSocialLogin(provider, this.returnUrl);
  }

}
