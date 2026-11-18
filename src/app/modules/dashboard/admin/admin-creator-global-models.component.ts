import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, distinctUntilChanged, takeUntil } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import { CreatorGlobalWorkflow, CreatorGlobalWorkflowDraft } from '../../../core/services/creator-studio.service';
import { CreatorStudioPilotAdminService } from '../../../core/services/creator-studio-pilot-admin.service';
import { UserService } from '../../../core/services/user.service';

/** Platform-owned production templates. Community roles cannot grant access. */
@Component({
  selector: 'app-admin-creator-global-models',
  standalone: false,
  templateUrl: './admin-creator-global-models.component.html'
})
export class AdminCreatorGlobalModelsComponent implements OnInit, OnDestroy {
  checkingOwner = true;
  owner = false;
  globalModels: CreatorGlobalWorkflow[] = [];
  globalModel: CreatorGlobalWorkflowDraft = this.emptyGlobalModel();
  editingGlobalId: number | null = null;
  globalLoading = false;
  globalBusy = false;
  globalError = '';
  globalNotice = '';
  private globalSequence = 0;
  private accountId: number | null = null;
  private accountSequence = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly users: UserService,
    private readonly platform: PlatformAccessService,
    private readonly studio: CreatorStudioPilotAdminService
  ) {}

  ngOnInit(): void {
    this.users.user$.pipe(
      distinctUntilChanged((a, b) => a?.id === b?.id),
      takeUntil(this.destroy$)
    ).subscribe(user => {
      const seq = ++this.accountSequence;
      this.accountId = user?.id ?? null;
      this.invalidateGlobalModels();
      this.owner = false;
      this.checkingOwner = user !== null;
      if (!user) {
        this.globalError = 'Entre na sua conta para gerenciar modelos globais.';
        return;
      }
      const account = user.id;
      this.platform.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
        next: access => {
          if (!this.isCurrent(seq, account)) return;
          this.checkingOwner = false;
          this.owner = access.enabled && access.owner;
          if (this.owner) this.loadGlobalModels();
        },
        error: () => {
          if (!this.isCurrent(seq, account)) return;
          this.checkingOwner = false;
          this.globalError = 'Não foi possível verificar sua autorização.';
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emptyGlobalModel(): CreatorGlobalWorkflowDraft {
    return {name:'',description:'',active:true,steps:[]};
  }

  private invalidateGlobalModels(): void {
    this.globalSequence++;
    this.globalLoading = false;
    this.globalBusy = false;
    this.globalModels = [];
    this.globalError = '';
    this.globalNotice = '';
    this.editingGlobalId = null;
    this.globalModel = this.emptyGlobalModel();
  }

  loadGlobalModels(): void {
    if (!this.owner) return;
    const seq = ++this.globalSequence;
    const account = this.accountId;
    this.globalLoading = true;
    this.globalError = '';
    this.studio.globalWorkflows().pipe(takeUntil(this.destroy$)).subscribe({
      next: models => {
        if (!this.isCurrentAccount(account) || seq !== this.globalSequence) return;
        this.globalLoading = false;
        this.globalModels = models;
      },
      error: error => {
        if (!this.isCurrentAccount(account) || seq !== this.globalSequence) return;
        this.globalLoading = false;
        if (error instanceof HttpErrorResponse && error.status === 403) {
          this.handleError(error, 'Acesso negado à biblioteca global.');
        } else {
          this.globalError = 'Não foi possível carregar a biblioteca global.';
        }
      }
    });
  }

  resetGlobalModel(): void {
    if (this.globalBusy) return;
    this.globalModel = this.emptyGlobalModel();
    this.editingGlobalId = null;
    this.globalError = '';
  }

  editGlobalModel(source: CreatorGlobalWorkflow): void {
    if (!this.owner || this.globalBusy) return;
    this.editingGlobalId = source.id;
    this.globalModel = {
      name:source.name,
      description:source.description,
      active:source.active,
      steps:source.steps.map(step => step.name)
    };
    this.globalError = '';
    this.globalNotice = '';
  }

  trackByStepIndex(index: number): number { return index; }

  addGlobalStep(): void {
    if (!this.owner || this.globalBusy || this.globalModel.steps.length >= 40) return;
    this.globalModel.steps.push('');
  }

  moveGlobalStep(index: number, offset: number): void {
    const other = index + offset;
    if (this.globalBusy || other < 0 || other >= this.globalModel.steps.length) return;
    const [value] = this.globalModel.steps.splice(index,1);
    this.globalModel.steps.splice(other,0,value);
  }

  removeGlobalStep(index: number): void {
    if (this.globalBusy) return;
    this.globalModel.steps.splice(index,1);
  }

  saveGlobalModel(): void {
    if (!this.owner || this.globalBusy) return;
    const input: CreatorGlobalWorkflowDraft = {
      name:this.globalModel.name.trim(),
      description:this.globalModel.description.trim(),
      active:this.globalModel.active,
      steps:this.globalModel.steps.map(s => s.trim())
    };
    if (!input.name || input.name.length > 100 || input.description.length > 500 ||
        !input.steps.length || input.steps.length > 40 ||
        input.steps.some(step => !step || step.length > 100)) {
      this.globalError = 'Informe o nome, uma descrição de até 500 caracteres e de 1 a 40 etapas válidas.';
      return;
    }
    const account = this.accountId;
    const seq = ++this.globalSequence;
    const id = this.editingGlobalId;
    this.globalBusy = true;
    this.globalError = '';
    this.globalNotice = '';
    const request = id === null
      ? this.studio.createGlobalWorkflow(input)
      : this.studio.updateGlobalWorkflow(id,input);
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (!this.isCurrentAccount(account) || seq !== this.globalSequence) return;
        this.globalBusy = false;
        this.globalModel = this.emptyGlobalModel();
        this.editingGlobalId = null;
        this.globalNotice = 'Modelo global salvo. Cópias pessoais e trabalhos em andamento não foram alterados.';
        this.loadGlobalModels();
      },
      error: error => {
        if (!this.isCurrentAccount(account) || seq !== this.globalSequence) return;
        this.globalBusy = false;
        if (error instanceof HttpErrorResponse && error.status === 403) {
          this.handleError(error, 'Acesso negado aos modelos globais.');
        } else {
          this.globalError = error instanceof HttpErrorResponse && error.status === 409
            ? 'Já existe um modelo global com este nome.'
            : 'Não foi possível salvar o modelo global.';
        }
      }
    });
  }


  private isCurrent(seq: number, account: number): boolean {
    return this.accountSequence === seq && this.isCurrentAccount(account);
  }

  private isCurrentAccount(account: number | null): boolean {
    return account !== null && this.accountId === account &&
      this.users.getUser()?.id === account;
  }

  private handleError(error: unknown, message: string): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.owner = false;
      this.invalidateGlobalModels();
      this.globalError = 'Você não tem autorização para administrar modelos globais.';
      return;
    }
    this.globalError = message;
  }
}
