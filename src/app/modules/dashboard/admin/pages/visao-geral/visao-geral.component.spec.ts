import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminOverview } from '../../../../../shared/models/api/admin/admin';
import { AdminOverviewComponent } from './visao-geral.component';

describe('AdminOverviewComponent', () => {
  const overview: AdminOverview = {
    systemStatus: 'operational',
    metrics: {
      totalUsers: 120,
      newUsersWeek: 0,
      activePartners: 5,
      pendingPartners: 3,
      botStatus: 'online',
      botPingMs: 21,
      botServers: 8,
      botReconciledServers: 6,
      serverGrowthWeek: 2,
      serverLeavesWeek: 1,
      botReachedUsers: 2580
    },
    recentActivities: []
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdminOverviewComponent],
      imports: [CommonModule],
      providers: [
        { provide: AdminService, useValue: { getOverview: () => of(overview) } }
      ]
    }).compileComponents();
  });

  it('renders Coddy reach second and the real weekly partner/presence counters', () => {
    const fixture = TestBed.createComponent(AdminOverviewComponent);
    fixture.detectChanges();

    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('.grid > div')
    ) as HTMLElement[];
    const labels = cards.map(card => card.querySelector('p')?.textContent?.trim());
    expect(labels).toEqual([
      'Total de Usuários',
      'Alcance do Coddy',
      'Parceiros Ativos',
      'Status do Coddy'
    ]);
    expect(cards[1].textContent).toContain('Identidades distintas com presença registrada');
    expect(cards[1].textContent).not.toContain('reconciliados');
    expect(cards[1].textContent).toContain('2 entradas');
    expect(cards[1].textContent).toContain('1 saída');
    expect(cards[2].textContent).toContain('3 em análise');
    expect(cards[0].textContent).not.toContain('essa semana');
    fixture.destroy();
  });
});
