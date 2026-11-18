import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, Subject, takeUntil, distinctUntilChanged } from 'rxjs';
import {
  CreatorArtType, CreatorStageDefinition, CreatorStepDraft,
  CreatorGlobalWorkflow, CreatorStudioService, CreatorWorkflow, CreatorWorkflowDraft
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';

/**
 * Pro catalog: a small configuration page, independent of the selected
 * Community. All validation/ownership/entitlement is enforced again in API.
 */
@Component({
  selector: 'app-creator-production',
  standalone: false,
  templateUrl: './creator-production.component.html'
})
export class CreatorProductionComponent implements OnInit, OnDestroy {
  loading = true;
  catalogLoading = false;
  allowed = false;
  error = '';
  notice = '';
  busy = false;
  artTypes: CreatorArtType[] = [];
  definitions: CreatorStageDefinition[] = [];
  workflows: CreatorWorkflow[] = [];
  globalWorkflows: CreatorGlobalWorkflow[] = [];
  importedGlobalId: number | null = null;
  section: 'home' | 'arts' | 'processes' = 'home';
  typeFormOpen = false;
  typeAdvancedOpen = false;
  workflowFormOpen = false;
  workflowEditorStep: 1 | 2 = 1;
  showStepLibrary = false;
  expandedGlobalId: number | null = null;

  definitionName = '';
  editingTypeId: number | null = null;
  typeName = '';
  typeWorkflowId: number | null = null;

  editingWorkflowId: number | null = null;
  workflow: CreatorWorkflowDraft = this.emptyWorkflow();

  private accountSequence = 0;
  private dataSequence = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly studio: CreatorStudioService,
    private readonly users: UserService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Separate URLs keep each job focused while sharing the same catalog API.
    this.route.data.pipe(takeUntil(this.destroy$)).subscribe(data => {
      const requested = data['section'];
      this.section = requested === 'arts' || requested === 'processes' ? requested : 'home';
      this.resetType();
      this.resetWorkflow();
      this.showStepLibrary = false;
      this.expandedGlobalId = null;
    });

    this.users.user$
      .pipe(distinctUntilChanged((a, b) => a?.id === b?.id), takeUntil(this.destroy$))
      .subscribe(user => {
        const seq = ++this.accountSequence;
        this.dataSequence++;
        this.loading = user != null;
        this.allowed = false;
        this.error = '';
        this.notice = '';
        this.busy = false;
        this.artTypes = [];
        this.definitions = [];
        this.workflows = [];
        this.globalWorkflows = [];
        this.importedGlobalId = null;
        this.showStepLibrary = false;
        this.expandedGlobalId = null;
        this.definitionName = '';
        this.resetType();
        this.resetWorkflow();
        if (!user) {
          this.error = 'Entre na sua conta para acessar o Studio.';
          return;
        }
        const userId = user.id;
        this.studio.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
          next: access => {
            if (seq !== this.accountSequence || this.users.getUser()?.id !== userId) return;
            this.loading = false;
            this.allowed = access.allowed && access.tier === 'PRO';
            if (this.allowed) this.reload();
          },
          error: () => {
            if (seq !== this.accountSequence || this.users.getUser()?.id !== userId) return;
            this.loading = false;
            this.error = 'Não foi possível verificar seu acesso. Tente novamente.';
          }
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reload(): void {
    if (!this.allowed) return;
    const seq = ++this.dataSequence;
    const userId = this.users.getUser()?.id;
    this.catalogLoading = true;
    forkJoin({
      artTypes: this.studio.artTypes(),
      definitions: this.studio.stageDefinitions(),
      workflows: this.studio.workflows(),
      globalWorkflows: this.studio.globalWorkflows()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (seq !== this.dataSequence || this.users.getUser()?.id !== userId) return;
        this.artTypes = result.artTypes;
        this.definitions = result.definitions;
        this.workflows = result.workflows;
        this.globalWorkflows = result.globalWorkflows;
        this.catalogLoading = false;
      },
      error: () => {
        if (seq !== this.dataSequence || this.users.getUser()?.id !== userId) return;
        this.catalogLoading = false;
        this.error = 'Não foi possível carregar tipos de arte e etapas.';
      }
    });
  }

  adoptGlobalWorkflow(template: CreatorGlobalWorkflow): void {
    if (!this.allowed || this.busy || !template.active || template.steps.length === 0) return;
    this.importedGlobalId = template.id;
    this.run(() => this.studio.importGlobalWorkflow(template.id, this.workflows.length === 0),
      () => {
        this.importedGlobalId = null;
        this.notice = 'Modelo copiado para sua conta. Agora você pode personalizar as etapas sem alterar o original.';
      },
      () => {
        this.importedGlobalId = null;
        this.error = 'Não foi possível copiar este modelo. Se já existir um modelo seu com esse nome, renomeie-o primeiro.';
      });
  }

  workflowName(id: number | null): string {
    return this.workflows.find(w => w.id === id)?.name || 'Sem modelo associado';
  }

  addDefinition(): void {
    const name = this.definitionName.trim();
    if (!this.allowed || this.busy || !name) return;
    this.run(() => this.studio.createStageDefinition(name), () => {
      this.definitionName = '';
      this.notice = 'Etapa reutilizável cadastrada.';
    });
  }

  startType(): void {
    this.resetType();
    this.typeFormOpen = true;
  }

  editType(type: CreatorArtType): void {
    this.typeFormOpen = true;
    this.typeAdvancedOpen = type.workflowId !== null;
    this.editingTypeId = type.id;
    this.typeName = type.name;
    this.typeWorkflowId = type.workflowId;
  }

  resetType(): void {
    this.typeFormOpen = false;
    this.typeAdvancedOpen = false;
    this.editingTypeId = null;
    this.typeName = '';
    this.typeWorkflowId = null;
  }

  saveType(): void {
    const name = this.typeName.trim();
    if (!this.allowed || this.busy || !name) return;
    const operation = this.editingTypeId === null
      ? () => this.studio.createArtType(name, this.typeWorkflowId)
      : () => this.studio.updateArtType(this.editingTypeId!, name, this.typeWorkflowId);
    this.run(operation, () => {
      this.resetType();
      this.notice = 'Tipo de arte salvo.';
    });
  }

  startWorkflow(): void {
    this.resetWorkflow();
    this.workflowFormOpen = true;
  }

  editWorkflow(source: CreatorWorkflow): void {
    this.workflowFormOpen = true;
    this.workflowEditorStep = 1;
    this.editingWorkflowId = source.id;
    this.showStepLibrary = source.steps.some(step => step.stageDefinitionId !== null);
    this.workflow = {
      name: source.name,
      isDefault: source.isDefault,
      steps: source.steps.map(s => ({ name: s.name, stageDefinitionId: s.stageDefinitionId }))
    };
  }

  resetWorkflow(): void {
    this.workflowFormOpen = false;
    this.workflowEditorStep = 1;
    this.showStepLibrary = false;
    this.editingWorkflowId = null;
    this.workflow = this.emptyWorkflow();
  }

  nextWorkflowStep(): void {
    const name = this.workflow.name.trim();
    if (!name || name.length > 100) {
      this.error = 'Dê um nome de até 100 caracteres ao seu processo.';
      return;
    }
    this.error = '';
    this.workflowEditorStep = 2;
  }

  toggleGlobalDetails(id: number): void {
    this.expandedGlobalId = this.expandedGlobalId === id ? null : id;
  }

  addWorkflowStep(): void {
    if (this.workflow.steps.length >= 40) return;
    this.workflow.steps.push({ name: '', stageDefinitionId: null });
  }

  moveStep(index: number, offset: number): void {
    const next = index + offset;
    if (next < 0 || next >= this.workflow.steps.length) return;
    const [entry] = this.workflow.steps.splice(index, 1);
    this.workflow.steps.splice(next, 0, entry);
  }

  removeWorkflowStep(index: number): void {
    this.workflow.steps.splice(index, 1);
  }

  setSharedDefinition(step: CreatorStepDraft, id: number | null): void {
    step.stageDefinitionId = id;
    const definition = this.definitions.find(item => item.id === id);
    if (definition) step.name = definition.name;
  }

  saveWorkflow(): void {
    const name = this.workflow.name.trim();
    const steps = this.workflow.steps.map(step => ({
      name: step.name.trim(), stageDefinitionId: step.stageDefinitionId
    }));
    if (!this.allowed || this.busy || !name || name.length > 100 || steps.length > 40 ||
        steps.some(step => !step.name || step.name.length > 100)) {
      this.error = 'Dê um nome ao modelo e preencha cada etapa (máximo de 40).';
      return;
    }
    const input: CreatorWorkflowDraft = {
      name,
      isDefault: this.workflow.isDefault,
      steps
    };
    const id = this.editingWorkflowId;
    this.run(() => id === null
      ? this.studio.createWorkflow(input)
      : this.studio.updateWorkflow(id, input), () => {
      this.resetWorkflow();
      this.notice = 'Modelo de etapas salvo. Commissions existentes não foram alteradas.';
    });
  }

  private emptyWorkflow(): CreatorWorkflowDraft {
    return {name:'', isDefault:false, steps:[]};
  }

  private run<T>(operation: () => import('rxjs').Observable<T>, onSuccess: () => void,
                 onError?: () => void): void {
    const account = this.users.getUser()?.id;
    this.busy = true;
    this.error = '';
    this.notice = '';
    operation().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.users.getUser()?.id !== account) return;
        this.busy = false;
        onSuccess();
        this.reload();
      },
      error: () => {
        if (this.users.getUser()?.id !== account) return;
        this.busy = false;
        if (onError) onError();
        else this.error = 'Não foi possível salvar. Confira se o nome já existe e se as etapas pertencem à sua conta.';
      }
    });
  }
}
