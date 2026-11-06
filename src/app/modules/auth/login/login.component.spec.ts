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
          snapshot: { queryParams: { conta_unificada: '1' } }
        } },
        { provide: UserService, useValue: jasmine.createSpyObj<UserService>(
          'UserService', ['login', 'startSocialLogin']
        ) },
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

  it('does not trust consolidation success to recreate a previous session', () => {
    expect(component.isLoggingIn).toBeFalse();
    expect(component.returnUrl).toBe('/painel');
  });
});
