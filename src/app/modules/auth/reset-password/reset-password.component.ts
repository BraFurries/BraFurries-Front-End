import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorResponse } from '../../../shared/models/api/errors/error';
import { SharedModule } from '../../../shared/shared.module';
import { WidgetsModule } from '../../../widgets/widgets.module';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  standalone: true,
  imports: [CommonModule, SharedModule, WidgetsModule]
})
export class ResetPasswordComponent implements OnInit {
  resetForm: FormGroup;
  token: string | null = null;
  isSubmitting = false;
  isSuccess = false;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) {
    this.resetForm = new FormGroup({
      password: new FormControl('', [Validators.required]),
      passwordConfirmation: new FormControl('', [Validators.required])
    });
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.errorMessage = 'Token inválido ou não fornecido na URL.';
    }
  }

  submit(): void {
    if (!this.token) return;

    if (this.resetForm.invalid || this.isSubmitting) {
      this.resetForm.markAllAsTouched();
      this.errorMessage = 'Por favor, preencha todos os campos.';
      return;
    }

    const { password, passwordConfirmation } = this.resetForm.value;

    if (password !== passwordConfirmation) {
      this.errorMessage = 'As senhas não coincidem.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    this.userService.resetPassword(this.token, password).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.isSuccess = true;
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 5000);
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        const apiError = err.error as ApiErrorResponse;
        if (apiError?.message) {
          this.errorMessage = apiError.message;
        } else {
          this.errorMessage = 'Ocorreu um erro ao tentar redefinir a senha. O token pode ter expirado.';
        }
      }
    });
  }
}
