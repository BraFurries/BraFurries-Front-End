import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CommunityContextService } from '../../../core/services/community-context.service';
import {
  CandidateApplicationForm, CandidateOpenProcess, CandidateQuestion,
  RecruitmentCandidatesService, SubmittedApplication
} from '../../../core/services/recruitment-candidates.service';

@Component({
  selector: 'app-inscricoes',
  standalone: false,
  templateUrl: './inscricoes.component.html'
})
export class InscricoesComponent implements OnInit, OnDestroy {
  communityId: number | null = null;
  processes: CandidateOpenProcess[] = [];
  selected: CandidateApplicationForm | null = null;
  answers: Record<string, unknown> = {};
  acceptedTerms = false;
  submitted: SubmittedApplication | null = null;
  loading = false;
  busy = false;
  error = '';

  private readonly destroyed$ = new Subject<void>();
  private generation = 0;

  constructor(
    private readonly context: CommunityContextService,
    private readonly candidates: RecruitmentCandidatesService
  ) {}

  ngOnInit(): void {
    this.context.state$.pipe(takeUntil(this.destroyed$)).subscribe(state => {
      const id = state.status === 'ready'
        && this.context.canAccessFeature('inscricoes', state)
        ? state.activeCommunity?.communityId ?? null : null;
      if (id === this.communityId) return;
      this.communityId = id;
      this.generation++;
      this.selected = null;
      this.processes = [];
      this.answers = {};
      this.submitted = null;
      this.acceptedTerms = false;
      this.loading = false;
      this.busy = false;
      this.error = '';
      if (id !== null) this.list();
    });
  }

  ngOnDestroy(): void {
    this.generation++;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  list(): void {
    if (this.communityId === null) return;
    const id = this.communityId;
    const current = ++this.generation;
    this.loading = true;
    this.error = '';
    this.candidates.list(id).pipe(takeUntil(this.destroyed$)).subscribe({
      next: processes => {
        if (current !== this.generation) return;
        this.processes = processes;
        this.loading = false;
      },
      error: error => {
        if (current !== this.generation) return;
        this.loading = false;
        this.error = this.errorMessage(error);
      }
    });
  }

  open(processId: number): void {
    if (this.communityId === null || this.busy) return;
    const id = this.communityId;
    const current = ++this.generation;
    this.selected = null;
    this.answers = {};
    this.submitted = null;
    this.acceptedTerms = false;
    this.error = '';
    this.loading = true;
    this.candidates.form(id, processId).pipe(takeUntil(this.destroyed$)).subscribe({
      next: value => {
        if (current !== this.generation) return;
        this.selected = value;
        this.loading = false;
      },
      error: error => {
        if (current !== this.generation) return;
        this.loading = false;
        this.error = this.errorMessage(error);
      }
    });
  }

  back(): void {
    this.selected = null;
    this.answers = {};
    this.submitted = null;
    this.acceptedTerms = false;
    this.error = '';
    this.list();
  }

  get canSubmit(): boolean {
    return this.communityId !== null && !this.busy && !!this.selected?.eligible
      && this.acceptedTerms && !this.submitted;
  }

  isMultipleSelected(question: CandidateQuestion, id: string): boolean {
    const value = this.answers[question.id];
    return Array.isArray(value) && value.includes(id);
  }

  toggleMultiple(question: CandidateQuestion, id: string, checked: boolean): void {
    const old = this.answers[question.id];
    const values: string[] = Array.isArray(old) ? [...old] : [];
    this.answers[question.id] = checked
      ? [...new Set([...values, id])] : values.filter(value => value !== id);
  }

  apply(): void {
    if (!this.canSubmit || !this.selected || this.communityId === null) return;
    const processId = this.selected.process.id;
    const hash = this.selected.termsHash;
    const communityId = this.communityId;
    const current = this.generation;
    this.busy = true;
    this.error = '';
    this.candidates.submit(communityId, processId, hash, { ...this.answers })
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: result => {
          if (current !== this.generation) return;
          this.submitted = result;
          this.busy = false;
          this.answers = {};
          this.acceptedTerms = false;
        },
        error: error => {
          if (current !== this.generation) return;
          this.busy = false;
          this.error = this.errorMessage(error);
        }
      });
  }

  private errorMessage(error: { status?: number }): string {
    if (error.status === 400) return 'Há respostas obrigatórias ausentes ou inválidas. Confira o formulário.';
    if (error.status === 403) return 'Você não atende aos requisitos desta seleção.';
    if (error.status === 404) return 'Esta seleção está indisponível ou você não é um membro elegível.';
    if (error.status === 409) return 'A seleção mudou ou já existe uma candidatura. Não reenviamos respostas automaticamente.';
    return 'Não foi possível consultar ou enviar a inscrição.';
  }
}
