import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminCoddyPresenceResponse } from '../../../../../shared/models/api/admin/admin';
import { AdminCoddyPresenceComponent } from './coddy-presence.component';

describe('AdminCoddyPresenceComponent', () => {
  const response: AdminCoddyPresenceResponse = {
    summary: { knownServers: 2, activeServers: 1, inactiveServers: 1, estimatedReach: 1234,
      entries7d: 1, exits7d: 1, entries30d: 2, exits30d: 1 },
    pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    items: [{ communityId: 7, communityName: 'Comunidade Demo', guildId: '123456789012345678',
      name: 'Servidor Demo', active: true, observedMembers: 1234, membershipSyncState: 'HEALTHY',
      lastBotJoinedAt: '2026-11-10T14:30:00Z', lastBotLeftAt: null,
      lastFullReconciliationAt: null, lastMembershipEventAt: null }]
  };
  let api: jasmine.SpyObj<AdminService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdminService>('AdminService', ['getCoddyPresence']);
    api.getCoddyPresence.and.returnValue(of(response));
    await TestBed.configureTestingModule({
      declarations: [AdminCoddyPresenceComponent],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: AdminService, useValue: api }]
    }).compileComponents();
  });

  it('renders the reach, server identity and expanded sync details', () => {
    const fixture = TestBed.createComponent(AdminCoddyPresenceComponent);
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Presença do Coddy');
    expect(content).toContain('Servidores ativos');
    expect(content).toContain('1.234');
    expect(content).toContain('Servidor Demo');
    expect(content).toContain('Comunidade Demo');
    expect(content).toContain('123456789012345678');
    expect(content).toContain('Não registrado');
    expect(content).toContain('não o total de pessoas únicas');
    fixture.componentInstance.toggleDetails('123456789012345678');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Última reconciliação de membros');
    expect(fixture.nativeElement.textContent).toContain('Sincronizado');
    fixture.destroy();
  });

  it('forwards filters to the API and keeps Discord guild IDs as strings', () => {
    const fixture = TestBed.createComponent(AdminCoddyPresenceComponent);
    fixture.detectChanges();
    fixture.componentInstance.search = ' 123456789012345678 ';
    fixture.componentInstance.status = 'active';
    fixture.componentInstance.communityIdInput = 7;
    fixture.componentInstance.applyFilters();
    expect(api.getCoddyPresence).toHaveBeenCalledWith({
      page: 1, pageSize: 20, search: '123456789012345678',
      status: 'active', communityId: 7
    });
    fixture.destroy();
  });

  it('rejects invalid community filters without sending a request', () => {
    const fixture = TestBed.createComponent(AdminCoddyPresenceComponent);
    fixture.detectChanges();
    api.getCoddyPresence.calls.reset();
    fixture.componentInstance.communityIdInput = -1;
    fixture.componentInstance.applyFilters();
    fixture.detectChanges();
    expect(api.getCoddyPresence).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('ID de comunidade válido');
    fixture.destroy();
  });

  it('shows errors instead of an empty-results message on an API failure', () => {
    api.getCoddyPresence.and.returnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(AdminCoddyPresenceComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Não foi possível consultar');
    expect(fixture.nativeElement.textContent).not.toContain('Nenhum servidor encontrado');
    fixture.destroy();
  });
});
