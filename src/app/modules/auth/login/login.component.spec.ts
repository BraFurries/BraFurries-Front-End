import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
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
});
