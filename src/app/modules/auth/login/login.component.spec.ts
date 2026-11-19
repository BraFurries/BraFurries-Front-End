import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { SeoService } from '../../../core/services/seo-service.service';
import { LoginComponent } from './login.component';

describe('LoginComponent account consolidation recovery', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          snapshot: { queryParams: {} }
        } },
        { provide: UserService, useValue: {
          login: jasmine.createSpy('login'),
          startSocialLogin: jasmine.createSpy('startSocialLogin'),
          consumeAccountConsolidationNotice: jasmine.createSpy('consumeAccountConsolidationNotice')
            .and.returnValue(true)
        } },
        { provide: SeoService, useValue: { updateMetaTags: jasmine.createSpy('updateMetaTags') } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('defaults to remembering the session and allows explicit opt-out', () => {
    expect(component.loginForm.get('rememberMe')?.value).toBeTrue();
    const checkbox = fixture.nativeElement.querySelector('#remember') as HTMLInputElement;
    expect(checkbox.checked).toBeTrue();
    checkbox.click();
    expect(component.loginForm.get('rememberMe')?.value).toBeFalse();
  });

  it('explains why authentication is required again after a completed merge', () => {
    expect(component.accountConsolidated).toBeTrue();
    const message: HTMLElement = fixture.nativeElement.querySelector('[role="status"]');
    expect(message).toBeTruthy();
    expect(message.textContent).toContain('sessões antigas foram encerradas');
    expect(message.textContent).toContain('Discord');
  });

  it('does not infer a completed merge from arbitrary URL parameters', () => {
    const users = TestBed.inject(UserService);
    expect(users.consumeAccountConsolidationNotice).toHaveBeenCalledTimes(1);
    expect(component.accountConsolidated).toBeTrue();
  });

  it('does not trust consolidation success to recreate a previous session', () => {
    expect(component.isLoggingIn).toBeFalse();
    expect(component.returnUrl).toBe('/painel');
  });

  it('shows the shared login animation with correct authentication states', fakeAsync(() => {
    const loginReply = new Subject<any>();
    (TestBed.inject(UserService).login as jasmine.Spy).and.returnValue(loginReply.asObservable());
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    component.loginForm.setValue({ email: 'member@example.com', password: 'example-password', rememberMe: false });

    component.login();
    fixture.detectChanges();
    let overlay: HTMLElement = fixture.nativeElement.querySelector('app-login-status-overlay');
    expect(overlay.textContent).toContain('Autenticando...');
    expect(overlay.textContent).not.toContain('Acesso Liberado!');

    loginReply.next({}); loginReply.complete();
    fixture.detectChanges();
    overlay = fixture.nativeElement.querySelector('app-login-status-overlay');
    expect(overlay.textContent).toContain('Acesso Liberado!');
    expect(overlay.textContent).toContain('Preparando seu painel...');
    tick(1500);
    expect(navigate).toHaveBeenCalledOnceWith('/painel');
  }));

  it('removes the overlay after an invalid password response', () => {
    const loginReply = new Subject<any>();
    (TestBed.inject(UserService).login as jasmine.Spy).and.returnValue(loginReply.asObservable());
    component.loginForm.setValue({ email: 'member@example.com', password: 'invalid', rememberMe: false });
    component.login();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-login-status-overlay')).not.toBeNull();

    loginReply.error(new HttpErrorResponse({ status: 401, error: { message: 'Credenciais inválidas' } }));
    fixture.detectChanges();
    expect(component.isSubmitting).toBeFalse();
    expect(fixture.nativeElement.querySelector('app-login-status-overlay')).toBeNull();
    expect(component.errorMessage).toContain('Credenciais inválidas');
  });
});
