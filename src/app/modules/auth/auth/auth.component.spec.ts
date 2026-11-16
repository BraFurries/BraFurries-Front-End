import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { AuthComponent } from './auth.component';

describe('AuthComponent social login callback', () => {
  let component: AuthComponent;
  let fixture: ComponentFixture<AuthComponent>;
  let userService: jasmine.SpyObj<UserService>;
  let router: Router;

  beforeEach(async () => {
    userService = jasmine.createSpyObj<UserService>('UserService', [
      'getSocialLoginReturnUrl',
      'completeSocialLoginFromCallback'
    ]);
    userService.getSocialLoginReturnUrl.and.returnValue('/painel');

    await TestBed.configureTestingModule({
      imports: [AuthComponent],
      providers: [provideRouter([]), { provide: UserService, useValue: userService }]
    }).compileComponents();

    fixture = TestBed.createComponent(AuthComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  });

  afterEach(() => sessionStorage.removeItem('pending_social_registration_token'));

  it('uses the shared animation during OAuth and after it succeeds', fakeAsync(() => {
    const response = new Subject<any>();
    userService.completeSocialLoginFromCallback.and.returnValue(response.asObservable());
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    spyOn<any>(component, 'getCallbackParams').and.returnValue(new URLSearchParams('code=test-code'));

    fixture.detectChanges();
    let overlay: HTMLElement = fixture.nativeElement.querySelector('app-login-status-overlay');
    expect(overlay.textContent).toContain('Autenticando...');
    expect(overlay.textContent).not.toContain('Acesso Liberado!');
    expect(navigate).not.toHaveBeenCalled();

    response.next({}); response.complete();
    fixture.detectChanges();
    overlay = fixture.nativeElement.querySelector('app-login-status-overlay');
    expect(overlay.textContent).toContain('Acesso Liberado!');
    expect(overlay.textContent).toContain('Preparando seu painel...');
    tick(1499);
    expect(navigate).not.toHaveBeenCalled();
    tick(1);
    expect(navigate).toHaveBeenCalledOnceWith('/painel');
  }));

  it('shows the error page without granting access on OAuth error', () => {
    spyOn<any>(component, 'getCallbackParams')
      .and.returnValue(new URLSearchParams('error=access_denied'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-login-status-overlay')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Login não concluído');
    expect(userService.completeSocialLoginFromCallback).not.toHaveBeenCalled();
  });

  it('redirects to onboarding rather than showing a successful login', () => {
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOn<any>(component, 'getCallbackParams')
      .and.returnValue(new URLSearchParams('requires_registration=true&registration_token=test-proof'));
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledOnceWith(['/social-register']);
    expect(component.loginState).toBe('authenticating');
    expect(sessionStorage.getItem('pending_social_registration_token')).toBe('test-proof');
    expect(userService.completeSocialLoginFromCallback).not.toHaveBeenCalled();
  });

  it('cancels success navigation when the component is destroyed', fakeAsync(() => {
    const response = new Subject<any>();
    userService.completeSocialLoginFromCallback.and.returnValue(response.asObservable());
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    spyOn<any>(component, 'getCallbackParams').and.returnValue(new URLSearchParams('code=test-code'));
    fixture.detectChanges();

    response.next({}); response.complete();
    fixture.detectChanges();
    fixture.destroy();
    tick(1500);
    expect(navigate).not.toHaveBeenCalled();
  }));
});
