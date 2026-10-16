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
  errorMessage = '';
  registrationToken = '';
  email = '';
  provider = '';
  returnUrl = '/painel';

  constructor(
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private seoService: SeoService
  ) {
    this.seoService.updateMetaTags(
      'Completar cadastro - BraFurries',
      'Complete seu cadastro BraFurries usando sua conta social.'
    );

    this.registrationToken = this.route.snapshot.queryParams['registrationToken'] || '';
    this.email = this.route.snapshot.queryParams['email'] || '';
    this.provider = this.route.snapshot.queryParams['provider'] || '';
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/painel';

    this.registerForm = new FormGroup({
      displayName: new FormControl(this.route.snapshot.queryParams['displayName'] || '', [Validators.required]),
      termsAgreement: new FormControl(false, [Validators.requiredTrue])
    });
  }

  completeRegistration(): void {
    if (!this.registrationToken) {
      this.errorMessage = 'Sessao de cadastro social invalida. Inicie o login novamente.';
      return;
    }

    if (this.registerForm.invalid || this.isSubmitting) {
      this.registerForm.markAllAsTouched();
      this.errorMessage = 'Informe como quer ser chamado e aceite os termos para continuar.';
      return;
    }

    const { displayName, termsAgreement } = this.registerForm.getRawValue();
    this.isSubmitting = true;
    this.errorMessage = '';

    this.userService.completeSocialRegistration(this.registrationToken, displayName, termsAgreement).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl),
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        const apiError = err.error as ApiErrorResponse;

        if (apiError?.details && Object.keys(apiError.details).length > 0) {
          const firstErrorKey = Object.keys(apiError.details)[0];
          const detailMessage = apiError.details[firstErrorKey];
          this.errorMessage = getSocialAuthErrorMessage(detailMessage) ?? detailMessage;
        } else if (apiError?.message) {
          this.errorMessage = getSocialAuthErrorMessage(apiError.message) ?? apiError.message;
        } else {
          this.errorMessage = 'Nao foi possivel concluir o cadastro social.';
        }
      }
    });
  }
}
