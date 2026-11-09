import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CommerceArtistService } from '../../../core/services/commerce-artist.service';
import { UserService } from '../../../core/services/user.service';
import { SeoService } from '../../../core/services/seo-service.service';

/**
 * No public discovery of artwork/artist IDs. The only entry point is a
 * staff-issued URL and a confirmation code shared through another channel.
 */
@Component({
  selector:'app-artist-invite',
  standalone:true,
  imports:[CommonModule,FormsModule,RouterModule],
  templateUrl:'./artist-invite.component.html'
})
export class ArtistInviteComponent implements OnDestroy {
  private readonly destroy$=new Subject<void>();
  readonly token: string;
  mode: 'existing' | 'new';
  confirmationCode='';
  accountPassword='';
  email='';
  password='';
  passwordConfirmation='';
  termsAgreement=false;
  submitting=false;
  completed=false;
  responseMessage='';
  errorMessage='';

  constructor(
    private readonly artists: CommerceArtistService,
    private readonly users: UserService,
    private readonly router: Router,
    route: ActivatedRoute,
    seo: SeoService
  ) {
    this.token=route.snapshot.queryParamMap.get('token') || '';
    this.mode=users.getUser()?'existing':'new';
    seo.updateMetaTags('Convite de artista - BraFurries',
      'Ative sua conta de artista por um convite seguro da BraFurries.');
  }

  get loggedIn(): boolean { return this.users.getUser() !== null; }

  get loginReturnUrl(): string {
    return '/artist-invite?token='+encodeURIComponent(this.token);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  activate(): void {
    if(this.submitting || this.completed || !this.token ||
       !/^[0-9a-fA-F]{12}$/.test(this.confirmationCode.trim()) ||
       !this.email.trim() || this.password.length<8 ||
       this.password!==this.passwordConfirmation || !this.termsAgreement) {
      this.errorMessage='Confira o código, o e-mail, as senhas e o aceite dos termos.';
      return;
    }
    this.submitting=true;
    this.errorMessage='';
    this.artists.activateInvitation(
      this.token,this.confirmationCode.trim().toUpperCase(),
      this.email.trim(),this.password,this.passwordConfirmation,this.termsAgreement
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.submitting=false;
        this.completed=true;
        this.responseMessage=result.message;
        this.password='';
        this.passwordConfirmation='';
        this.confirmationCode='';
      },
      error: err => {
        this.submitting=false;
        this.password='';
        this.passwordConfirmation='';
        this.errorMessage=err?.status===409
          ? 'Este cadastro já tem conta ou precisa de conciliação. Entre na sua conta ou procure a equipe.'
          : 'Não foi possível validar o convite. Confira o código e a validade com a equipe.';
      }
    });
  }

  redeem(): void {
    if(this.submitting || this.completed || !this.loggedIn || !this.token ||
       !/^[0-9a-fA-F]{12}$/.test(this.confirmationCode.trim()) ||
       !this.accountPassword) {
      this.errorMessage='Entre na sua conta e informe o código e sua senha BraFurries.';
      return;
    }
    this.submitting=true;
    this.errorMessage='';
    this.artists.redeemInvitation(
      this.token,this.confirmationCode.trim().toUpperCase(),this.accountPassword
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.submitting=false;
        this.completed=true;
        this.responseMessage=result.message;
        this.accountPassword='';
        this.confirmationCode='';
        // Redemption rotates auth_version and invalidates refresh tokens.
        // Drop the now-stale session before navigating to a new login.
        this.users.logout().pipe(takeUntil(this.destroy$)).subscribe({
          next:()=>this.router.navigate(['/login'],
            {queryParams:{returnUrl:'/painel/minhas-artes'}}),
          error:()=>this.router.navigate(['/login'],
            {queryParams:{returnUrl:'/painel/minhas-artes'}})
        });
      },
      error:err => {
        this.submitting=false;
        this.accountPassword='';
        this.errorMessage=err?.status===409
          ? 'As contas têm informações conflitantes ou o cadastro já foi consolidado. Procure a equipe.'
          : 'Convite, código ou senha inválidos. Confira os dados com a equipe.';
      }
    });
  }

  changeAccount(): void {
    this.users.logout().pipe(takeUntil(this.destroy$)).subscribe({
      next:()=>this.router.navigate(['/login'],
        {queryParams:{returnUrl:this.loginReturnUrl}}),
      error:()=>this.router.navigate(['/login'],
        {queryParams:{returnUrl:this.loginReturnUrl}})
    });
  }
}
