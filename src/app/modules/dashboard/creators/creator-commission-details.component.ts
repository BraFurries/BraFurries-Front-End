import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, forkJoin, Observable, Subject, takeUntil } from 'rxjs';
import {
  CreatorActivity, CreatorActivityDraft, CreatorActivityKind,
  CreatorArtType, CreatorCalendarItem, CreatorCommission, CreatorCommissionInput, CreatorCommissionStatus,
  CreatorCommissionStep, CreatorStepStatus, CreatorReference, CreatorReferenceDraft,
  CreatorStageDefinition, CreatorWorkflow,
  CreatorStudioService
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';

/**
 * Private Pro commission detail page: reference links and artist-entered updates.
 * No unverified client approval is represented as authenticated.
 * API re-checks authorization and owner for EVERY operation.
 */
@Component({
  selector: 'app-creator-commission-details',
  standalone: false,
  templateUrl: './creator-commission-details.component.html'
})
export class CreatorCommissionDetailsComponent implements OnInit, OnDestroy {
  readonly kinds: { value: CreatorActivityKind; label: string }[] = [
    { value: 'NOTE', label: 'Observação' },
    { value: 'REVISION_REQUEST', label: 'Pedido de correção' },
    { value: 'CHANGE_RECORDED', label: 'Alteração realizada' },
    { value: 'CLIENT_FEEDBACK', label: 'Retorno informado pelo cliente' },
    { value: 'APPROVAL_REPORTED', label: 'Aprovação informada pelo artista' },
    { value: 'DELIVERY_RECORDED', label: 'Entrega registrada' }
  ];
  readonly activityPageSize = 20;
  readonly statuses: {value: CreatorCommissionStatus; label: string}[] = [
    {value:'QUEUED',label:'Na fila'}, {value:'IN_PROGRESS',label:'Em produção'},
    {value:'WAITING',label:'Aguardando retorno'}, {value:'PAUSED',label:'Em pausa'},
    {value:'COMPLETED',label:'Concluída'}
  ];
  readonly stepStatuses: {value: CreatorStepStatus; label: string}[] = [
    {value:'PENDING',label:'Pendente'}, {value:'IN_PROGRESS',label:'Em execução'},
    {value:'WAITING_APPROVAL',label:'Aguardando aprovação'}, {value:'DONE',label:'Finalizada'}
  ];
  tab: 'overview'|'references'|'history' = 'overview';
  artTypes: CreatorArtType[] = [];
  steps: CreatorCommissionStep[] = [];
  definitions: CreatorStageDefinition[] = [];
  workflows: CreatorWorkflow[] = [];
  stepsExpanded = false;
  stepEditor: {id:number|null;name:string;stageDefinitionId:number|null;notes:string|null} | null = null;
  importWorkflowId: number | null = null;
  stepStatusDrafts: Record<number,CreatorStepStatus> = {};
  planning: CreatorCalendarItem[] = [];
  orderDraft: CreatorCommissionInput | null = null;
  statusDraft: CreatorCommissionStatus | null = null;
  targetStepId: number | null = null;
  planningKey: string | null = null;
  planningDate = '';

  loadingAccess = true;
  allowed = false;
  loading = false;
  error = '';
  actionError = '';
  notice = '';
  busy = false;

  commissionId: number | null = null;
  commission: CreatorCommission | null = null;
  references: CreatorReference[] = [];
  activity: CreatorActivity[] = [];
  totalActivity = 0;
  activityPage = 1;

  editingReferenceId: number | null = null;
  referenceDraft: CreatorReferenceDraft = { label: '', url: '' };
  activityDraft: CreatorActivityDraft = this.emptyActivity();

  private requestSequence = 0;
  private loadSequence = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly studio: CreatorStudioService,
              private readonly users: UserService,
              private readonly route: ActivatedRoute) {}

  ngOnInit(): void {
    combineLatest([this.users.user$, this.route.paramMap])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([user, params]) => {
        const seq = ++this.requestSequence;
        this.clearPrivateState();
        this.loadingAccess = user != null;
        const raw = params.get('id');
        const id = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
        if (!user) {
          this.error = 'Entre na sua conta para consultar esta commission.';
          return;
        }
        if (!Number.isSafeInteger(id)) {
          this.loadingAccess = false;
          this.error = 'Pedido inválido.';
          return;
        }
        this.commissionId = id;
        const userId = user.id;
        this.studio.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
          next: access => {
            if (!this.isCurrent(seq, userId, id)) return;
            this.loadingAccess = false;
            this.allowed = access.allowed && access.tier === 'PRO';
            if (this.allowed) this.load();
          },
          error: () => {
            if (!this.isCurrent(seq, userId, id)) return;
            this.loadingAccess = false;
            this.error = 'Não foi possível verificar seu acesso.';
          }
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activityPageCount(): number {
    return Math.max(1, Math.ceil(this.totalActivity / this.activityPageSize));
  }

  activityKindName(kind: CreatorActivityKind): string {
    return this.kinds.find(k => k.value === kind)?.label || kind;
  }

  formatCivilDate(value: string | null): string {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  get canManage(): boolean {
    return this.allowed && !!this.commission && !this.loading && !this.busy && !this.error &&
      this.commissionId === this.commission.id;
  }

  get canManageProduction(): boolean {
    return this.canManage && this.commission?.status !== 'COMPLETED';
  }

  get currentStep(): CreatorCommissionStep | undefined {
    return this.steps.find(step=>this.isCurrentStep(step));
  }
  get visibleSteps(): CreatorCommissionStep[] {
    const current=this.currentStep;
    return this.stepsExpanded?this.steps:current?[current]:[];
  }
  toggleSteps(): void {
    if(this.busy || this.loading)return;
    this.stepsExpanded=!this.stepsExpanded;
    if(!this.stepsExpanded && this.stepEditor?.id !== null)this.stepEditor=null;
  }
  openStepEditor(step?:CreatorCommissionStep):void {
    if(!this.canManageProduction || (step && !this.steps.some(row=>row.id===step.id && row.commissionId===this.commissionId)))return;
    this.stepEditor=step?{id:step.id,name:step.name,stageDefinitionId:step.stageDefinitionId,notes:step.notes}:
      {id:null,name:'',stageDefinitionId:null,notes:null};
    this.actionError='';this.notice='';
  }
  chooseStepDefinition(id:number|null):void {
    if(!this.stepEditor || !this.canManageProduction)return;
    this.stepEditor.stageDefinitionId=id;
    if(this.stepEditor.id===null && id!==null){
      const definition=this.definitions.find(row=>row.id===id);
      if(definition)this.stepEditor.name=definition.name;
    }
  }
  saveStepEditor():void {
    const draft=this.stepEditor,c=this.commission;
    if(!draft || !c || !this.canManageProduction || !draft.name.trim() ||
       draft.name.trim().length>100 || (draft.notes?.length??0)>8000)return;
    if(draft.stageDefinitionId!==null && !this.definitions.some(row=>row.id===draft.stageDefinitionId))return;
    if(draft.id===null){
      this.mutate(this.studio.addCommissionStep(c.id,{name:draft.name.trim(),stageDefinitionId:draft.stageDefinitionId}),
        'Etapa adicionada.',()=>{this.stepEditor=null;});
    }else{
      const step=this.steps.find(row=>row.id===draft.id && row.commissionId===c.id);
      if(!step)return;
      this.mutate(this.studio.updateCommissionStep(c.id,step.id,{name:draft.name.trim(),stageDefinitionId:draft.stageDefinitionId,status:step.status,notes:draft.notes}),
        'Etapa atualizada.',()=>this.stepEditor=null);
    }
  }
  removeEditedStep():void {
    const c=this.commission,step=this.steps.find(row=>row.id===this.stepEditor?.id && row.commissionId===this.commissionId);
    if(!c || !step || !this.canManageProduction ||
       !window.confirm('Excluir esta etapa, suas anotações e sua data planejada deste pedido?'))return;
    this.mutate(this.studio.deleteCommissionStep(c.id,step.id),'Etapa excluída.',()=>this.stepEditor=null);
  }
  copyWorkflow():void {
    const c=this.commission,id=this.importWorkflowId;
    if(!c || !this.canManageProduction || this.steps.length || id===null || !this.workflows.some(row=>row.id===id))return;
    this.mutate(this.studio.copyWorkflowToCommission(c.id,id),'Etapas copiadas.',()=>{this.importWorkflowId=null;});
  }

  get completedSteps(): number { return this.steps.filter(step=>step.status==='DONE').length; }
  get generalPlanning(): CreatorCalendarItem | undefined { return this.planning.find(item=>item.kind==='PRODUCTION'); }

  statusName(status: CreatorCommissionStatus): string {
    return this.statuses.find(item=>item.value===status)?.label || status;
  }
  artTypeName(id: number | null): string {
    return this.artTypes.find(type=>type.id===id)?.name || (id===null?'Não definido':'Tipo indisponível');
  }
  planForStep(step: CreatorCommissionStep): CreatorCalendarItem | undefined {
    return this.planning.find(item=>item.kind==='STEP' && item.stepId===step.id);
  }
  isCurrentStep(step: CreatorCommissionStep): boolean {
    return this.commission?.status !== 'COMPLETED' && step.status !== 'DONE' &&
      this.commission?.currentStagePosition === step.position;
  }

  startOrderEdit(): void {
    const c=this.commission;
    if(!this.canManage || !c)return;
    this.orderDraft={title:c.title,clientName:c.clientName,description:c.description,
      privateNotes:c.privateNotes,requestedOn:c.requestedOn,dueOn:c.dueOn,artTypeId:c.artTypeId};
    this.actionError='';this.notice='';
  }
  cancelOrderEdit(): void { if(!this.busy)this.orderDraft=null; }

  saveOrder(): void {
    const d=this.orderDraft,id=this.commissionId;
    if(!this.canManage || !d || id===null)return;
    const title=d.title.trim(),clientName=d.clientName.trim();
    if(!title || !clientName || !d.requestedOn){
      this.actionError='Informe o título, o cliente e a data do pedido.';return;
    }
    this.mutate(this.studio.update(id,{
      title,clientName,description:d.description?.trim()||null,
      privateNotes:d.privateNotes?.trim()||null,requestedOn:d.requestedOn,
      dueOn:d.dueOn||null,artTypeId:d.artTypeId
    }), 'Dados do pedido atualizados.',()=>this.orderDraft=null);
  }

  saveStatus(): void {
    const c=this.commission,status=this.statusDraft;
    if(!this.canManage || !c || !status || status===c.status)return;
    this.mutate(this.studio.changeStatus(c.id,status),'Situação do pedido atualizada.');
  }

  moveToStep(): void {
    const c=this.commission, target=this.steps.find(s=>s.id===this.targetStepId);
    if(!this.canManageProduction || !c || !target || target.commissionId!==c.id)return;
    this.mutate(this.studio.moveCommissionToStep(c.id,target.id),'Etapa atualizada.',()=>this.targetStepId=null);
  }

  changeStepStatus(stepId: number, status: CreatorStepStatus): void {
    const c=this.commission,step=this.steps.find(s=>s.id===stepId);
    if(!this.canManageProduction || !c || !step || step.commissionId!==c.id || step.status===status ||
       !this.stepStatuses.some(item=>item.value===status))return;
    // Preserve name, library linkage and notes. API alone reconciles active stages.
    this.mutate(this.studio.updateCommissionStep(c.id,step.id,{
      name:step.name,stageDefinitionId:step.stageDefinitionId,status,notes:step.notes
    }),'Andamento da etapa atualizado.');
  }

  planKey(item: CreatorCalendarItem): string { return item.kind+':'+(item.stepId??'general'); }
  canPlan(item: CreatorCalendarItem): boolean {
    return this.canManageProduction && item.commissionId===this.commissionId &&
      item.kind!=='DELIVERY' && item.commissionStatus!=='COMPLETED' && item.stepStatus!=='DONE';
  }
  startPlanning(item: CreatorCalendarItem): void {
    if(!this.canPlan(item))return;
    this.planningKey=this.planKey(item);this.planningDate=item.date||'';
    this.actionError='';this.notice='';
  }
  cancelPlanning(): void { this.planningKey=null;this.planningDate=''; }
  savePlanning(item: CreatorCalendarItem,remove=false): void {
    const actual=this.planning.find(row=>this.planKey(row)===this.planKey(item));
    if(!actual || !this.canPlan(actual) || this.planningKey!==this.planKey(actual))return;
    // A historical general date can be removed but must not be recreated
    // after the order gains steps; server enforces the authoritative rule.
    const date=remove?null:this.planningDate;
    if(!remove && (!date || !this.validPlanningDate(date))){
      this.actionError='Informe uma data válida.';return;
    }
    if(date===actual.date){this.cancelPlanning();return;}
    this.mutate(this.studio.setPlanningDate(actual.commissionId,actual.stepId,date),
      'Planejamento atualizado.',()=>this.cancelPlanning());
  }

  private validPlanningDate(date: string): boolean {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || date<'1900-01-01' || date>'9999-12-31')return false;
    const value=new Date(date+'T00:00:00Z');
    return Number.isFinite(value.getTime()) && value.toISOString().slice(0,10)===date;
  }

  private clearPrivateState(): void {
    this.loadSequence++;
    this.loadingAccess = false;
    this.allowed = false;
    this.loading = false;
    this.busy = false;
    this.error = '';
    this.actionError = '';
    this.notice = '';
    this.commissionId = null;
    this.commission = null;
    this.artTypes=[];this.steps=[];this.planning=[];this.stepStatusDrafts={};
    this.definitions=[];this.workflows=[];this.stepsExpanded=false;this.stepEditor=null;this.importWorkflowId=null;
    this.tab='overview';this.orderDraft=null;this.statusDraft=null;this.targetStepId=null;
    this.cancelPlanning();
    this.references = [];
    this.activity = [];
    this.totalActivity = 0;
    this.activityPage = 1;
    this.cancelReference();
    this.activityDraft = this.emptyActivity();
  }

  private isCurrent(seq: number, userId: number, commissionId: number): boolean {
    return seq === this.requestSequence &&
      this.users.getUser()?.id === userId && this.commissionId === commissionId;
  }

  load(): void {
    const id = this.commissionId;
    if (!this.allowed || id === null || this.busy) return;
    const seq = this.requestSequence;
    const loadSeq = ++this.loadSequence;
    const userId = this.users.getUser()?.id;
    if (userId === undefined) return;
    this.loading = true;
    this.error = '';
    forkJoin({
      commission: this.studio.findCommission(id),
      artTypes: this.studio.artTypes(),
      definitions: this.studio.stageDefinitions(),
      workflows: this.studio.workflows(),
      steps: this.studio.commissionSteps(id),
      planning: this.studio.commissionPlanning(id),
      references: this.studio.references(id),
      activity: this.studio.activity(id, this.activityPage, this.activityPageSize)
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (!this.isCurrent(seq, userId, id) || loadSeq !== this.loadSequence) return;
        this.commission = result.commission;
        this.artTypes=result.artTypes;
        this.definitions=result.definitions;this.workflows=result.workflows;
        this.steps=result.steps;
        this.stepStatusDrafts=Object.fromEntries(this.steps.map(step=>[step.id,step.status]));
        this.planning=result.planning;
        this.statusDraft=result.commission.status;
        this.targetStepId=null;
        this.cancelPlanning();
        this.references = result.references;
        this.activity = result.activity.items;
        this.totalActivity = result.activity.total;
        this.loading = false;
      },
      error: err => {
        if (!this.isCurrent(seq, userId, id) || loadSeq !== this.loadSequence) return;
        this.loading = false;
        if (err instanceof HttpErrorResponse &&
            [401,403,404].includes(err.status)) {
          this.clearPrivateState();
          this.error = 'Acesso indisponível ou pedido não encontrado.';
        } else {
          this.error = 'Falha ao carregar os detalhes. Tente novamente.';
        }
      }
    });
  }

  editReference(ref: CreatorReference): void {
    if (!this.canManage) return;
    this.editingReferenceId = ref.id;
    this.referenceDraft = { label: ref.label || '', url: ref.url };
    this.actionError = '';
  }

  cancelReference(): void {
    this.editingReferenceId = null;
    this.referenceDraft = {label: '', url: ''};
  }

  saveReference(): void {
    const id = this.commissionId;
    const url = this.referenceDraft.url.trim();
    if (!this.canManage || id === null || !url) return;
    if (!/^https:\/\/[^\s]+$/i.test(url)) {
      this.actionError = 'A referência precisa começar com https://';
      return;
    }
    const input = {
      label: this.referenceDraft.label?.trim() || null,
      url
    };
    const request = this.editingReferenceId === null
      ? this.studio.createReference(id, input)
      : this.studio.updateReference(id, this.editingReferenceId, input);
    this.mutate(request, 'Referência salva.', () => this.cancelReference());
  }

  deleteReference(ref: CreatorReference): void {
    const id = this.commissionId;
    if (!this.canManage || id === null ||
        !window.confirm('Excluir este link de referência?')) return;
    this.mutate(this.studio.deleteReference(id, ref.id), 'Referência removida.');
  }

  saveActivity(): void {
    const id = this.commissionId;
    const description = this.activityDraft.description.trim();
    if (!this.canManage || id === null || !description ||
        !this.activityDraft.occurredOn) {
      this.actionError = 'Informe a data e descreva a atualização.';
      return;
    }
    const entry = { ...this.activityDraft, description };
    this.mutate(this.studio.createActivity(id, entry), 'Atualização registrada.', () => {
      this.activityDraft = this.emptyActivity();
      this.activityPage = 1;
    });
  }

  changeActivityPage(delta: number): void {
    const next = this.activityPage + delta;
    if (!this.allowed || this.loading || this.busy || next < 1 || next > this.activityPageCount) return;
    this.activityPage = next;
    this.load();
  }

  private mutate<T>(call: Observable<T>, success: string, reset?: () => void): void {
    if (!this.canManage || this.commissionId === null) return;
    const userId = this.users.getUser()?.id;
    const id = this.commissionId;
    const seq = this.requestSequence;
    if (userId === undefined) return;
    this.busy = true;
    this.actionError = '';
    this.notice = '';
    call.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (!this.isCurrent(seq, userId, id)) return;
        this.busy = false;
        reset?.();
        this.notice = success;
        this.load();
      },
      error: err => {
        if (!this.isCurrent(seq, userId, id)) return;
        this.busy = false;
        if (err instanceof HttpErrorResponse && [401,403,404].includes(err.status)) {
          this.clearPrivateState();
          this.error = 'Acesso indisponível ou pedido não encontrado.';
          return;
        }
        this.actionError = err instanceof HttpErrorResponse && err.status===409
          ? 'O pedido ou a etapa mudou. Atualize os dados antes de tentar novamente.'
          : 'Não foi possível salvar. Confira os dados e tente novamente.';
        this.statusDraft=this.commission?.status??null;
        this.stepStatusDrafts=Object.fromEntries(this.steps.map(step=>[step.id,step.status]));
      }
    });
  }

  private emptyActivity(): CreatorActivityDraft {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    return { eventKind: 'NOTE', description: '', occurredOn: today };
  }
}
