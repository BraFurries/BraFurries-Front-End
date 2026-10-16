import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, Subject, throwError } from 'rxjs';

import {
  ManagedServersService,
  XpConfigResponse,
  XpSimulationResponse
} from '../../../core/services/managed-servers.service';
import { XpLevelingPanelComponent } from './xp-leveling-panel.component';

describe('XpLevelingPanelComponent', () => {
  let fixture: ComponentFixture<XpLevelingPanelComponent>;
  let component: XpLevelingPanelComponent;
  let service: jasmine.SpyObj<ManagedServersService>;

  const config: XpConfigResponse = {
    guildId: '123',
    text: { enabled: true, baseMin: 8, baseMax: 16, cooldownMinSeconds: 30, cooldownMaxSeconds: 60 },
    voice: {
      enabled: true,
      xpPerMinute: 2,
      socialBonusPct: 0,
      socialBonusMinHumans: 2,
      diminishingWindow1Minutes: 60,
      diminishingWindow2Minutes: 120,
      diminishingFactor2: 0.6,
      diminishingFactor3: 0.3
    },
    progression: { k: 45, p: 2, b: 0 },
    limits: { textDailyCapXp: 300, voiceDailyCapXp: 600, globalDailyCapXp: 900 },
    levelUp: { enabled: true, channelId: '10', message: 'Parabéns {member}!' },
    advanced: { clearOnExit: false, multiplier: 1, dailyCombo: 5, comboMultiplier: 1.25 },
    reconciliation: { required: false, requestedAt: null, reconciledAt: null },
    levelUpPlaceholders: ['{member}', '{new_level}'],
    comboRuntimeActive: false,
    runtimeRefreshPending: false
  };

  const simulation: XpSimulationResponse = {
    guildId: '123',
    progression: { k: 45, p: 2, b: 0 },
    points: Array.from({ length: 101 }, (_, index) => {
      const level = index + 1;
      return {
        level,
        totalXp: level * 100,
        xpFromPreviousLevel: 100
      };
    })
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<ManagedServersService>(
      'ManagedServersService',
      ['getXp', 'updateXp', 'simulateXp']
    );
    service.getXp.and.returnValue(of(structuredClone(config)));
    service.simulateXp.and.returnValue(of(structuredClone(simulation)));
    service.updateXp.and.returnValue(of(structuredClone(config)));

    await TestBed.configureTestingModule({
      declarations: [XpLevelingPanelComponent],
      imports: [FormsModule],
      providers: [{ provide: ManagedServersService, useValue: service }]
    }).compileComponents();

    fixture = TestBed.createComponent(XpLevelingPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('guildId', '123');
    fixture.componentRef.setInput('channels', [
      { id: '10', name: 'level-up', type: 'text' },
      { id: '20', name: 'voz', type: 'voice' }
    ]);
    fixture.detectChanges();
  });

  it('loads config and requests the graph from the backend runtime instead of calculating the curve locally', () => {
    expect(service.getXp).toHaveBeenCalledWith('123');
    expect(service.simulateXp).toHaveBeenCalledWith('123', {
      progression: { k: 45, p: 2, b: 0 },
      levels: Array.from({ length: 101 }, (_, index) => index + 1)
    });
    expect(component.point(50)?.totalXp).toBe(5000);
    expect(component.graphPolyline()).not.toBe('');
  });

  it('exposes readable level and XP reference ticks for the progression graph', () => {
    expect(component.graphLevelTicks).toEqual([1, 10, 25, 50, 75, 100]);
    expect(component.graphXpTicks().map(tick => tick.value)).toEqual([0, 2500, 5000, 7500, 10000]);
    expect(component.graphLevelX(1)).toBeLessThan(component.graphLevelX(100));
    expect(component.graphXpY(10000)).toBeLessThan(component.graphXpY(0));
  });

  it('renders the progression formula and contextual help for configurable fields', () => {
    fixture.detectChanges();

    const formula = fixture.nativeElement.querySelector('.formula-expression') as HTMLElement;
    const tooltips = fixture.nativeElement.querySelectorAll('.info-tooltip');

    expect(formula.textContent).toContain('k × n');
    expect(formula.textContent).toContain('b × n');
    expect(tooltips.length).toBeGreaterThan(10);
  });

  it('requires a fresh backend simulation after progression changes before save', () => {
    component.draft!.progression.k = 90;
    component.onDraftChanged();

    expect(component.dirty).toBeTrue();
    expect(component.simulationStale).toBeTrue();
    expect(component.canSave).toBeFalse();

    service.simulateXp.and.returnValue(of({
      ...structuredClone(simulation),
      progression: { k: 90, p: 2, b: 0 },
      points: simulation.points.map(point => ({ ...point, totalXp: point.totalXp * 2 }))
    }));
    component.simulate();

    expect(component.simulationStale).toBeFalse();
    expect(component.canSave).toBeTrue();
    expect(service.simulateXp.calls.mostRecent().args[0]).toBe('123');
  });

  it('keeps simulation stale when progression changes again before the response returns', () => {
    const pendingSimulation = new Subject<XpSimulationResponse>();
    component.draft!.progression.k = 90;
    component.onDraftChanged();
    service.simulateXp.and.returnValue(pendingSimulation.asObservable());

    component.simulate();

    component.draft!.progression.k = 120;
    component.onDraftChanged();
    pendingSimulation.next({
      ...structuredClone(simulation),
      progression: { k: 90, p: 2, b: 0 }
    });
    pendingSimulation.complete();

    expect(component.draft!.progression.k).toBe(120);
    expect(component.simulation?.progression.k).toBe(90);
    expect(component.simulationStale).toBeTrue();
    expect(component.canSave).toBeFalse();
  });

  it('presents the voice social bonus as a percentage while preserving the runtime fraction', () => {
    component.draft!.voice.socialBonusPct = 0.2;

    expect(component.voiceSocialBonusPercent).toBe(20);

    component.setVoiceSocialBonusPercent(25);

    expect(component.draft!.voice.socialBonusPct).toBe(0.25);
    expect(component.dirty).toBeTrue();
  });

  it('shows impact using only baseline and backend-simulated points', () => {
    component.draft!.progression.k = 90;
    component.onDraftChanged();
    service.simulateXp.and.returnValue(of({
      ...structuredClone(simulation),
      progression: { k: 90, p: 2, b: 0 },
      points: simulation.points.map(point => ({
        ...point,
        totalXp: point.totalXp * 2
      }))
    }));

    component.simulate();

    expect(component.impactPercent(50)).toBe(100);
    expect(component.significantCurveImpact).toBeTrue();
  });

  it('saves only editable runtime fields and never sends legacy combo as an active policy', () => {
    component.draft!.text.baseMin = 10;
    component.onDraftChanged();

    component.save();

    const request = service.updateXp.calls.mostRecent().args[1];
    expect(request.text.baseMin).toBe(10);
    expect((request.advanced as unknown as Record<string, unknown>)['dailyCombo']).toBeUndefined();
    expect((request.advanced as unknown as Record<string, unknown>)['comboMultiplier']).toBeUndefined();
  });

  it('preserves edits made after save starts instead of replacing them with the response', () => {
    const pendingSave = new Subject<XpConfigResponse>();
    component.draft!.text.baseMin = 10;
    component.onDraftChanged();
    service.updateXp.and.returnValue(pendingSave.asObservable());

    component.save();

    component.draft!.text.baseMax = 20;
    component.onDraftChanged();
    pendingSave.next({
      ...structuredClone(config),
      text: { ...config.text, baseMin: 10 }
    });
    pendingSave.complete();

    expect(component.persisted!.text.baseMin).toBe(10);
    expect(component.persisted!.text.baseMax).toBe(16);
    expect(component.draft!.text.baseMax).toBe(20);
    expect(component.dirty).toBeTrue();
    expect(component.saveMessage).toContain('continuam não salvas');
  });

  it('keeps a committed save successful when API reports runtime refresh pending', () => {
    component.draft!.text.baseMin = 10;
    component.onDraftChanged();
    service.updateXp.and.returnValue(of({
      ...structuredClone(config),
      text: { ...config.text, baseMin: 10 },
      runtimeRefreshPending: true
    }));

    component.save();

    expect(component.dirty).toBeFalse();
    expect(component.saveMessage).toContain('Configuração salva');
    expect(component.saveMessage).toContain('não confirmou');
  });

  it('ignores a stale guild response after the input changes', () => {
    const oldConfig = new Subject<XpConfigResponse>();
    service.getXp.and.callFake((guildId: string) =>
      guildId === '123' ? oldConfig.asObservable() : of({ ...structuredClone(config), guildId: '456' })
    );

    component.guildId = '123';
    component.ngOnChanges({ guildId: {
      previousValue: '',
      currentValue: '123',
      firstChange: false,
      isFirstChange: () => false
    } });
    component.guildId = '456';
    component.ngOnChanges({ guildId: {
      previousValue: '123',
      currentValue: '456',
      firstChange: false,
      isFirstChange: () => false
    } });

    oldConfig.next(structuredClone(config));
    oldConfig.complete();

    expect(component.guildId).toBe('456');
    expect(component.persisted?.guildId).toBe('456');
  });

  it('preserves the draft and exposes backend errors when simulation fails', () => {
    component.draft!.progression.k = 99;
    component.onDraftChanged();
    service.simulateXp.and.returnValue(throwError(() => ({ error: { message: 'Curva inválida' } })));

    component.simulate();

    expect(component.draft!.progression.k).toBe(99);
    expect(component.simulationError).toBe('Curva inválida');
    expect(component.simulationStale).toBeTrue();
  });

  it('filters level-up channel options to messageable channel types', () => {
    expect(component.messageChannels.map(channel => channel.id)).toEqual(['10']);
  });

  it('renders the configured legacy combo as informational rather than editable', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Combo legado');
    expect(fixture.nativeElement.textContent).toContain('não alimentam combo_count');
  });
});
