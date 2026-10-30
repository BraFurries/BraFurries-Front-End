import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import {
  ManagedServersService, TemporaryRoleGrant
} from '../../../core/services/managed-servers.service';
import { TemporaryRolesPanelComponent } from './temporary-roles-panel.component';

describe('TemporaryRolesPanelComponent', () => {
  let fixture: ComponentFixture<TemporaryRolesPanelComponent>;
  let component: TemporaryRolesPanelComponent;
  let api: jasmine.SpyObj<ManagedServersService>;
  const grant: TemporaryRoleGrant = {
    id: 5, guildId: '123', discordUserId: '700', roleId: '50', grantSource: 'MANUAL',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reason: 'Apoio durante evento',
    status: 'ACTIVE', syncStatus: 'APPLIED', lastErrorCode: null,
    roleAddedByBot: true, version: 2,
    createdAt: new Date().toISOString(), appliedAt: new Date().toISOString()
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<ManagedServersService>('ManagedServersService',
      ['listTemporaryRoles', 'createTemporaryRole', 'renewTemporaryRole', 'cancelTemporaryRole']);
    api.listTemporaryRoles.and.returnValue(of([grant]));
    api.createTemporaryRole.and.returnValue(of(grant));
    api.renewTemporaryRole.and.returnValue(of(grant));
    api.cancelTemporaryRole.and.returnValue(of({...grant, status: 'CANCELLED'}));
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule],
      declarations: [TemporaryRolesPanelComponent],
      providers: [{provide: ManagedServersService, useValue: api}]
    }).compileComponents();
    fixture = TestBed.createComponent(TemporaryRolesPanelComponent);
    component = fixture.componentInstance;
    component.guildId = '123';
    component.roles = [{id: '50', name: 'Eventos', position: 10,
                        managed: false, editableByBot: true}];
    component.canManageRoles = true;
    component.ngOnChanges({guildId: new SimpleChange('', '123', true)});
    fixture.detectChanges();
  });

  it('loads only the selected guild and presents Discord sync status', () => {
    expect(api.listTemporaryRoles).toHaveBeenCalledWith('123');
    expect(fixture.nativeElement.textContent).toContain('Sincronizado');
    expect(fixture.nativeElement.textContent).toContain('Eventos');
  });

  it('does not allow grants when bot cannot manage roles', () => {
    component.canManageRoles = false;
    component.discordUserId = '700';
    component.roleId = '50';
    component.reason = 'Apoio durante evento';
    component.expiresLocal = new Date(Date.now() + 2 * 86400000)
      .toISOString().slice(0, 16);
    component.create();
    expect(api.createTemporaryRole).not.toHaveBeenCalled();
  });

  it('sends numeric Discord IDs as strings with an idempotency key', () => {
    component.discordUserId = '700';
    component.roleId = '50';
    component.reason = 'Apoio durante evento';
    component.expiresLocal = new Date(Date.now() + 2 * 86400000)
      .toISOString().slice(0, 16);
    component.create();
    expect(api.createTemporaryRole).toHaveBeenCalled();
    const request = api.createTemporaryRole.calls.mostRecent().args[1];
    expect(request.discordUserId).toBe('700');
    expect(request.roleId).toBe('50');
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('requires explicit confirmation before cancellation', () => {
    component.requestCancel(grant);
    expect(api.cancelTemporaryRole).not.toHaveBeenCalled();
    expect(component.pending?.type).toBe('CANCEL');
    component.confirm();
    expect(api.cancelTemporaryRole).toHaveBeenCalledWith('123', 5, 2);
  });

  it('discards stale results from a previous selected guild', () => {
    const delayed = new Subject<TemporaryRoleGrant[]>();
    api.listTemporaryRoles.and.returnValue(delayed.asObservable());
    component.guildId = '456';
    component.ngOnChanges({guildId: new SimpleChange('123', '456', false)});
    component.guildId = '789';
    api.listTemporaryRoles.and.returnValue(of([]));
    component.ngOnChanges({guildId: new SimpleChange('456', '789', false)});
    delayed.next([grant]);
    expect(component.grants).toEqual([]);
  });
});
