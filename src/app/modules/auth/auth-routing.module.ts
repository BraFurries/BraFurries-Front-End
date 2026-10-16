import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthRoutePath } from './auth-route-paths';

export const authRoutes: Routes = [
  {
    path: 'login' satisfies AuthRoutePath,
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'social-login' satisfies AuthRoutePath,
    loadComponent: () => import('./auth/auth.component').then((m) => m.AuthComponent)
  },
  {
    path: 'social-register' satisfies AuthRoutePath,
    loadComponent: () => import('./social-register/social-register.component').then((m) => m.SocialRegisterComponent)
  },
  {
    path: 'register' satisfies AuthRoutePath,
    loadComponent: () => import('./register/register.component').then((m) => m.RegisterComponent)
  },
  {
    path: 'confirm-email' satisfies AuthRoutePath,
    loadComponent: () => import('./confirm-email/confirm-email.component').then((m) => m.ConfirmEmailComponent)
  },
  {
    path: 'forgot-password' satisfies AuthRoutePath,
    loadComponent: () => import('./forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password' satisfies AuthRoutePath,
    loadComponent: () => import('./reset-password/reset-password.component').then((m) => m.ResetPasswordComponent)
  }
];

@NgModule({
  imports: [RouterModule.forChild(authRoutes)],
  exports: [RouterModule]
})
export class AuthRoutingModule { }
