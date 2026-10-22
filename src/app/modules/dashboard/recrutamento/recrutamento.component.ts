import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CommunityContextService } from '../../../core/services/community-context.service';
import {
  RecruitmentDraft, RecruitmentForm, RecruitmentOption, RecruitmentProcess,
  RecruitmentQuestion, RecruitmentQuestionType, RecruitmentStage,
  RecruitmentStageDefinition, RecruitmentStageType, RecruitmentDraftsService
} from '../../../core/services/recruitment-drafts.service';

type FormAudience = 'candidate' | 'staff';

@Component({
  selector: 'app-recrutamento',
  standalone: false,
  templateUrl: './recrutamento.component.html'
})
export class RecrutamentoComponent implements OnInit, OnDestroy {
  readonly stageTypes: { value: RecruitmentStageType; label: string }[] = [
    { value: 'APPLICATION', label: 'Inscrição' },
    { value: 'ANALYSIS', label: 'Análise' },
    { value: 'HUMAN_EVALUATION', label: 'Avaliação humana' },
    { value: 'AUTO_EVALUATION', label: 'Avaliação automática' },
    { value: 'INTERVIEW', label: 'Entrevista' },
    { value: 'DECISION', label: 'Decisão' },
    { value: 'CUSTOM', label: 'Personalizada' }
  ];

  readonly questionTypes: { value: RecruitmentQuestionType; label: string }[] = [
    { value: 'SHORT_TEXT', label: 'Texto curto' },
    { value: 'LONG_TEXT', label: 'Texto longo' },
    { value: 'SINGLE_CHOICE', label: 'Escolha única' },
    { value: 'MULTIPLE_CHOICE', label: 'Múltipla escolha' },
    { value: 'YES_NO', label: 'Sim ou não' },
    { value: 'NUMBER', label: 'Número' },
    { value: 'SCALE', label: 'Escala' },
    { value: 'DATE', label: 'Data' },
    { value: 'LINK', label: 'Link' },
    { value: 'CONSENT', label: 'Aceite' }
  ];

  communityId: number | null = null;
  processes: RecruitmentProcess[] = [];
  process: RecruitmentDraft | null = null;
  selectedStage: RecruitmentStageDefinition | null = null;
  audience: FormAudience = 'candidate';
  newTitle = '';
  newDescription = '';
  newStageInternal = '';
  newStagePublic = '';
  newStageType: RecruitmentStageType = 'APPLICATION';
  loading = false;
  busy = false;
  error = '';
  notice = '';
  removeStageId: number | null = null;

  private readonly destroyed$ = new Subject<void>();
  private generation = 0;
  private questionSequence = 0;

  constructor(
    private readonly context: CommunityContextService,
    private readonly recruitment: RecruitmentDraftsService
  ) {}

  ngOnInit(): void {
    this.context.state$.pipe(takeUntil(this.destroyed$)).subscribe(state => {
      const id = state.status === 'ready'
        && this.context.canAccessFeature('recrutamento', state)
        ? state.activeCommunity?.communityId ?? null : null;
      if (id === this.communityId) return;
      this.communityId = id;
      this.generation++;
      this.process = null;
      this.selectedStage = null;
      this.processes = [];
      this.busy = false;
      this.loading = false;
      this.removeStageId = null;
      this.error = '';
      this.notice = '';
      if (id !== null) this.loadProcesses();
    });
  }

  ngOnDestroy(): void {
    this.generation++;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  get canEdit(): boolean {
    return !this.busy && this.process?.process.status === 'DRAFT';
  }

  get isAutomatic(): boolean {
    return this.selectedStage?.stageType === 'AUTO_EVALUATION';
  }

  get activeQuestions(): RecruitmentQuestion[] {
    if (!this.selectedStage) return [];
    return this.audience === 'candidate'
      ? this.ensureForm('candidate').questions
      : this.ensureForm('staff').questions;
  }

  get availableQuestionTypes(): { value: RecruitmentQuestionType; label: string }[] {
    return this.audience === 'candidate' && this.isAutomatic
      ? this.questionTypes.filter(t => ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO', 'NUMBER', 'SCALE'].includes(t.value))
      : this.questionTypes;
  }

  loadProcesses(): void {
    const id = this.communityId;
    if (id === null) return;
    const requestGeneration = ++this.generation;
    this.loading = true;
    this.recruitment.list(id).pipe(takeUntil(this.destroyed$)).subscribe({
      next: processes => {
        if (requestGeneration !== this.generation) return;
        this.processes = processes;
        this.loading = false;
      },
      error: error => {
        if (requestGeneration !== this.generation) return;
        this.loading = false;
        this.error = error?.status === 404
          ? 'O módulo de seleção ainda não está habilitado nesta Community.'
          : 'Não foi possível consultar os processos seletivos.';
      }
    });
  }

  createProcess(): void {
    const id = this.communityId;
    if (id === null || this.busy || !this.newTitle.trim()) return;
    this.busy = true;
    this.error = '';
    const current = this.generation;
    this.recruitment.create(id, this.newTitle.trim(), this.newDescription.trim() || null)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: created => {
          if (current !== this.generation) return;
          this.busy = false;
          this.newTitle = '';
          this.newDescription = '';
          this.processes = [created, ...this.processes];
          this.openProcess(created.id);
        },
        error: error => {
          if (current !== this.generation) return;
          this.busy = false;
          this.error = this.apiError(error);
        }
      });
  }

  openProcess(processId: number): void {
    const id = this.communityId;
    if (id === null) return;
    this.selectedStage = null;
    this.process = null;
    this.error = '';
    const current = ++this.generation;
    this.loading = true;
    this.recruitment.detail(id, processId).pipe(takeUntil(this.destroyed$)).subscribe({
      next: result => {
        if (current !== this.generation) return;
        this.process = result;
        this.loading = false;
      },
      error: error => {
        if (current !== this.generation) return;
        this.error = this.apiError(error);
        this.loading = false;
      }
    });
  }

  addStage(): void {
    if (!this.canEdit || !this.newStageInternal.trim() || !this.newStagePublic.trim()
        || this.communityId === null || !this.process) return;
    const communityId = this.communityId;
    const processId = this.process.process.id;
    this.busy = true;
    this.error = '';
    const current = this.generation;
    this.recruitment.appendStage(communityId, processId,
      this.newStageInternal.trim(), this.newStagePublic.trim(), this.newStageType)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: stage => {
          if (current !== this.generation || !this.process) return;
          this.busy = false;
          this.process.stages.push(stage);
          this.newStageInternal = '';
          this.newStagePublic = '';
          this.openStage(stage);
        },
        error: error => {
          if (current !== this.generation) return;
          this.busy = false;
          this.error = this.apiError(error);
        }
      });
  }

  openStage(stage: RecruitmentStage): void {
    if (!this.process || this.communityId === null) return;
    const communityId = this.communityId;
    const processId = this.process.process.id;
    const current = ++this.generation;
    this.selectedStage = null;
    this.removeStageId = null;
    this.loading = true;
    this.error = '';
    this.recruitment.definition(communityId, processId, stage.id)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: result => {
          if (current !== this.generation) return;
          this.selectedStage = JSON.parse(JSON.stringify(result)) as RecruitmentStageDefinition;
          this.questionSequence = Date.now();
          this.audience = 'candidate';
          this.loading = false;
        },
        error: error => {
          if (current !== this.generation) return;
          this.loading = false;
          this.error = this.apiError(error);
        }
      });
  }

  setAudience(audience: FormAudience): void {
    this.audience = audience;
  }

  addQuestion(): void {
    if (!this.canEdit || !this.selectedStage) return;
    const auto = this.audience === 'candidate' && this.isAutomatic;
    const type: RecruitmentQuestionType = auto ? 'SINGLE_CHOICE' : 'LONG_TEXT';
    const question: RecruitmentQuestion = {
      id: this.nextId('question'),
      label: '',
      type,
      required: true,
      options: auto
        ? [{ id: 'a', label: 'Alternativa A' }, { id: 'b', label: 'Alternativa B' }] : [],
      minValue: null,
      maxValue: null,
      points: auto ? 1 : null,
      correctAnswers: auto ? ['a'] : []
    };
    this.ensureForm(this.audience).questions.push(question);
  }

  deleteQuestion(index: number): void {
    if (!this.canEdit) return;
    this.activeQuestions.splice(index, 1);
  }

  moveQuestion(index: number, delta: number): void {
    const next = index + delta;
    const questions = this.activeQuestions;
    if (!this.canEdit || next < 0 || next >= questions.length) return;
    [questions[index], questions[next]] = [questions[next], questions[index]];
  }

  questionTypeChanged(question: RecruitmentQuestion): void {
    const choice = this.isChoice(question);
    question.options = choice
      ? [{ id: 'a', label: 'Alternativa A' }, { id: 'b', label: 'Alternativa B' }] : [];
    question.minValue = question.type === 'SCALE' ? 1 : null;
    question.maxValue = question.type === 'SCALE' ? 5 : null;
    const auto = this.audience === 'candidate' && this.isAutomatic;
    question.points = auto ? 1 : null;
    question.correctAnswers = auto
      ? [choice ? 'a' : question.type === 'YES_NO' ? 'true' : '1'] : [];
  }

  isChoice(question: RecruitmentQuestion): boolean {
    return question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE';
  }

  addOption(question: RecruitmentQuestion): void {
    if (!this.canEdit || question.options.length >= 20) return;
    const existing = new Set(question.options.map(option => option.id));
    let n = 1;
    while (existing.has(`option_${n}`)) n++;
    question.options.push({ id: `option_${n}`, label: '' });
  }

  removeOption(question: RecruitmentQuestion, option: RecruitmentOption): void {
    if (!this.canEdit || question.options.length <= 2) return;
    question.options = question.options.filter(item => item.id !== option.id);
    question.correctAnswers = question.correctAnswers.filter(id => id !== option.id);
  }

  isCorrect(question: RecruitmentQuestion, answer: string): boolean {
    return question.correctAnswers.includes(answer);
  }

  setCorrect(question: RecruitmentQuestion, answer: string, checked: boolean): void {
    if (question.type === 'MULTIPLE_CHOICE') {
      question.correctAnswers = checked
        ? [...new Set([...question.correctAnswers, answer])]
        : question.correctAnswers.filter(value => value !== answer);
    } else {
      question.correctAnswers = checked ? [answer] : [];
    }
  }

  saveStage(): void {
    if (!this.canEdit || !this.selectedStage || !this.process || this.communityId === null) return;
    const communityId = this.communityId;
    const processId = this.process.process.id;
    const stageId = this.selectedStage.id;
    const definition: RecruitmentStageDefinition = JSON.parse(JSON.stringify(this.selectedStage));
    this.busy = true;
    this.error = '';
    this.notice = '';
    const current = this.generation;
    this.recruitment.saveStage(communityId, processId, stageId, {
      internalName: definition.internalName.trim(),
      publicName: definition.publicName.trim(),
      stageType: definition.stageType,
      candidateForm: definition.candidateForm,
      staffForm: definition.staffForm
    }).pipe(takeUntil(this.destroyed$)).subscribe({
      next: updated => {
        if (current !== this.generation || !this.process) return;
        this.selectedStage = updated;
        const item = this.process.stages.find(stage => stage.id === stageId);
        if (item) {
          item.publicName = updated.publicName;
          item.internalName = updated.internalName;
          item.stageType = updated.stageType;
        }
        this.busy = false;
        this.notice = 'Etapa e formulários salvos no rascunho.';
      },
      error: error => {
        if (current !== this.generation) return;
        this.busy = false;
        this.error = this.apiError(error);
      }
    });
  }

  moveStage(index: number, delta: number): void {
    if (!this.canEdit || !this.process || this.communityId === null) return;
    const stages = this.process.stages;
    const next = index + delta;
    if (next < 0 || next >= stages.length) return;
    const ordered = [...stages];
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    this.busy = true;
    this.error = '';
    const current = this.generation;
    this.recruitment.reorder(this.communityId, this.process.process.id, ordered.map(stage => stage.id))
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: updated => {
          if (current !== this.generation || !this.process) return;
          this.process.stages = updated;
          this.busy = false;
        },
        error: error => {
          if (current !== this.generation) return;
          this.busy = false;
          this.error = this.apiError(error);
        }
      });
  }

  deleteStage(stageId: number): void {
    if (!this.canEdit || !this.process || this.communityId === null || this.removeStageId !== stageId) return;
    this.busy = true;
    this.error = '';
    const current = this.generation;
    this.recruitment.removeStage(this.communityId, this.process.process.id, stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: () => {
          if (current !== this.generation || !this.process) return;
          this.process.stages = this.process.stages.filter(stage => stage.id !== stageId)
            .map((stage, index) => ({ ...stage, position: index + 1 }));
          if (this.selectedStage?.id === stageId) this.selectedStage = null;
          this.removeStageId = null;
          this.busy = false;
        },
        error: error => {
          if (current !== this.generation) return;
          this.busy = false;
          this.error = this.apiError(error);
        }
      });
  }

  private ensureForm(audience: FormAudience): RecruitmentForm {
    if (!this.selectedStage) return { questions: [] };
    const existing = audience === 'candidate'
      ? this.selectedStage.candidateForm : this.selectedStage.staffForm;
    if (existing) return existing;
    const created: RecruitmentForm = { questions: [] };
    if (audience === 'candidate') this.selectedStage.candidateForm = created;
    else this.selectedStage.staffForm = created;
    return created;
  }

  private nextId(prefix: string): string {
    this.questionSequence++;
    return `${prefix}_${this.questionSequence}`;
  }

  private apiError(error: { error?: { message?: string }; status?: number }): string {
    if (error.status === 403) return 'Você não tem permissão para editar esta seleção.';
    if (error.status === 404) return 'Processo ou etapa indisponível nesta Community.';
    if (error.status === 409) return 'O rascunho foi alterado ou esta etapa não pode mais ser editada.';
    return error.error?.message || 'Não foi possível salvar. Confira perguntas, alternativas e gabaritos.';
  }
}
