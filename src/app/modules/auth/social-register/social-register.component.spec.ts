import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { SeoService } from '../../../core/services/seo-service.service';
import { SocialRegisterComponent } from './social-register.component';

describe('SocialRegisterComponent — e-mail BraFurries independente', () => {
  let users: jasmine.SpyObj<UserService>;
  let seo: jasmine.SpyObj<SeoService>;

  beforeEach(() => {
    sessionStorage.setItem('pending_social_registration_token', 'one-use-oauth-proof');
    users = jasmine.createSpyObj<UserService>(
      'UserService', ['previewSocialRegistration', 'completeSocialRegistration']);
    seo = jasmine.createSpyObj<SeoService>('SeoService', ['updateMetaTags']);
  });

  afterEach(() => {
    sessionStorage.removeItem('pending_social_registration_token');
  });

  function setup(suggestedEmail: string | null = 'provider@gmail.com'): SocialRegisterComponent {
    users.previewSocialRegistration.and.returnValue(of({
      provider: 'google', suggestedEmail, displayName: 'Dragon'
    }));
    return new SocialRegisterComponent(
      users, {} as Router, {} as ActivatedRoute, seo);
  }

  it('suggests the provider e-mail but lets the user choose another', () => {
    const page = setup();
    expect(users.previewSocialRegistration).toHaveBeenCalledOnceWith('one-use-oauth-proof');
    expect(page.registerForm.get('email')?.value).toBe('provider@gmail.com');
    page.registerForm.get('email')?.setValue('chosen@example.com');
    expect(page.registerForm.get('email')?.value).toBe('chosen@example.com');
  });

  it('can onboard Discord identify-only without an email suggestion', () => {
    const page = setup(null);
    expect(page.suggestedEmail).toBe('');
    expect(page.registerForm.get('email')?.value).toBe('');
  });

  it('requires both local password fields and terms before submitting', () => {
    const page = setup();
    page.registerForm.patchValue({
      email: 'chosen@example.com', password: 'securepassword',
      passwordConfirmation: 'different', termsAgreement: true
    });
    page.completeRegistration();
    expect(page.errorMessage).toContain('não são iguais');
    expect(users.completeSocialRegistration).not.toHaveBeenCalled();
  });

  it('completes registration without storing any authenticated session', () => {
    const page = setup();
    page.registerForm.setValue({
      displayName: 'Dragon', email: 'chosen@example.com',
      password: 'securepassword', passwordConfirmation: 'securepassword',
      termsAgreement: true
    });
    users.completeSocialRegistration.and.returnValue(of({
      id: 42, email: 'chosen@example.com', message: 'Verify email'
    }));
    page.completeRegistration();
    expect(users.completeSocialRegistration).toHaveBeenCalledOnceWith(
      'one-use-oauth-proof', 'Dragon', 'chosen@example.com',
      'securepassword', 'securepassword', true
    );
    expect(page.completed).toBeTrue();
    expect(page.submittedEmail).toBe('chosen@example.com');
    expect(sessionStorage.getItem('pending_social_registration_token')).toBeNull();
  });

  it('refuses to submit after the one-use proof has expired', () => {
    users.previewSocialRegistration.and.returnValue(
      throwError(() => new Error('expired proof')));
    const page = new SocialRegisterComponent(
      users, {} as Router, {} as ActivatedRoute, seo);
    expect(page.registrationToken).toBe('');
    expect(page.errorMessage).toContain('expirou');
    page.completeRegistration();
    expect(users.completeSocialRegistration).not.toHaveBeenCalled();
  });
});
