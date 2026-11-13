import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
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
    contentOutOfSync: false,
    announcementMarkdown: null,
    announcementLinksMode: 'INLINE_ONLY',
    announcementPublicContact: null
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
      'getSettings', 'updateConfig', 'updatePartner',
      'syncPartner', 'syncAll', 'unpublishPartner'
    ]);
    service.getSettings.and.returnValue(of(settings()));
    await TestBed.configureTestingModule({
      declarations: [PartnerDiscordPanelComponent],
      imports: [FormsModule, RouterTestingModule],
      providers: [{ provide: PartnerDiscordService, useValue: service }]
    }).compileComponents();
    fixture = TestBed.createComponent(PartnerDiscordPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('guildId', guildId);
    fixture.detectChanges();
  });

  it('shows only active partners in the Discord operations list', () => {
    component.state = settings({ partners: [
      { ...partner, status: 'active' },
      { ...partner, partnerId: 32, status: 'pending' },
      { ...partner, partnerId: 33, status: 'suspended' }
    ] });
    fixture.detectChanges();
    expect(component.activePartners.map(item => item.partnerId)).toEqual([31]);
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'))
      .map(link => link.getAttribute('href'));
    expect(links).not.toContain('/painel/admin/parceiros/32/editar');
    expect(links).not.toContain('/painel/admin/parceiros/33/editar');
  });

  it('uses the same hero, cards, fields and buttons as the other Coddy tabs', () => {
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.partner-panel > .hero-card.card')).not.toBeNull();
    expect(html.querySelector('.settings-grid .field-control')).not.toBeNull();
    expect(html.querySelector('.partner-grid .partner-card.card')).not.toBeNull();
    expect(html.querySelector('.partner-card .announcement-note')).not.toBeNull();
    expect(html.querySelector('.partner-card .partner-footer .primary-button')).toBeNull();
    expect(html.querySelector('.partner-card .partner-footer .danger-button')).not.toBeNull();
    expect(html.textContent).toContain('parceiro ativo');
  });

  it('keeps contextual partner controls inside the styled card', () => {
    const html = fixture.nativeElement as HTMLElement;
    const card = html.querySelector('.partner-card') as HTMLElement;
    expect(card.textContent).toContain('Parceiro exemplo');
    expect(card.textContent).toContain('Representante');
    expect(card.querySelector('a[href="/painel/admin/parceiros/31/editar"]')).not.toBeNull();
    expect((card.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBeFalse();
  });

  it('loads the partners solely from the authenticated API', () => {
    expect(service.getSettings).toHaveBeenCalledTimes(1);
    expect(component.state?.partners.map(item => item.partnerId)).toEqual([31]);
    expect(component.enabled).toBeTrue();
  });

  it('supports first-time destination configuration through the unified save action', async () => {
    const unconfigured = settings({
      configured: false, categoryId: null, threadParentChannelId: null, partners: []
    });
    service.getSettings.and.returnValue(of(unconfigured));
    service.updateConfig.and.returnValue(of(settings({
      configured: true, categoryId: 'cat-first', partners: []
    })));
    component.load();
    component.onCategoryChanged('cat-first');

    expect(component.dirty).toBeTrue();
    expect(component.canSaveAll).toBeTrue();

    await component.saveAll();

    expect(service.updateConfig).toHaveBeenCalledOnceWith({
      categoryId: 'cat-first', threadParentChannelId: null
    });
    expect(component.dirty).toBeFalse();
    expect(component.state?.configured).toBeTrue();
  });

  it('saves configuration and changed partner options using one action', async () => {
    const configured = settings({ categoryId: 'cat-1', partners: [{ ...partner }] });
    service.updateConfig.and.returnValue(of(configured));
    service.updatePartner.and.returnValue(of({ ...partner, exclusiveChannelEnabled: true }));
    service.syncPartner.and.returnValue(of({ ...partner, exclusiveChannelEnabled: true }));

    component.onCategoryChanged('cat-1');
    component.updateDraft(partner, { exclusiveChannelEnabled: true });
    expect(component.canSaveAll).toBeTrue();
    await component.saveAll();

    expect(service.updateConfig).toHaveBeenCalledOnceWith({
      categoryId: 'cat-1', threadParentChannelId: null
    });
    expect(service.updatePartner).toHaveBeenCalledOnceWith(31, {
      exclusiveChannelEnabled: true, existingTextChannelId: null,
      adoptExistingTextChannel: false
    });
    expect(service.syncPartner).toHaveBeenCalledOnceWith(31);
    expect(component.dirty).toBeFalse();
    expect(component.success).toContain('salvas');
  });

  it('preserves unsaved partner drafts when the destination was saved but a partner update fails', async () => {
    service.updateConfig.and.returnValue(of(settings({ categoryId: 'cat-1' })));
    service.updatePartner.and.returnValue(throwError(() => ({ error: { message: 'Sem permissão' } })));
    component.onCategoryChanged('cat-1');
    component.updateDraft(partner, { exclusiveChannelEnabled: true });

    await component.saveAll();

    expect(component.categoryId).toBe('cat-1');
    expect(component.hasConfigChanges).toBeFalse();
    expect(component.partnerDirty(partner)).toBeTrue();
    expect(component.error).toContain('Sem permissão');
    expect(component.canSaveAll).toBeTrue();
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

  it('links to the partner record instead of duplicating the Markdown editor', () => {
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('Editar anúncio na ficha do parceiro');
    expect(html.querySelector('textarea[maxlength="16000"]')).toBeNull();
    expect(html.querySelector('a[href="/painel/admin/parceiros/31/editar"]')).not.toBeNull();
  });

  it('shows an authorization error if administrative access is denied', () => {
    service.getSettings.and.returnValue(throwError(() => ({ status: 403 })));
    component.load();
    expect(component.error).toContain('Apenas responsáveis autorizados');
    expect(component.state).toBeUndefined();
  });
});
