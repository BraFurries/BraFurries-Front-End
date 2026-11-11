import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import {
  AdminBotStatus, AdminOverview, AdminCoddyPresenceView, AdminCoddyMessageTargets
} from '../../../../../shared/models/api/admin/admin';
import { AdminBotComponent } from './bot-coddy.component';

describe('AdminBotComponent', () => {
  let service: jasmine.SpyObj<AdminService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<AdminService>('AdminService', [
      'getBotStatus', 'getOverview', 'getBotPresence', 'updateBotPresence',
      'getBotMessageTargets', 'sendBotMessage'
    ]);
    service.getBotStatus.and.returnValue(of({ status: 'online', users: 3456 } as AdminBotStatus));
    service.getOverview.and.returnValue(of({ metrics: { botReachedUsers: 61 } } as AdminOverview));
    service.getBotPresence.and.returnValue(of({
      desired: null, current: {
        activityType: 'WATCHING', activityText: 'Comunidades', availability: 'online'
      }, configured: false
    } as AdminCoddyPresenceView));
    service.getBotMessageTargets.and.returnValue(of({
      guilds: [{
        communityId: 12,
        communityName: 'Comunidade Alfa',
        guildId: '123456789012345678',
        guildName: 'Servidor Alfa',
        channels: [{ channelId: '777777777777777777', name: 'avisos', kind: 'text' }]
      }]
    } as AdminCoddyMessageTargets));

    await TestBed.configureTestingModule({
      declarations: [AdminBotComponent],
      imports: [CommonModule, FormsModule, RouterTestingModule],
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
    expect(fixture.nativeElement.textContent).toContain('Indisponível');
    expect(fixture.nativeElement.textContent).toContain('online');
    fixture.destroy();
  });

  it('does not mutate presence until explicit confirmation', () => {
    const fixture = TestBed.createComponent(AdminBotComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.activityText = 'Eventos';
    component.activityType = 'PLAYING';
    component.reviewPresence();
    expect(component.presenceConfirming).toBeTrue();
    expect(service.updateBotPresence).not.toHaveBeenCalled();

    service.updateBotPresence.and.returnValue(of({
      desired: { activityType: 'PLAYING', activityText: 'Eventos', availability: 'online' },
      current: { activityType: 'PLAYING', activityText: 'Eventos', availability: 'online' },
      configured: true
    }));
    component.applyPresence();
    expect(service.updateBotPresence).toHaveBeenCalledOnceWith({
      activityType: 'PLAYING', activityText: 'Eventos', availability: 'online'
    });
    expect(component.presenceConfirming).toBeFalse();
    fixture.destroy();
  });

  it('sends only after preview and confirmation and never retries automatically', () => {
    const fixture = TestBed.createComponent(AdminBotComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectGuild('123456789012345678');
    component.selectChannel('777777777777777777');
    component.messageText = 'Olá **comunidade**!';
    component.reviewMessage();

    expect(component.messagePreview).toBeTrue();
    expect(service.sendBotMessage).not.toHaveBeenCalled();
    service.sendBotMessage.and.returnValue(of({
      requestKey: '00000000-0000-4000-8000-000000000001',
      outcome: 'sent',
      guildId: '123456789012345678',
      channelId: '777777777777777777',
      messageId: '900000000000000001'
    }));
    component.sendMessage();
    expect(service.sendBotMessage).toHaveBeenCalledTimes(1);
    expect(service.sendBotMessage.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      communityId: 12,
      guildId: '123456789012345678',
      channelId: '777777777777777777',
      message: 'Olá **comunidade**!'
    }));
    expect(component.sentMessageId).toBe('900000000000000001');
    component.sendMessage();
    expect(service.sendBotMessage).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('prevents automatic resends when delivery result is uncertain', () => {
    service.sendBotMessage.and.returnValue(throwError(() => new Error('timeout')));
    const fixture = TestBed.createComponent(AdminBotComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectGuild('123456789012345678');
    component.selectChannel('777777777777777777');
    component.messageText = 'Atenção';
    component.reviewMessage();
    component.sendMessage();

    expect(component.sendBlocked).toBeTrue();
    expect(component.sendError).toContain('sem confirmação');
    component.sendMessage();
    expect(service.sendBotMessage).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('never reveals unlisted Community channels in the target selector', () => {
    const fixture = TestBed.createComponent(AdminBotComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectGuild('123456789012345678');
    component.selectChannel('999999999999999999');
    component.messageText = 'Teste';
    component.reviewMessage();

    expect(component.messagePreview).toBeFalse();
    expect(service.sendBotMessage).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
