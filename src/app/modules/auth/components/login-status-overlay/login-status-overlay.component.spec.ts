import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginStatusOverlayComponent } from './login-status-overlay.component';

describe('LoginStatusOverlayComponent', () => {
  let fixture: ComponentFixture<LoginStatusOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LoginStatusOverlayComponent] }).compileComponents();
    fixture = TestBed.createComponent(LoginStatusOverlayComponent);
  });

  it('shows authentication without implying account linking', () => {
    fixture.componentInstance.state = 'authenticating';
    fixture.detectChanges();
    const status: HTMLElement = fixture.nativeElement.querySelector('[role="status"]');
    expect(status.textContent).toContain('Autenticando...');
    expect(status.textContent).toContain('Verificando suas credenciais com segurança.');
    expect(status.textContent).not.toContain('Conectando sua conta');
  });

  it('shows the shared success message', () => {
    fixture.componentInstance.state = 'success';
    fixture.detectChanges();
    const status: HTMLElement = fixture.nativeElement.querySelector('[role="status"]');
    expect(status.textContent).toContain('Acesso Liberado!');
    expect(status.textContent).toContain('Preparando seu painel...');
  });
});
