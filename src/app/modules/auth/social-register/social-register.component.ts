import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { ApiErrorResponse } from '../../../shared/models/api/errors/error';
import { SeoService } from '../../../core/services/seo-service.service';
import { getSocialAuthErrorMessage } from '../../../shared/utils/social-auth-error-message';
import { SharedModule } from '../../../shared/shared.module';
import { WidgetsModule } from '../../../widgets/widgets.module';

@Component({
  selector: 'app-social-register',
  standalone: true,
  imports: [CommonModule, SharedModule, WidgetsModule],
  templateUrl: './social-register.component.html',
  styleUrl: './social-register.component.scss'
})
export class SocialRegisterComponent {
  registerForm: FormGroup;
  isSubmitting = false;
  isLoadingSuggestion = true;
  completed = false;
  submittedEmail = '';
  errorMessage = '';
  registrationToken = '';
  suggestedEmail = '';
  provider = '';

  constructor(
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private seoService: SeoService
  ) {
    this.seoService.updateMetaTags(
      'Completar cadastro - BraFurries',
      'Escolha seu e-mail e senha BraFurries independentemente da conta social.'
    );

    this.registrationToken = sessionStorage.getItem('pending_social_registration_token') || '';
    this.registerForm = new FormGroup({
      displayName: new FormControl('', [Validators.required, Validators.maxLength(32)]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required, Validators.minLength(8)]),
      passwordConfirmation: new FormControl('', [Validators.required]),
      termsAgreement: new FormControl(false, [Validators.requiredTrue])
    });

    if (!this.registrationToken) {
      this.isLoadingSuggestion = false;
      this.errorMessage = 'Sua sessão de cadastro expirou. Inicie o login social novamente.';
      return;
    }

    this.userService.previewSocialRegistration(this.registrationToken).subscribe({
      next: preview => {
        this.isLoadingSuggestion = false;
        this.provider = preview.provider;
        this.suggestedEmail = preview.suggestedEmail || '';
        // User can replace provider-suggested e-mail freely.
        if (this.suggestedEmail) this.registerForm.patchValue({ email: this.suggestedEmail });
        if (preview.displayName) this.registerForm.patchValue({ displayName: preview.displayName });
      },
      error: () => {
        this.isLoadingSuggestion = false;
        this.registrationToken = '';
        sessionStorage.removeItem('pending_social_registration_token');
        this.errorMessage = 'A comprovação de identidade expirou. Faça login pelo provedor novamente.';
      }
    });
  }

  completeRegistration(): void {
    if (!this.registrationToken || this.isLoadingSuggestion) {
      this.errorMessage = 'Comprove sua identidade pelo provedor antes de continuar.';
      return;
    }

    if (this.registerForm.invalid || this.isSubmitting) {
      this.registerForm.markAllAsTouched();
      this.errorMessage = 'Informe um e-mail válido, senha de pelo menos 8 caracteres e aceite os termos.';
      return;
    }

    const { displayName, email, password, passwordConfirmation, termsAgreement } =
      this.registerForm.getRawValue();
    if (password !== passwordConfirmation) {
      this.errorMessage = 'As senhas informadas não são iguais.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    this.userService.completeSocialRegistration(
      this.registrationToken, displayName, email, password, passwordConfirmation, termsAgreement
    ).subscribe({
      next: response => {
        this.isSubmitting = false;
        this.completed = true;
        this.submittedEmail = response.email;
        this.registrationToken = '';
        sessionStorage.removeItem('pending_social_registration_token');
        this.registerForm.reset();
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        const apiError = err.error as ApiErrorResponse;
        const message = apiError?.details && Object.keys(apiError.details).length > 0
          ? apiError.details[Object.keys(apiError.details)[0]]
          : apiError?.message;
        this.errorMessage = getSocialAuthErrorMessage(message)
          || (err.status === 409
            ? 'Esse e-mail já está associado a uma conta. Recupere o acesso ou escolha outro e-mail.'
            : 'Não foi possível concluir o cadastro. Confira os dados e tente novamente.');
      }
    });
  }
}
