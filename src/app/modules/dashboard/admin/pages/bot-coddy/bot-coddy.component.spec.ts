import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminBotStatus, AdminOverview } from '../../../../../shared/models/api/admin/admin';
import { AdminBotComponent } from './bot-coddy.component';

describe('AdminBotComponent', () => {
  let service: jasmine.SpyObj<AdminService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<AdminService>('AdminService', ['getBotStatus', 'getOverview']);
    service.getBotStatus.and.returnValue(of({ status: 'online', users: 3456 } as AdminBotStatus));
    service.getOverview.and.returnValue(of({
      metrics: { botReachedUsers: 61 }
    } as AdminOverview));

    await TestBed.configureTestingModule({
      declarations: [AdminBotComponent],
      imports: [CommonModule, RouterTestingModule],
      providers: [{ provide: AdminService, useValue: service }]
    }).compileComponents();
  });

  it('shows distinct persisted reach rather than duplicated runtime guild member totals', () => {
    const fixture = TestBed.createComponent(AdminBotComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Usuários Alcançados');
    expect(text).toContain('61');
    expect(text).not.toContain('3456');
    expect(service.getOverview).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('keeps bot telemetry visible if reach cannot be loaded', () => {
    service.getOverview.and.returnValue(throwError(() => new Error('unavailable')));
    const fixture = TestBed.createComponent(AdminBotComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Indisponível');
    expect(text).toContain('online');
    fixture.destroy();
  });
});
