import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { HttpErrorResponse } from '@angular/common/http';
import { SharedModule } from '../../../shared/shared.module';
import { WidgetsModule } from '../../../widgets/widgets.module';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  standalone: true,
  imports: [CommonModule, SharedModule, WidgetsModule]
})
export class ForgotPasswordComponent {
  forgotForm: FormGroup;
  isSubmitting = false;
  isSuccess = false;
  errorMessage = '';

  constructor(private userService: UserService) {
    this.forgotForm = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email])
    });
  }

  submit(): void {
    if (this.forgotForm.invalid || this.isSubmitting) {
      this.forgotForm.markAllAsTouched();
      this.errorMessage = 'Por favor, informe um e-mail válido.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    const email = this.forgotForm.value.email;

    this.userService.forgotPassword(email).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.isSuccess = true;
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        // The API returns a generic message, but we handle any error genericly just in case.
        this.errorMessage = 'Ocorreu um erro ao tentar enviar o e-mail de recuperação.';
      }
    });
  }
}
