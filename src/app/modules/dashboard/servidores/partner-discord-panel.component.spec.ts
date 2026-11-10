import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import {
  PartnerDiscordItem,
  PartnerDiscordService,
  PartnerDiscordSettings
} from '../../../core/services/partner-discord.service';
import { PartnerDiscordPanelComponent } from './partner-discord-panel.component';

describe('PartnerDiscordPanelComponent', () => {
  let fixture: ComponentFixture<PartnerDiscordPanelComponent>;
  let component: PartnerDiscordPanelComponent;
  let service: jasmine.SpyObj<PartnerDiscordService>;

  const guildId = '1480343896461545606';
  const partner: PartnerDiscordItem = {
    partnerId: 31,
    name: 'Parceiro exemplo',
    status: 'active',
    representativeName: 'Representante',
    representativeDiscordUserId: '123456789012345678',
    exclusiveChannelEnabled: false,
    existingTextChannelId: null,
    adoptExistingTextChannel: false,
    threadId: '555555555555555555',
    textChannelId: null,
    desiredRevision: 1,
    appliedRevision: 1,
    lastSyncError: null,
    contentOutOfSync: false
  };

  function settings(override: Partial<PartnerDiscordSettings> = {}): PartnerDiscordSettings {
    return {
      guildId,
      categoryId: null,
      threadParentChannelId: null,
      configured: true,
      partners: [{ ...partner }],
      ...override
    };
  }

  beforeEach(async () => {
    service = jasmine.createSpyObj<PartnerDiscordService>('PartnerDiscordService', [
      'getSettings', 'updateConfig', 'updatePartner', 'syncPartner', 'syncAll', 'unpublishPartner'
    ]);
    service.getSettings.and.returnValue(of(settings()));
    await TestBed.configureTestingModule({
      declarations: [PartnerDiscordPanelComponent],
      imports: [FormsModule],
      providers: [{ provide: PartnerDiscordService, useValue: service }]
    }).compileComponents();
    fixture = TestBed.createComponent(PartnerDiscordPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('guildId', guildId);
    fixture.detectChanges();
  });

  it('loads the partners solely from the authenticated API', () => {
    expect(service.getSettings).toHaveBeenCalledTimes(1);
    expect(component.state?.partners.map(item => item.partnerId)).toEqual([31]);
    expect(component.enabled).toBeTrue();
  });

  it('never syncs unconfigured destinations', () => {
    component.state = settings({ configured: false });
    component.syncAll();
    expect(service.syncAll).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before withdrawing a partner', () => {
    component.requestWithdrawal(partner.partnerId);
    expect(component.withdrawalConfirmationId).toBe(31);
    expect(service.unpublishPartner).not.toHaveBeenCalled();
    component.cancelWithdrawal();
    component.confirmWithdrawal(partner);
    expect(service.unpublishPartner).not.toHaveBeenCalled();
  });

  it('withdraws a confirmed publication and reloads the backend state', () => {
    service.unpublishPartner.and.returnValue(of(void 0));
    service.getSettings.and.returnValue(of(settings({ partners: [] })));
    component.requestWithdrawal(partner.partnerId);
    component.confirmWithdrawal(partner);
    expect(service.unpublishPartner).toHaveBeenCalledOnceWith(31);
    expect(component.state?.partners).toEqual([]);
    expect(component.withdrawalConfirmationId).toBeNull();
  });

  it('does not expose a foreign Community guild as a configurable target', () => {
    component.guildId = '999999999999999999';
    expect(component.enabled).toBeFalse();
    component.syncAll();
    expect(service.syncAll).not.toHaveBeenCalled();
  });

  it('shows an authorization error if administrative access is denied', () => {
    service.getSettings.and.returnValue(throwError(() => ({ status: 403 })));
    component.load();
    expect(component.error).toContain('Apenas responsáveis autorizados');
    expect(component.state).toBeUndefined();
  });
});
