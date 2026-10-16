import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SocialAuthProvider, UserService } from '../../../core/services/user.service';
import { ApiErrorResponse } from '../../../shared/models/api/errors/error';
import { MatDialog } from '@angular/material/dialog';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { SeoService } from '../../../core/services/seo-service.service';
import { SharedModule } from '../../../shared/shared.module';
import { WidgetsModule } from '../../../widgets/widgets.module';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, SharedModule, WidgetsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnDestroy {
  registerForm: FormGroup;
  isSubmitting = false;
  errorMessage = '';
  private redirectTimeoutId?: ReturnType<typeof setTimeout>;

  constructor(
    private userService: UserService,
    private router: Router,
    private dialog: MatDialog,
    private seoService: SeoService
  ) {
    this.seoService.updateMetaTags(
      'Cadastro - BraFurries',
      'Crie sua conta na BraFurries para participar da comunidade, acessar recursos e acompanhar eventos furry no Brasil.'
    );
    this.registerForm = new FormGroup({
      displayName: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required]),
      passwordConfirmation: new FormControl('', [Validators.required]),
      termsAgreement: new FormControl(false, [Validators.requiredTrue])
    });
  }

  register(): void {
    if (this.registerForm.invalid || this.isSubmitting) {
      this.registerForm.markAllAsTouched();
      this.errorMessage = 'Por favor, preencha todos os campos obrigatorios.';
      return;
    }

    const { displayName, email, password, passwordConfirmation, termsAgreement } = this.registerForm.getRawValue();

    if (password !== passwordConfirmation) {
      this.errorMessage = 'As senhas informadas nao coincidem.';
      return;
    }

    if (!termsAgreement) {
      this.errorMessage = 'Voce deve concordar com os termos de uso para se registrar.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    this.userService.register(displayName, email, password, passwordConfirmation, termsAgreement).subscribe({
      next: () => {
        this.isSubmitting = false;
        const dialogRef = this.dialog.open(DialogComponent, {
          data: {
            title: 'Cadastro concluido',
            message: 'Enviamos um link de confirmacao para seu e-mail. Voce sera redirecionado para o login em 5 segundos.'
          }
        });

        this.redirectTimeoutId = setTimeout(() => {
          dialogRef.close();
          this.router.navigate(['/login']);
        }, 5000);
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        const apiError = err.error as ApiErrorResponse;

        if (apiError?.details && Object.keys(apiError.details).length > 0) {
          const firstErrorKey = Object.keys(apiError.details)[0];
          this.errorMessage = apiError.details[firstErrorKey];
        } else if (apiError?.message) {
          this.errorMessage = apiError.message;
        } else {
          this.errorMessage = 'Nao foi possivel concluir o cadastro.';
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (this.redirectTimeoutId) {
      clearTimeout(this.redirectTimeoutId);
    }
  }

  socialLogin(provider: SocialAuthProvider): void {
    if (this.isSubmitting) {
      return;
    }

    this.errorMessage = '';
    this.userService.startSocialLogin(provider, '/painel');
  }
}
