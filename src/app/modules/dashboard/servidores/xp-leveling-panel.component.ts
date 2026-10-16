import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Subscription, switchMap } from 'rxjs';

import {
  GuildChannel,
  ManagedServersService,
  XpConfigResponse,
  XpConfigUpdateRequest,
  XpProgressionConfig,
  XpSimulationPoint,
  XpSimulationResponse
} from '../../../core/services/managed-servers.service';

@Component({
  selector: 'app-xp-leveling-panel',
  standalone: false,
  templateUrl: './xp-leveling-panel.component.html',
  styleUrls: ['./xp-leveling-panel.component.scss']
})
export class XpLevelingPanelComponent implements OnChanges, OnDestroy {
  @Input() guildId = '';
  @Input() channels: GuildChannel[] = [];
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();

  persisted?: XpConfigResponse;
  draft?: XpConfigResponse;
  baselineSimulation?: XpSimulationResponse;
  simulation?: XpSimulationResponse;

  loading = false;
  simulating = false;
  saving = false;
  error = '';
  saveMessage = '';
  simulationError = '';
  simulationStale = false;
  advancedOpen = false;

  readonly milestones = [1, 5, 10, 25, 50, 75, 100];
  readonly graphLevelTicks = [1, 10, 25, 50, 75, 100];
  private readonly graphXpTickRatios = [0, 0.25, 0.5, 0.75, 1];
  private readonly graphLeft = 72;
  private readonly graphRight = 588;
  private readonly graphTop = 16;
  private readonly graphBottom = 170;
  private readonly simulationLevels = Array.from({ length: 101 }, (_, index) => index + 1);
  private generation = 0;
  private subscription?: Subscription;
  private lastSimulatedProgression = '';

  constructor(private readonly servers: ManagedServersService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId'] && this.guildId) this.load();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.dirtyChange.emit(false);
    this.savingChange.emit(false);
  }

  get messageChannels(): GuildChannel[] {
    return this.channels.filter(channel => channel.type === 'text' || channel.type === 'news');
  }

  get voiceSocialBonusPercent(): number {
    return (this.draft?.voice.socialBonusPct ?? 0) * 100;
  }

  setVoiceSocialBonusPercent(value: number): void {
    if (!this.draft) return;
    this.draft.voice.socialBonusPct = Number(value) / 100;
    this.onDraftChanged();
  }

  get dirty(): boolean {
    return !!this.persisted && !!this.draft
      && JSON.stringify(this.toUpdateRequest(this.persisted)) !== JSON.stringify(this.toUpdateRequest(this.draft));
  }

  get canSave(): boolean {
    return !!this.draft && this.dirty && !this.saving && !this.simulating && !this.simulationStale;
  }

  get reconciliationMessage(): string | null {
    if (!this.persisted?.reconciliation.required) return null;
    return 'A curva foi alterada e o Coddy está reconciliando os níveis armazenados. O XP total dos membros não será alterado.';
  }

  onDraftChanged(): void {
    this.saveMessage = '';
    this.error = '';
    this.simulationStale = this.progressionSnapshot(this.draft?.progression) !== this.lastSimulatedProgression;
    this.dirtyChange.emit(this.dirty);
  }

  simulate(): void {
    if (!this.draft || !this.guildId || this.simulating) return;
    const guildId = this.guildId;
    const generation = this.generation;
    const submittedProgression = structuredClone(this.draft.progression);
    const submittedSnapshot = this.progressionSnapshot(submittedProgression);
    this.simulating = true;
    this.simulationError = '';

    this.servers.simulateXp(guildId, {
      progression: submittedProgression,
      levels: this.simulationLevels
    }).subscribe({
      next: response => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.simulation = response;
        this.lastSimulatedProgression = submittedSnapshot;
        this.simulationStale = this.progressionSnapshot(this.draft?.progression) !== submittedSnapshot;
        this.simulating = false;
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.simulating = false;
        this.simulationError = error?.error?.message || 'Não foi possível simular a curva no Coddy.';
      }
    });
  }

  save(): void {
    if (!this.draft || !this.canSave) return;
    const guildId = this.guildId;
    const generation = this.generation;
    const submittedRequest = this.toUpdateRequest(this.draft);
    const submittedSimulation = this.simulation ? structuredClone(this.simulation) : undefined;
    this.saving = true;
    this.savingChange.emit(true);
    this.error = '';
    this.saveMessage = '';

    this.servers.updateXp(guildId, submittedRequest).subscribe({
      next: response => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        const currentDraft = this.draft ? structuredClone(this.draft) : undefined;
        const editedWhileSaving = !!currentDraft
          && JSON.stringify(this.toUpdateRequest(currentDraft)) !== JSON.stringify(submittedRequest);

        this.persisted = structuredClone(response);
        this.baselineSimulation = submittedSimulation ?? this.baselineSimulation;
        this.lastSimulatedProgression = this.progressionSnapshot(response.progression);

        if (editedWhileSaving && currentDraft) {
          this.draft = currentDraft;
          this.simulationStale = this.progressionSnapshot(currentDraft.progression) !== this.lastSimulatedProgression;
        } else {
          this.draft = structuredClone(response);
          this.simulationStale = false;
        }

        this.saving = false;
        this.savingChange.emit(false);
        this.dirtyChange.emit(this.dirty);
        const refreshMessage = response.runtimeRefreshPending
          ? 'Configuração salva. O Coddy não confirmou a atualização do cache agora; um novo salvar tentará novamente e o TTL continua como fallback.'
          : 'Configuração salva e atualização do runtime solicitada.';
        this.saveMessage = editedWhileSaving
          ? `${refreshMessage} Suas alterações mais recentes continuam não salvas.`
          : refreshMessage;
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.saving = false;
        this.savingChange.emit(false);
        this.error = error?.error?.message || 'Não foi possível salvar a configuração de XP.';
      }
    });
  }

  resetDraft(): void {
    if (!this.persisted) return;
    this.draft = structuredClone(this.persisted);
    this.simulation = this.baselineSimulation ? structuredClone(this.baselineSimulation) : undefined;
    this.lastSimulatedProgression = this.progressionSnapshot(this.draft.progression);
    this.simulationStale = false;
    this.error = '';
    this.saveMessage = '';
    this.dirtyChange.emit(false);
  }

  point(level: number, source = this.simulation): XpSimulationPoint | undefined {
    return source?.points.find(point => point.level === level);
  }

  baselinePoint(level: number): XpSimulationPoint | undefined {
    return this.point(level, this.baselineSimulation);
  }

  impactPercent(level: number): number | null {
    const before = this.baselinePoint(level)?.totalXp;
    const after = this.point(level)?.totalXp;
    if (before == null || after == null || before === 0) return null;
    return Math.round(((after - before) / before) * 100);
  }

  get significantCurveImpact(): boolean {
    return this.milestones.some(level => Math.abs(this.impactPercent(level) ?? 0) >= 50);
  }

  graphPolyline(): string {
    const points = this.graphPoints();
    if (!points.length) return '';
    return points.map(point => {
      const x = this.graphLevelX(point.level);
      const y = this.graphXpY(point.totalXp);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  graphLevelX(level: number): number {
    const points = this.graphPoints();
    const maxLevel = Math.max(...points.map(point => point.level), 1);
    const width = this.graphRight - this.graphLeft;
    return this.graphLeft + (Math.max(level, 0) / maxLevel) * width;
  }

  graphXpY(value: number): number {
    const height = this.graphBottom - this.graphTop;
    return this.graphBottom - (Math.max(value, 0) / this.graphMaxXp()) * height;
  }

  graphXpTicks(): Array<{ value: number; y: number }> {
    const maxXp = this.graphMaxXp();
    return this.graphXpTickRatios.map(ratio => ({
      value: Math.round(maxXp * ratio),
      y: this.graphBottom - ratio * (this.graphBottom - this.graphTop)
    }));
  }

  private graphMaxXp(): number {
    const points = this.graphPoints();
    return Math.max(...points.map(point => point.totalXp), 1);
  }

  private graphPoints(): XpSimulationPoint[] {
    return (this.simulation?.points ?? []).filter(point => point.level <= 100);
  }

  formatXp(value: number | undefined): string {
    return value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value);
  }

  levelUpPreview(): string {
    const template = this.draft?.levelUp.message?.trim()
      || '🎉 {member} subiu do nível **{old_level}** para o **{new_level}**!';
    const replacements: Record<string, string> = {
      '{user}': '@Nick',
      '{member}': '@Nick',
      '{username}': 'Nick',
      '{old_level}': '9',
      '{last_level}': '9',
      '{previous_level}': '9',
      '{new_level}': '10',
      '{actual_level}': '10',
      '{level}': '10'
    };
    return Object.entries(replacements).reduce(
      (result, [placeholder, value]) => result.split(placeholder).join(value),
      template
    );
  }

  private load(): void {
    const guildId = this.guildId;
    const generation = ++this.generation;
    this.subscription?.unsubscribe();
    this.loading = true;
    this.error = '';
    this.saveMessage = '';
    this.simulationError = '';
    this.persisted = undefined;
    this.draft = undefined;
    this.simulation = undefined;
    this.baselineSimulation = undefined;
    this.dirtyChange.emit(false);

    this.subscription = this.servers.getXp(guildId).pipe(
      switchMap(config => {
        if (guildId !== this.guildId || generation !== this.generation) {
          throw new Error('stale-xp-load');
        }
        this.persisted = structuredClone(config);
        this.draft = structuredClone(config);
        return this.servers.simulateXp(guildId, {
          progression: structuredClone(config.progression),
          levels: this.simulationLevels
        });
      })
    ).subscribe({
      next: simulation => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.baselineSimulation = structuredClone(simulation);
        this.simulation = structuredClone(simulation);
        this.lastSimulatedProgression = this.progressionSnapshot(this.draft?.progression);
        this.simulationStale = false;
        this.loading = false;
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.loading = false;
        if (error?.message !== 'stale-xp-load') {
          this.error = error?.error?.message || 'Não foi possível carregar a configuração de XP.';
        }
      }
    });
  }

  private progressionSnapshot(progression?: XpProgressionConfig): string {
    return progression ? JSON.stringify(progression) : '';
  }

  private toUpdateRequest(config: XpConfigResponse): XpConfigUpdateRequest {
    return {
      text: structuredClone(config.text),
      voice: structuredClone(config.voice),
      progression: structuredClone(config.progression),
      limits: structuredClone(config.limits),
      levelUp: structuredClone(config.levelUp),
      advanced: {
        clearOnExit: config.advanced.clearOnExit,
        multiplier: config.advanced.multiplier
      }
    };
  }
}
