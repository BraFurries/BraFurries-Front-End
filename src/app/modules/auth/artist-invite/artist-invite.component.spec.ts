import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { CommerceArtistService } from '../../../core/services/commerce-artist.service';
import { UserService } from '../../../core/services/user.service';
import { SeoService } from '../../../core/services/seo-service.service';
import { ArtistInviteComponent } from './artist-invite.component';

describe('ArtistInviteComponent', () => {
  let fixture:ComponentFixture<ArtistInviteComponent>;
  let component:ArtistInviteComponent;
  let artists:jasmine.SpyObj<CommerceArtistService>;
  let users:jasmine.SpyObj<UserService>;
  const token='a'.repeat(64);

  beforeEach(async () => {
    artists=jasmine.createSpyObj<CommerceArtistService>(
      'CommerceArtistService',['activateInvitation','redeemInvitation']);
    users=jasmine.createSpyObj<UserService>('UserService',['getUser','logout']);
    users.getUser.and.returnValue(null);
    users.logout.and.returnValue(of(true));
    artists.activateInvitation.and.returnValue(of({
      status:'VERIFY_EMAIL',message:'Confirme o e-mail escolhido'
    }));
    artists.redeemInvitation.and.returnValue(of({
      status:'RELOGIN_REQUIRED',message:'Entre novamente'
    }));
    await TestBed.configureTestingModule({
      imports:[ArtistInviteComponent,RouterTestingModule],
      providers:[
        {provide:CommerceArtistService,useValue:artists},
        {provide:UserService,useValue:users},
        {provide:SeoService,useValue:{
          updateMetaTags:()=>undefined
        }},
        {provide:ActivatedRoute,useValue:{
          snapshot:{queryParamMap:{get:(key:string)=>key==='token'?token:null}}
        }}
      ]
    }).compileComponents();
    fixture=TestBed.createComponent(ArtistInviteComponent);
    component=fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(()=>fixture.destroy());

  it('never asks for an internal artist id or offers open claim discovery', () => {
    const html=fixture.nativeElement.textContent;
    expect(html).toContain('Código recebido separadamente');
    expect(html).not.toContain('ID do artista');
    expect(html).not.toContain('Esta arte é minha');
    expect(component.loginReturnUrl).toContain('/artist-invite?token=');
    expect(component.loginReturnUrl).not.toContain('confirmationCode');
  });

  it('activates a previously created artist account with local email verification', () => {
    component.confirmationCode='ABCD1234EF56';
    component.email='my-email@example.invalid';
    component.password='Password123';
    component.passwordConfirmation='Password123';
    component.termsAgreement=true;
    component.activate();
    expect(artists.activateInvitation).toHaveBeenCalledWith(
      token,'ABCD1234EF56','my-email@example.invalid',
      'Password123','Password123',true);
    expect(component.completed).toBeTrue();
    expect(component.password).toBe('');
    expect(component.confirmationCode).toBe('');
  });

  it('does not attempt a consolidation without a logged-in verified account', () => {
    component.mode='existing';
    component.confirmationCode='ABCD1234EF56';
    component.accountPassword='Password123';
    component.redeem();
    expect(artists.redeemInvitation).not.toHaveBeenCalled();
  });

  it('never puts the separate proof code in login links', () => {
    component.confirmationCode='ABCD1234EF56';
    expect(component.loginReturnUrl).not.toContain('ABCD1234EF56');
  });
});
