import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, Subject } from 'rxjs';

import {
  AiConfigResponse,
  ManagedServersService
} from '../../../core/services/managed-servers.service';
import { AiConfigurationPanelComponent } from './ai-configuration-panel.component';

describe('AiConfigurationPanelComponent', () => {
  let fixture: ComponentFixture<AiConfigurationPanelComponent>;
  let component: AiConfigurationPanelComponent;
  let service: jasmine.SpyObj<ManagedServersService>;

  const config: AiConfigResponse = {
    guildId: '123',
    enabled: true,
    model: 'gpt-5-mini',
    tokenConfigured: true,
    tokenUpdatedAt: '2026-10-06T01:02:03',
    channelLimitEnabled: true,
    channelIds: ['10'],
    adminChannelBypassEnabled: true,
    adminUserIds: ['42']
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<ManagedServersService>(
      'ManagedServersService',
      ['getAi', 'updateAi', 'rotateAiToken', 'removeAiToken']
    );
    service.getAi.and.returnValue(of(structuredClone(config)));
    service.updateAi.and.returnValue(of(structuredClone(config)));
    service.rotateAiToken.and.returnValue(of({
      configured: true,
      updatedAt: '2026-10-06T02:03:04'
    }));
    service.removeAiToken.and.returnValue(of({
      configured: false,
      updatedAt: null
    }));

    await TestBed.configureTestingModule({
      declarations: [AiConfigurationPanelComponent],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: ManagedServersService, useValue: service }]
    }).compileComponents();

    fixture = TestBed.createComponent(AiConfigurationPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('guildId', '123');
    fixture.componentRef.setInput('channels', [
      { id: '10', name: 'geral', type: 'text' },
      { id: '11', name: 'avisos', type: 'news' },
      { id: '20', name: 'call', type: 'voice' }
    ]);
    fixture.detectChanges();
  });

  it('clears parent dirty and saving state when the panel is destroyed', () => {
    const dirty = spyOn(component.dirtyChange, 'emit');
    const saving = spyOn(component.savingChange, 'emit');

    component.ngOnDestroy();

    expect(dirty).toHaveBeenCalledWith(false);
    expect(saving).toHaveBeenCalledWith(false);
  });

  it('loads only safe credential metadata and messageable channels', () => {
    expect(service.getAi).toHaveBeenCalledWith('123');
    expect(component.draft?.tokenConfigured).toBeTrue();
    expect(component.draft?.tokenUpdatedAt).toBe('2026-10-06T01:02:03');
    expect(component.messageChannels.map(channel => channel.id)).toEqual(['10', '11']);
  });

  it('offers recent OpenAI models as a dropdown while keeping the configured legacy model', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const picker = fixture.nativeElement.querySelector(
      'select[aria-label="Modelo OpenAI"]'
    ) as HTMLSelectElement;
    expect(picker).not.toBeNull();
    const values = Array.from(picker.options, option => option.value);
    expect(values).toContain('gpt-6-luna');
    expect(values).toContain('gpt-6.1-terra');
    expect(values).toContain('gpt-6.1-sol');
    expect(values).toContain('gpt-6-astra');
    expect(values).toContain('gpt-5-mini');
    expect(picker.value).toBe('gpt-5-mini');
    expect(component.dirty).toBeFalse();
  });

  it('selecting a recent model changes only the draft until Save', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const picker = fixture.nativeElement.querySelector(
      'select[aria-label="Modelo OpenAI"]'
    ) as HTMLSelectElement;
    picker.value = 'gpt-6.1-terra';
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.draft!.model).toBe('gpt-6.1-terra');
    expect(component.persisted!.model).toBe('gpt-5-mini');
    expect(component.dirty).toBeTrue();
    expect(service.updateAi).not.toHaveBeenCalled();

    component.save();
    expect(service.updateAi).toHaveBeenCalledWith('123', jasmine.objectContaining({
      model: 'gpt-6.1-terra'
    }));
  });

  it('uses a compact picker that only offers channels not already selected', () => {
    expect(component.availableMessageChannels.map(channel => channel.id)).toEqual(['11']);

    component.addChannel('11');

    expect(component.draft!.channelIds).toEqual(['10', '11']);
    expect(component.availableMessageChannels).toEqual([]);
    expect(component.channelToAdd).toBe('');
  });

  it('keeps incompatible legacy channels visible as removable chips', () => {
    component.draft!.channelIds = ['20'];

    expect(component.channelUnavailable('20')).toBeTrue();
    expect(component.channelName('20')).toBeNull();

    component.removeChannel('20');
    expect(component.draft!.channelIds).toEqual([]);
  });

  it('saves the full administrative config through the API contract', () => {
    component.draft!.model = 'gpt-5';
    component.draft!.channelIds = ['10', '11'];
    component.updateAdminUserIds('42\n43, 42');

    component.save();

    expect(service.updateAi).toHaveBeenCalledWith('123', {
      enabled: true,
      model: 'gpt-5',
      channelLimitEnabled: true,
      channelIds: ['10', '11'],
      adminChannelBypassEnabled: true,
      adminUserIds: ['42', '43']
    });
  });

  it('keeps the token write-only and updates only credential metadata after rotation', () => {
    component.draft!.model = 'gpt-5';
    component.onDraftChanged();
    component.tokenInput = '  super-secret-token  ';

    component.rotateToken();

    expect(service.rotateAiToken).toHaveBeenCalledWith('123', 'super-secret-token');
    expect(component.tokenInput).toBe('');
    expect(component.draft!.model).toBe('gpt-5');
    expect(component.draft!.tokenConfigured).toBeTrue();
    expect(component.draft!.tokenUpdatedAt).toBe('2026-10-06T02:03:04');
    expect(component.dirty).toBeTrue();
  });

  it('requires explicit confirmation before removing a configured token', () => {
    component.requestTokenRemoval();

    expect(component.confirmTokenRemoval).toBeTrue();
    expect(service.removeAiToken).not.toHaveBeenCalled();

    component.removeToken();

    expect(service.removeAiToken).toHaveBeenCalledWith('123');
    expect(component.draft!.tokenConfigured).toBeFalse();
    expect(component.draft!.tokenUpdatedAt).toBeNull();
  });

  it('preserves edits made while a save is in flight', () => {
    const pending = new Subject<AiConfigResponse>();
    service.updateAi.and.returnValue(pending.asObservable());
    component.draft!.model = 'gpt-5';
    component.onDraftChanged();

    component.save();

    component.draft!.enabled = false;
    component.onDraftChanged();
    pending.next({ ...structuredClone(config), model: 'gpt-5' });
    pending.complete();

    expect(component.persisted!.model).toBe('gpt-5');
    expect(component.draft!.enabled).toBeFalse();
    expect(component.dirty).toBeTrue();
    expect(component.saveMessage).toContain('continuam não salvas');
  });

  it('ignores a stale guild response after the selected guild changes', () => {
    const oldConfig = new Subject<AiConfigResponse>();
    service.getAi.and.callFake((guildId: string) =>
      guildId === '123'
        ? oldConfig.asObservable()
        : of({ ...structuredClone(config), guildId: '456' })
    );

    component.guildId = '123';
    component.load();
    component.guildId = '456';
    component.load();

    oldConfig.next(structuredClone(config));
    oldConfig.complete();

    expect(component.guildId).toBe('456');
    expect(component.persisted?.guildId).toBe('456');
  });
});
