import { SimpleChange } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import {
  PartnerDiscordItem,
  PartnerDiscordService,
  PartnerDiscordSettings
} from '../../../../../../core/services/partner-discord.service';
import { PartnerAnnouncementEditorComponent } from './partner-announcement-editor.component';

describe('PartnerAnnouncementEditorComponent', () => {
  const partner: PartnerDiscordItem = {
    partnerId: 7,
    name: 'República Indie',
    status: 'active',
    representativeName: 'Representante',
    representativeDiscordUserId: null,
    exclusiveChannelEnabled: false,
    existingTextChannelId: null,
    adoptExistingTextChannel: false,
    threadId: '123456789012345678',
    textChannelId: null,
    desiredRevision: 1,
    appliedRevision: 1,
    lastSyncError: null,
    contentOutOfSync: false,
    announcementMarkdown: null,
    announcementLinksMode: 'INLINE_ONLY',
    announcementPublicContact: null
  };
  function settings(overrides: Partial<PartnerDiscordSettings> = {}): PartnerDiscordSettings {
    return { guildId: '753321055682035712', configured: true, categoryId: null,
      threadParentChannelId: null, partners: [{ ...partner }], ...overrides };
  }
  function setup(state = settings()) {
    const service = jasmine.createSpyObj<PartnerDiscordService>('PartnerDiscordService',
      ['getSettings', 'updateAnnouncement', 'syncPartner']);
    service.getSettings.and.returnValue(of(state));
    const component = new PartnerAnnouncementEditorComponent(service);
    component.partnerId = 7;
    component.partnerName = 'República Indie';
    component.ngOnChanges({ partnerId: new SimpleChange(undefined, 7, true) });
    return { component, service };
  }

  it('loads only the requested partner from the scoped API response', () => {
    const { component, service } = setup(settings({ partners: [{ ...partner, partnerId: 8 }, { ...partner }] }));
    expect(service.getSettings).toHaveBeenCalledTimes(1);
    expect(component.partner?.partnerId).toBe(7);
    expect(component.dirty).toBeFalse();
  });

  it('keeps edits local until explicitly saved and never publishes an unsaved draft', () => {
    const { component, service } = setup();
    component.updateDraft({ markdown: '# 🐑 República Indie', publicContact: 'Equipe' });
    expect(component.dirty).toBeTrue();
    component.sync();
    expect(service.syncPartner).not.toHaveBeenCalled();
    const saved = { ...partner, announcementMarkdown: '# 🐑 República Indie',
      announcementPublicContact: 'Equipe', desiredRevision: 2 };
    service.updateAnnouncement.and.returnValue(of(saved));
    component.save();
    expect(service.updateAnnouncement).toHaveBeenCalledOnceWith(7, {
      markdown: '# 🐑 República Indie', linksMode: 'INLINE_ONLY', publicContact: 'Equipe'
    });
    expect(component.dirty).toBeFalse();
    expect(service.syncPartner).not.toHaveBeenCalled();
    service.syncPartner.and.returnValue(of({ ...saved, appliedRevision: 2 }));
    component.sync();
    expect(service.syncPartner).toHaveBeenCalledOnceWith(7);
    expect(component.success).toContain('sincronizado');
  });

  it('does not allow writes until the Discord destination is configured', () => {
    const { component, service } = setup(settings({ configured: false }));
    component.updateDraft({ markdown: '# Anúncio' });
    component.save();
    component.sync();
    expect(service.updateAnnouncement).not.toHaveBeenCalled();
    expect(service.syncPartner).not.toHaveBeenCalled();
  });

  it('does not save or sync an unknown partner even if another partner exists', () => {
    const { component, service } = setup(settings({ partners: [{ ...partner, partnerId: 8 }] }));
    expect(component.partner).toBeNull();
    expect(component.error).toContain('Community oficial');
    component.save();
    component.sync();
    expect(service.updateAnnouncement).not.toHaveBeenCalled();
    expect(service.syncPartner).not.toHaveBeenCalled();
  });

  it('keeps the draft on a failed save so it can be retried', () => {
    const { component, service } = setup();
    component.updateDraft({ markdown: '# Nova versão' });
    service.updateAnnouncement.and.returnValue(throwError(() => ({ status: 409, error: { message: 'Conflito' } })));
    component.save();
    expect(component.error).toBe('Conflito');
    expect(component.dirty).toBeTrue();
  });

  it('blocks concurrent save and sync attempts', () => {
    const { component, service } = setup();
    const pending = new Subject<PartnerDiscordItem>();
    service.updateAnnouncement.and.returnValue(pending);
    component.updateDraft({ markdown: '# Nova versão' });
    component.save();
    component.save();
    component.sync();
    expect(service.updateAnnouncement).toHaveBeenCalledTimes(1);
    expect(service.syncPartner).not.toHaveBeenCalled();
    pending.next({ ...partner, announcementMarkdown: '# Nova versão' });
    pending.complete();
    expect(component.saving).toBeFalse();
  });

  it('escapes HTML before interpreting Markdown headings and links', () => {
    const { component } = setup();
    const html = component.previewMarkdown('# **Anúncio**\n<script>alert(1)</script>');
    expect(html).toContain('<strong>Anúncio</strong>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
