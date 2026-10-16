import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, Subject } from 'rxjs';

import {
  GuildResources,
  ManagedServersService,
  VipConfigResponse
} from '../../../core/services/managed-servers.service';
import { VipConfigurationPanelComponent } from './vip-configuration-panel.component';

describe('VipConfigurationPanelComponent', () => {
  let fixture: ComponentFixture<VipConfigurationPanelComponent>;
  let component: VipConfigurationPanelComponent;
  let service: jasmine.SpyObj<ManagedServersService>;

  const resources: GuildResources = {
    guildId: '123',
    roles: [
      { id: '10', name: 'VIP', position: 25, managed: false, editableByBot: true },
      { id: '20', name: 'Topo VIP', position: 20, managed: false, editableByBot: true },
      { id: '30', name: 'Base VIP', position: 10, managed: false, editableByBot: true },
      { id: '40', name: 'Acima do Coddy', position: 60, managed: false, editableByBot: false }
    ],
    channels: [],
    categories: [],
    botCapabilities: {
      canManageChannels: true,
      canManageRoles: true,
      canApply: true,
      missingPermissions: [],
      botTopRole: { id: '999', name: 'Coddy', position: 50 }
    }
  };

  const config: VipConfigResponse = {
    guildId: '123',
    roleIds: ['10'],
    roles: [resources.roles[0]],
    customRolePrefix: 'VIP',
    customRoleRange: { topRoleId: null, bottomRoleId: null },
    allowStaffColors: false,
    runtimeSyncPending: false,
    warnings: []
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<ManagedServersService>('ManagedServersService', ['getVip', 'updateVip']);
    service.getVip.and.returnValue(of(structuredClone(config)));
    service.updateVip.and.returnValue(of(structuredClone(config)));

    await TestBed.configureTestingModule({
      declarations: [VipConfigurationPanelComponent],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: ManagedServersService, useValue: service }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(VipConfigurationPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('resources', structuredClone(resources));
    fixture.componentRef.setInput('guildId', '123');
    fixture.detectChanges();
  });

  it('loads guild-scoped VIP configuration', () => {
    expect(service.getVip).toHaveBeenCalledWith('123');
    expect(component.draft?.customRolePrefix).toBe('VIP');
    expect(component.draft?.roleIds).toEqual(['10']);
  });

  it('allows removing a configured VIP role that no longer exists in Discord', () => {
    component.draft!.roleIds = ['10', '777'];
    component.onDraftChanged();

    expect(component.missingConfiguredRoleIds).toEqual(['777']);

    component.removeRole('777');

    expect(component.draft!.roleIds).toEqual(['10']);
    expect(component.missingConfiguredRoleIds).toEqual([]);
  });

  it('filters range anchors to positions the Coddy can manage', () => {
    expect(component.topRoleOptions.map(role => role.id)).toEqual(['10', '20', '30']);
    component.toggleRange(true);
    component.updateTopRole('20');
    expect(component.bottomRoleOptions.map(role => role.id)).toEqual(['30']);
  });

  it('allows disabling a persisted range after the Coddy loses Manage Roles', () => {
    const persistedRange = { topRoleId: '20', bottomRoleId: '30' };
    component.persisted = {
      ...structuredClone(config),
      customRoleRange: structuredClone(persistedRange)
    };
    component.draft = structuredClone(component.persisted);
    component.resources = {
      ...structuredClone(resources),
      botCapabilities: {
        ...structuredClone(resources.botCapabilities),
        canManageRoles: false
      }
    };

    expect(component.rangeEnabled).toBeTrue();
    expect(component.rangeUnavailableReason).toContain('Manage Roles');

    component.toggleRange(false);

    expect(component.draft!.customRoleRange).toEqual({ topRoleId: null, bottomRoleId: null });
    expect(component.dirty).toBeTrue();
  });

  it('saves one canonical draft through the VIP endpoint', () => {
    component.draft!.customRolePrefix = 'Apoiador';
    component.draft!.allowStaffColors = true;
    component.draft!.customRoleRange = { topRoleId: '20', bottomRoleId: '30' };
    component.onDraftChanged();

    service.updateVip.and.returnValue(of({
      ...structuredClone(config),
      customRolePrefix: 'Apoiador',
      customRoleRange: { topRoleId: '20', bottomRoleId: '30' },
      allowStaffColors: true
    }));

    component.save();

    expect(service.updateVip).toHaveBeenCalledWith('123', {
      roleIds: ['10'],
      customRolePrefix: 'Apoiador',
      customRoleRange: { topRoleId: '20', bottomRoleId: '30' },
      allowStaffColors: true
    });
    expect(component.dirty).toBeFalse();
  });

  it('preserves edits made while save is in flight', () => {
    const pending = new Subject<VipConfigResponse>();
    service.updateVip.and.returnValue(pending.asObservable());
    component.draft!.customRolePrefix = 'Apoiador';
    component.onDraftChanged();
    component.save();

    component.draft!.customRolePrefix = 'Parceiro';
    component.onDraftChanged();
    pending.next({ ...structuredClone(config), customRolePrefix: 'Apoiador' });
    pending.complete();

    expect(component.persisted?.customRolePrefix).toBe('Apoiador');
    expect(component.draft?.customRolePrefix).toBe('Parceiro');
    expect(component.dirty).toBeTrue();
  });

  it('ignores stale load response after guild change', () => {
    const oldLoad = new Subject<VipConfigResponse>();
    service.getVip.and.callFake(guildId =>
      guildId === '123'
        ? oldLoad.asObservable()
        : of({ ...structuredClone(config), guildId: '456' })
    );

    component.guildId = '123';
    component.load();
    component.guildId = '456';
    component.load();

    oldLoad.next(structuredClone(config));
    oldLoad.complete();

    expect(component.guildId).toBe('456');
    expect(component.persisted?.guildId).toBe('456');
  });

  it('reports runtime reconcile warning without reverting persisted config', () => {
    component.draft!.customRolePrefix = 'Apoiador';
    component.onDraftChanged();
    service.updateVip.and.returnValue(of({
      ...structuredClone(config),
      customRolePrefix: 'Apoiador',
      runtimeSyncPending: true,
      warnings: ['Reconciliação pendente']
    }));

    component.save();

    expect(component.persisted?.runtimeSyncPending).toBeTrue();
    expect(component.saveMessage).toContain('pendente');
  });

  it('clears parent state when destroyed', () => {
    const dirty = spyOn(component.dirtyChange, 'emit');
    const saving = spyOn(component.savingChange, 'emit');

    component.ngOnDestroy();

    expect(dirty).toHaveBeenCalledWith(false);
    expect(saving).toHaveBeenCalledWith(false);
  });
});
