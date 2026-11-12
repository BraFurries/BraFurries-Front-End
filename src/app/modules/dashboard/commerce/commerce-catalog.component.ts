import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, catchError, forkJoin, map, of, takeUntil, tap } from 'rxjs';
import {
  PlatformAccess,
  PlatformAccessService,
  PlatformPermissionCode
} from '../../../core/services/platform-access.service';
import {
  CommercialArtist, CommerceArtistService, IssuedArtistInvitation
} from '../../../core/services/commerce-artist.service';
import {
  CommerceArtist, CommerceArtwork, CommerceArtworkFile, CommerceBatch, CommerceBatchRevision,
  CommerceCatalogService, CommerceContractTemplate, CommerceContractPreparation, CommerceProduct,
  CommerceProductArtwork, CommerceSignedAgreement, CommerceSupplier, CommerceSupplierOption
} from '../../../core/services/commerce-catalog.service';

type CatalogTab = 'artworks' | 'artists' | 'files' | 'templates' | 'contracts' |
  'suppliers' | 'products' | 'production' | 'links';

@Component({
  selector: 'app-commerce-catalog',
  standalone: false,
  templateUrl: './commerce-catalog.component.html'
})
export class CommerceCatalogComponent implements OnInit, OnDestroy {
  readonly tabs: { key: CatalogTab; label: string; permissions: PlatformPermissionCode[] }[] = [
    { key: 'artworks', label: 'Artes', permissions: ['ARTWORKS_MANAGE'] },
    { key: 'artists', label: 'Artistas', permissions: ['ARTWORKS_MANAGE'] },
    { key: 'templates', label: 'Modelos de contratos', permissions: ['CONTRACTS_MANAGE'] },
    { key: 'contracts', label: 'Contratos assinados', permissions: ['CONTRACTS_MANAGE'] },
    { key: 'suppliers', label: 'Fornecedores', permissions: ['SUPPLIERS_MANAGE'] },
    { key: 'products', label: 'Produtos', permissions: ['PRODUCTS_MANAGE'] },
    { key: 'production', label: 'Lotes de produção', permissions: ['PRODUCTS_MANAGE', 'SUPPLIERS_MANAGE'] }
  ];
  access: PlatformAccess | null = null;
  activeTab: CatalogTab = 'artworks';
  screen: 'browse' | 'form' = 'browse';
  returnToArtworkForm = false;
  loading = true;
  saving = false;
  searchingArtists = false;
  errorMessage = '';
  loadErrorMessage = '';
  successMessage = '';

  templates: CommerceContractTemplate[] = [];
  artworks: CommerceArtwork[] = [];
  artworkFiles: CommerceArtworkFile[] = [];
  suppliers: CommerceSupplier[] = [];
  supplierChoices: CommerceSupplierOption[] = [];
  products: CommerceProduct[] = [];
  batches: CommerceBatch[] = [];
  editingBatchId: number | null = null;
  batchCorrectionReason = '';
  batchHistoryId: number | null = null;
  batchRevisions: CommerceBatchRevision[] = [];
  batchHistoryLoading = false;
  contracts: CommerceSignedAgreement[] = [];
  preparations: CommerceContractPreparation[] = [];
  contractMode: 'prepare' | 'upload' = 'prepare';
  selectedPreparationId: number | null = null;
  signedFileReviewed = false;
  orphanedPdfKey = '';
  contractorParty = {legalName:'',document:'',address:'',representative:''};
  artistParty = {legalName:'',document:'',address:'',representative:''};
  links: CommerceProductArtwork[] = [];
  artistCandidates: CommerceArtist[] = [];
  externalArtists: CommercialArtist[] = [];
  showExternalArtistForm = false;
  issuedInvitation: IssuedArtistInvitation | null = null;
  issuedInvitationLink = '';
  issuedArtistName = '';
  issuingInvitation = false;
  editingArtworkId: number | null = null;
  editingArtistId: number | null = null;
  editingTemplateId: number | null = null;
  editingSupplierId: number | null = null;
  editingProductId: number | null = null;
  externalArtistForm = {
    artistName: '', telegramHandle: '', instagramHandle: '',
    contactEmail: '', internalNotes: ''
  };
  artistSearch = '';
  selectedArtworkId: number | null = null;
  selectedProductId: number | null = null;
  linkedArtworkId: number | null = null;
  allocation: number | null = null;

  templateForm = {
    name: '', description: '', modality: 'ROYALTY', royaltyMethod: 'PERCENT_GROSS',
    royaltyPercent: 10 as number | null, royaltyFixedAmount: null as number | null,
    fullText: ''
  };
  artworkForm = { title: '', description: '', artistUserId: null as number | null, creationCost: 0 };
  supplierForm = { name: '', contactName: '', email: '', phone: '', notes: '' };
  productForm = { sku: '', name: '', description: '', estimatedUnitCost: 0,
    suggestedPrice: 0, preferredSupplierId: null as number | null };
  productionForm = {
    productId: null as number | null, supplierId: null as number | null,
    quantity: 1, unitCost: 0, additionalCost: 0,
    producedOn: new Date().toLocaleDateString('en-CA'), reference: ''
  };
  contractForm = {
    templateId: null as number | null,
    effectiveFrom: new Date().toLocaleDateString('en-CA'),
    effectiveUntil: '',
    oneTimeAmount: 0
  };
  contractFile: File | null = null;
  artworkUpload: File | null = null;
  artworkFileKind: CommerceArtworkFile['kind'] = 'SOURCE';
  artworkFileDescription = '';

  private readonly destroy$ = new Subject<void>();
  private failedLoadSections: string[] = [];

  constructor(
    private readonly accessService: PlatformAccessService,
    private readonly catalog: CommerceCatalogService,
    private readonly artistService: CommerceArtistService
  ) {}

  ngOnInit(): void {
    this.accessService.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
      next: access => {
        this.access = access;
        if (!access.enabled || (!access.owner && !access.permissions.length)) {
          this.loading = false;
          return;
        }
        this.activeTab = this.visibleTabs()[0]?.key ?? 'artworks';
        this.reload();
      },
      error: () => {
        this.errorMessage = 'Não foi possível verificar a autorização comercial.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  can(permission: PlatformPermissionCode): boolean {
    return this.access?.enabled === true &&
      (this.access.owner || this.access.permissions.includes(permission));
  }

  visibleTabs(): typeof this.tabs {
    return this.tabs.filter(tab => tab.permissions.every(code => this.can(code)));
  }

  selectTab(tab: CatalogTab): void {
    if (!this.visibleTabs().some(item => item.key === tab)) return;
    this.activeTab = tab;
    this.screen = 'browse';
    this.returnToArtworkForm = false;
    this.errorMessage = '';
    this.successMessage = '';
    if (tab === 'contracts') this.reloadContracts();
    if (tab === 'artworks') this.reloadFiles();
    if (tab === 'products') this.reloadLinks();
  }

  /** List and create/edit are exclusive screens; related documents open from their parent record. */
  openCreate(tab: CatalogTab, parentId?: number): void {
    const permission: Partial<Record<CatalogTab, PlatformPermissionCode[]>> = {
      artworks: ['ARTWORKS_MANAGE'], artists: ['ARTWORKS_MANAGE'],
      files: ['ARTWORKS_MANAGE'], templates: ['CONTRACTS_MANAGE'],
      contracts: ['CONTRACTS_MANAGE'], suppliers: ['SUPPLIERS_MANAGE'],
      products: ['PRODUCTS_MANAGE'], links: ['PRODUCTS_MANAGE', 'CONTRACTS_MANAGE'],
      production: ['PRODUCTS_MANAGE', 'SUPPLIERS_MANAGE']
    };
    if (!(permission[tab] ?? []).every(code => this.can(code))) return;
    const returningFromArtwork = tab === 'artists' &&
      this.activeTab === 'artworks' && this.screen === 'form';
    if (tab === 'artworks') this.cancelEditArtwork();
    if (tab === 'artists') this.cancelEditArtist();
    if (tab === 'templates') this.cancelEditTemplate();
    if (tab === 'suppliers') this.cancelEditSupplier();
    if (tab === 'products') this.cancelEditProduct();
    if (tab === 'production') this.cancelEditBatch();
    if (tab === 'files') {
      this.artworkUpload = null;
      this.artworkFileKind = 'SOURCE';
      this.artworkFileDescription = '';
    }
    if (tab === 'links') {
      this.linkedArtworkId = null;
      this.allocation = null;
    }
    if (tab === 'contracts') {
      this.contractMode = 'prepare';
      this.selectedPreparationId = null;
      this.contractFile = null;
      this.signedFileReviewed = false;
      this.contractForm.templateId = null;
      this.contractForm.effectiveUntil = '';
      this.contractForm.oneTimeAmount = 0;
      this.contractorParty = {legalName:'',document:'',address:'',representative:''};
      this.artistParty = {legalName:'',document:'',address:'',representative:''};
    }
    this.returnToArtworkForm = returningFromArtwork;
    if (tab === 'files' || tab === 'contracts') {
      if (parentId != null) this.selectedArtworkId = parentId;
      if (this.selectedArtworkId == null) return;
    }
    if (tab === 'links') {
      if (parentId != null) this.selectedProductId = parentId;
      if (this.selectedProductId == null) return;
    }
    this.activeTab = tab;
    this.screen = 'form';
    this.errorMessage = '';
    this.successMessage = '';
  }

  backToList(): void {
    if (this.activeTab === 'artists' && this.returnToArtworkForm) {
      this.activeTab = 'artworks';
      this.screen = 'form';
      this.returnToArtworkForm = false;
      return;
    }
    this.screen = 'browse';
    this.returnToArtworkForm = false;
    if (this.activeTab === 'files') this.activeTab = 'artworks';
    if (this.activeTab === 'links') this.activeTab = 'products';
    this.errorMessage = '';
  }

  newLabel(): string {
    const labels: Record<CatalogTab, string> = {
      artworks: 'Nova arte', artists: 'Novo artista', files: 'Novo arquivo',
      templates: 'Novo modelo', contracts: 'Preparar contrato para assinatura',
      suppliers: 'Novo fornecedor', products: 'Novo produto',
      links: 'Vincular arte', production: 'Novo lote'
    };
    return labels[this.activeTab];
  }

  selectArtwork(id: number): void {
    this.selectedArtworkId = this.selectedArtworkId === id ? null : id;
    this.reloadFiles();
    if (this.can('CONTRACTS_MANAGE')) this.reloadContracts();
  }

  selectProduct(id: number): void {
    this.selectedProductId = this.selectedProductId === id ? null : id;
    this.reloadLinks();
  }

  templateName(templateId: number): string {
    return this.templates.find(item => item.id === templateId)?.name ?? 'Modelo #' + templateId;
  }

  selectedArtworkName(): string {
    return this.artworks.find(item => item.id === this.selectedArtworkId)?.title ?? 'Arte selecionada';
  }

  reload(): void {
    this.loading = true;
    this.failedLoadSections = [];
    this.loadErrorMessage = '';
    this.errorMessage = '';
    const tasks: Observable<unknown>[] = [];
    if (this.can('ARTWORKS_MANAGE') || this.can('CONTRACTS_MANAGE')) {
      tasks.push(this.fetch('Artes',this.catalog.artworks(), items => this.artworks = items));
    }
    if (this.can('ARTWORKS_MANAGE')) {
      tasks.push(this.fetch('Artistas',this.artistService.profiles(), items => this.externalArtists = items));
    }
    if (this.can('CONTRACTS_MANAGE')) {
      tasks.push(this.fetch('Modelos de contratos',this.catalog.templates(), items => this.templates = items));
    }
    if (this.can('SUPPLIERS_MANAGE')) {
      tasks.push(this.fetch('Fornecedores',this.catalog.suppliers(), items => this.suppliers = items));
    }
    if (this.can('PRODUCTS_MANAGE')) {
      tasks.push(this.fetch('Produtos',this.catalog.products(), items => this.products = items));
      tasks.push(this.fetch('Fornecedores disponíveis',this.catalog.supplierChoices(), items => this.supplierChoices = items));
    }
    if (this.can('SUPPLIERS_MANAGE') && this.can('PRODUCTS_MANAGE')) {
      tasks.push(this.fetch('Lotes de produção',this.catalog.productionBatches(), items => this.batches = items));
    }
    if (!tasks.length) {
      this.loading = false;
      return;
    }
    forkJoin(tasks).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loading = false;
      if (!this.artworks.some(a => a.id === this.selectedArtworkId)) {
        this.selectedArtworkId = this.artworks[0]?.id ?? null;
      }
      if (!this.products.some(p => p.id === this.selectedProductId)) {
        this.selectedProductId = this.products[0]?.id ?? null;
      }
      if (this.can('CONTRACTS_MANAGE')) this.reloadContracts();
      if (this.can('ARTWORKS_MANAGE')) this.reloadFiles();
      if (this.can('PRODUCTS_MANAGE')) this.reloadLinks();
    });
  }

  private fetch<T>(section: string, request: Observable<T>,
                   apply: (value: T) => void): Observable<unknown> {
    return request.pipe(
      tap(apply),
      map(() => null),
      catchError((error: unknown) => {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        this.failedLoadSections.push(status
          ? `${section} (HTTP ${status})` : `${section} (falha de conexão)`);
        // Do not expose response bodies or private document identifiers in the UI.
        this.loadErrorMessage = 'Não foi possível carregar: ' +
          this.failedLoadSections.join(', ') + '. Confira os acessos e tente atualizar.';
        return of(null);
      })
    );
  }

  searchForArtists(): void {
    if (!this.can('ARTWORKS_MANAGE') || this.searchingArtists) return;
    if (this.artistSearch.trim().length < 2) {
      this.errorMessage = 'Digite pelo menos 2 caracteres para pesquisar o artista.';
      return;
    }
    this.searchingArtists = true;
    this.catalog.searchArtists(this.artistSearch.trim())
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: artists => {
          this.artistCandidates = artists;
          this.searchingArtists = false;
        },
        error: () => {
          this.searchingArtists = false;
          this.errorMessage = 'Não foi possível pesquisar os artistas.';
        }
      });
  }

  startEditArtist(artist: CommercialArtist): void {
    this.activeTab='artists';
    this.screen='form';
    this.returnToArtworkForm = false;
    this.editingArtistId=artist.userId;
    this.externalArtistForm={
      artistName:artist.artistName,telegramHandle:artist.telegramHandle || '',
      instagramHandle:artist.instagramHandle || '',
      contactEmail:artist.contactEmail || '',internalNotes:artist.internalNotes || ''
    };
    this.showExternalArtistForm=true;
    this.errorMessage='';
  }

  cancelEditArtist(): void {
    this.editingArtistId=null;
    this.externalArtistForm={artistName:'',telegramHandle:'',instagramHandle:'',
      contactEmail:'',internalNotes:''};
    this.showExternalArtistForm=false;
  }

  createExternalArtist(): void {
    if (!this.can('ARTWORKS_MANAGE') || this.saving ||
        !this.externalArtistForm.artistName.trim()) {
      this.errorMessage = 'Informe o nome artístico.';
      return;
    }
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    const form=this.externalArtistForm;
    const payload={
      artistName:form.artistName.trim(),telegramHandle:form.telegramHandle.trim() || null,
      instagramHandle:form.instagramHandle.trim() || null,
      contactEmail:form.contactEmail.trim() || null,internalNotes:form.internalNotes.trim() || null
    };
    const editing=this.editingArtistId;
    const request: Observable<{id:number} | void> = editing==null
      ? this.artistService.registerExternal(payload)
      : this.artistService.updateArtist(editing,payload);
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.saving=false;
        if(editing==null) {
          const id=(result as {id:number}).id;
          this.artistCandidates=[{id,name:payload.artistName},
            ...this.artistCandidates.filter(item=>item.id!==id)];
          this.artworkForm.artistUserId=id;
          this.artistSearch=payload.artistName;
        }
        this.cancelEditArtist();
        this.activeTab = this.returnToArtworkForm ? 'artworks' : 'artists';
        this.screen = this.returnToArtworkForm ? 'form' : 'browse';
        this.returnToArtworkForm = false;
        this.successMessage=editing==null
          ? 'Artista externa cadastrada e selecionada.' : 'Dados da artista atualizados.';
        this.reload();
      },
      error:err => {
        this.saving=false;
        this.errorMessage=err?.error?.message || 'Não foi possível salvar os dados da artista.';
      }
    });
  }

  issueInvitation(artist: CommercialArtist): void {
    if (this.access?.owner !== true || !artist.canInvite || this.issuingInvitation) return;
    this.issuingInvitation = true;
    this.errorMessage = '';
    this.issuedInvitation = null;
    this.issuedInvitationLink = '';
    this.artistService.issueInvitation(artist.userId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: invitation => {
          this.issuingInvitation = false;
          this.issuedArtistName = artist.artistName;
          this.issuedInvitation = invitation;
          // Only the URL travels in the initial message. The confirmation
          // code MUST be transmitted independently through a trusted channel.
          this.issuedInvitationLink =
            `${window.location.origin}/artist-invite?token=${encodeURIComponent(invitation.token)}`;
          this.successMessage =
            'Convite criado. Compartilhe o link e o código por canais separados; ambos aparecem apenas agora.';
        },
        error: () => {
          this.issuingInvitation = false;
          this.errorMessage = 'Não foi possível gerar o convite. Confirme que a artista ainda não tem conta.';
        }
      });
  }

  copyInvitationLink(): void {
    if (!this.issuedInvitationLink) return;
    navigator.clipboard.writeText(this.issuedInvitationLink).catch(() => {
      this.errorMessage = 'Copie o link selecionando o texto.';
    });
  }

  copyInvitationCode(): void {
    if (!this.issuedInvitation) return;
    navigator.clipboard.writeText(this.issuedInvitation.confirmationCode).catch(() => {
      this.errorMessage = 'Copie o código selecionando o texto.';
    });
  }

  clearIssuedInvitation(): void {
    this.issuedInvitation = null;
    this.issuedInvitationLink = '';
    this.issuedArtistName = '';
  }

  startEditArtwork(item: CommerceArtwork): void {
    this.activeTab='artworks';
    this.screen='form';
    this.editingArtworkId=item.id;
    this.artworkForm={
      title:item.title,description:item.description || '',
      artistUserId:item.artistUserId,creationCost:item.creationCost
    };
    this.artistCandidates=[
      {id:item.artistUserId,name:item.artistName},
      ...this.artistCandidates.filter(candidate=>candidate.id!==item.artistUserId)
    ];
    this.artistSearch=item.artistName;
    this.errorMessage='';
  }

  cancelEditArtwork(): void {
    this.editingArtworkId=null;
    this.artworkForm={title:'',description:'',artistUserId:null,creationCost:0};
  }

  createArtwork(): void {
    if (!this.can('ARTWORKS_MANAGE') || this.artworkForm.artistUserId == null) {
      this.errorMessage='Selecione um artista cadastrado na BraFurries.';
      return;
    }
    const id=this.editingArtworkId;
    const payload={...this.artworkForm,artistUserId:this.artworkForm.artistUserId};
    const request=id==null
      ? this.catalog.createArtwork(payload) : this.catalog.updateArtwork(id,payload);
    this.mutate(request,id==null?'Arte cadastrada.':'Obra atualizada.',
      ()=>this.cancelEditArtwork());
  }

  toggleArtwork(item: CommerceArtwork): void {
    if(!this.can('ARTWORKS_MANAGE') || this.saving) return;
    const archived=item.status!=='ARCHIVED';
    if(!window.confirm(archived
      ? 'Arquivar esta obra? Contratos e histórico serão preservados.'
      : 'Reativar esta obra para administração?')) return;
    this.mutate(this.catalog.setArtworkArchived(item.id,archived),
      archived?'Obra arquivada.':'Obra reativada.');
  }

  deleteArtwork(item: CommerceArtwork): void {
    if(!this.can('ARTWORKS_MANAGE') || this.saving) return;
    if(!window.confirm('Excluir definitivamente a obra '+item.title+
        '? Só é permitido sem contratos, arquivos ou vínculos.')) return;
    this.mutate(this.catalog.deleteArtwork(item.id),'Obra sem histórico excluída.');
  }

  startEditTemplate(model: CommerceContractTemplate): void {
    this.activeTab='templates';
    this.screen='form';
    this.editingTemplateId=model.id;
    this.templateForm={
      name:model.name,description:model.description || '',fullText:model.fullText || '',
      modality:model.modality,royaltyMethod:model.royaltyMethod,
      royaltyPercent:model.royaltyPercent,royaltyFixedAmount:model.royaltyFixedAmount
    };
  }

  cancelEditTemplate(): void {
    this.editingTemplateId=null;
    this.templateForm={name:'',description:'',modality:'ROYALTY',royaltyMethod:'PERCENT_GROSS',
      royaltyPercent:10,royaltyFixedAmount:null,fullText:''};
  }

  createTemplate(): void {
    if (!this.can('CONTRACTS_MANAGE')) return;
    const form=this.templateForm;
    if (!form.fullText.trim()) {
      this.errorMessage='Escreva as cláusulas, termos e concessões do contrato antes de salvar.';
      return;
    }
    const payload={
      name:form.name,description:form.description || null,fullText:form.fullText,
      modality:form.modality,
      royaltyMethod:form.royaltyMethod,
      royaltyPercent:form.royaltyMethod.startsWith('PERCENT_')?form.royaltyPercent:null,
      royaltyFixedAmount:form.royaltyMethod.startsWith('FIXED_')?form.royaltyFixedAmount:null
    };
    const id=this.editingTemplateId;
    this.mutate(id==null?this.catalog.createTemplate(payload):
      this.catalog.updateTemplate(id,payload),
      id==null?'Modelo de contrato cadastrado.':'Modelo atualizado (contratos assinados não mudam).',
      ()=>this.cancelEditTemplate());
  }

  toggleTemplate(model: CommerceContractTemplate): void {
    if(!this.can('CONTRACTS_MANAGE') || this.saving) return;
    this.mutate(this.catalog.setTemplateActive(model.id,!model.active),
      model.active?'Modelo desativado.':'Modelo reativado.');
  }

  deleteTemplate(model: CommerceContractTemplate): void {
    if(!this.can('CONTRACTS_MANAGE') || this.saving ||
       !window.confirm('Excluir modelo sem contratos assinados: '+model.name+'?')) return;
    this.mutate(this.catalog.deleteTemplate(model.id),'Modelo excluído.');
  }

  startEditSupplier(supplier: CommerceSupplier): void {
    this.activeTab='suppliers';
    this.screen='form';
    this.editingSupplierId=supplier.id;
    this.supplierForm={name:supplier.name,contactName:supplier.contactName || '',
      email:supplier.email || '',phone:supplier.phone || '',notes:supplier.notes || ''};
  }

  cancelEditSupplier(): void {
    this.editingSupplierId=null;
    this.supplierForm={name:'',contactName:'',email:'',phone:'',notes:''};
  }

  createSupplier(): void {
    if (!this.can('SUPPLIERS_MANAGE')) return;
    const form=this.supplierForm;
    const payload={name:form.name,contactName:form.contactName || null,
      email:form.email || null,phone:form.phone || null,notes:form.notes || null};
    const id=this.editingSupplierId;
    this.mutate(id==null?this.catalog.createSupplier(payload):
      this.catalog.updateSupplier(id,payload),
      id==null?'Fornecedor cadastrado.':'Fornecedor atualizado.',
      ()=>this.cancelEditSupplier());
  }

  toggleSupplier(supplier: CommerceSupplier): void {
    if(!this.can('SUPPLIERS_MANAGE') || this.saving) return;
    this.mutate(this.catalog.setSupplierActive(supplier.id,!supplier.active),
      supplier.active?'Fornecedor desativado.':'Fornecedor reativado.');
  }

  deleteSupplier(supplier: CommerceSupplier): void {
    if(!this.can('SUPPLIERS_MANAGE') || this.saving ||
       !window.confirm('Excluir fornecedor sem uso: '+supplier.name+'?')) return;
    this.mutate(this.catalog.deleteSupplier(supplier.id),'Fornecedor excluído.');
  }

  startEditProduct(product: CommerceProduct): void {
    this.activeTab='products';
    this.screen='form';
    this.editingProductId=product.id;
    this.productForm={sku:product.sku,name:product.name,
      description:product.description || '',
      estimatedUnitCost:product.estimatedUnitCost,suggestedPrice:product.suggestedPrice,
      preferredSupplierId:product.preferredSupplierId};
  }

  cancelEditProduct(): void {
    this.editingProductId=null;
    this.productForm={sku:'',name:'',description:'',estimatedUnitCost:0,
      suggestedPrice:0,preferredSupplierId:null};
  }

  createProduct(): void {
    if (!this.can('PRODUCTS_MANAGE')) return;
    const payload={...this.productForm,description:this.productForm.description || null};
    const id=this.editingProductId;
    this.mutate(id==null?this.catalog.createProduct(payload):
      this.catalog.updateProduct(id,payload),
      id==null?'Produto cadastrado.':'Produto atualizado.',
      ()=>this.cancelEditProduct());
  }

  toggleProduct(product: CommerceProduct): void {
    if(!this.can('PRODUCTS_MANAGE') || this.saving) return;
    this.mutate(this.catalog.setProductActive(product.id,!product.active),
      product.active?'Produto desativado.':'Produto reativado.');
  }

  deleteProduct(product: CommerceProduct): void {
    if(!this.can('PRODUCTS_MANAGE') || this.saving ||
       !window.confirm('Excluir produto sem lotes, encomendas nem vínculos: '+product.name+'?')) return;
    this.mutate(this.catalog.deleteProduct(product.id),'Produto excluído.');
  }

  unlinkArtworkFromProduct(artworkId: number): void {
    if(!this.can('PRODUCTS_MANAGE') || !this.can('CONTRACTS_MANAGE') ||
       this.selectedProductId==null || this.saving ||
       !window.confirm('Remover vínculo da arte deste produto? Royalties passados permanecem.')) return;
    this.mutate(this.catalog.unlinkArtwork(this.selectedProductId,artworkId),
      'Vínculo removido; lançamentos históricos preservados.');
  }

  linkArtwork(): void {
    if (!this.can('PRODUCTS_MANAGE') || !this.can('CONTRACTS_MANAGE')
      || this.selectedProductId == null || this.linkedArtworkId == null) {
      this.errorMessage = 'Selecione um produto e uma arte.';
      return;
    }
    this.mutate(this.catalog.linkArtwork(
      this.selectedProductId,this.linkedArtworkId,this.allocation
    ), 'Vínculo entre produto e arte atualizado.');
  }

  startEditBatch(batch: CommerceBatch): void {
    if(!this.can('PRODUCTS_MANAGE') || !this.can('SUPPLIERS_MANAGE')) return;
    this.activeTab='production';
    this.screen='form';
    this.editingBatchId=batch.id;
    this.productionForm={
      productId:batch.productId,supplierId:batch.supplierId,quantity:batch.quantity,
      unitCost:batch.unitCost,additionalCost:batch.additionalCost,
      producedOn:batch.producedOn,reference:batch.reference || ''
    };
    this.batchCorrectionReason='';
    this.errorMessage='';
  }

  cancelEditBatch(): void {
    this.editingBatchId=null;
    this.batchCorrectionReason='';
    this.productionForm={productId:null,supplierId:null,quantity:1,
      unitCost:0,additionalCost:0,
      producedOn:new Date().toLocaleDateString('en-CA'),reference:''};
  }

  loadBatchHistory(id: number): void {
    if(this.batchHistoryId===id) {
      this.batchHistoryId=null;
      this.batchRevisions=[];
      return;
    }
    if(!this.can('PRODUCTS_MANAGE') || !this.can('SUPPLIERS_MANAGE')) return;
    this.batchHistoryId=id;
    this.batchRevisions=[];
    this.batchHistoryLoading=true;
    this.catalog.productionBatchHistory(id).pipe(takeUntil(this.destroy$)).subscribe({
      next:rows=>{
        if(this.batchHistoryId!==id) return;
        this.batchRevisions=rows;
        this.batchHistoryLoading=false;
      },
      error:err=>{
        if(this.batchHistoryId!==id) return;
        this.batchRevisions=[];
        this.batchHistoryLoading=false;
        this.errorMessage=err?.error?.message || 'Não foi possível carregar as correções do lote.';
      }
    });
  }

  describeBatchSnapshot(json: string): string {
    try {
      const snapshot=JSON.parse(json) as {
        productId:number;supplierId:number;quantity:number;
        unitCost:number;additionalCost:number;producedOn:string;reference:string|null;
      };
      return `${snapshot.quantity} un. · produto #${snapshot.productId} · ` +
        `fornecedor #${snapshot.supplierId} · ` +
        `custo R$ ${Number(snapshot.unitCost).toFixed(2)} + R$ ${Number(snapshot.additionalCost).toFixed(2)} · ` +
        `${snapshot.producedOn} · ref.: ${snapshot.reference || 'sem referência'}`;
    } catch {
      return 'Snapshot indisponível';
    }
  }

  createProduction(): void {
    if (!this.can('PRODUCTS_MANAGE') || !this.can('SUPPLIERS_MANAGE')
      || this.productionForm.productId == null || this.productionForm.supplierId == null) {
      this.errorMessage='Selecione o produto e o fornecedor do lote.';
      return;
    }
    const payload={
      ...this.productionForm,productId:this.productionForm.productId,
      supplierId:this.productionForm.supplierId,
      reference:this.productionForm.reference.trim() || null
    };
    const id=this.editingBatchId;
    const reason=this.batchCorrectionReason.trim();
    if(id!=null && reason.length<3) {
      this.errorMessage='Informe o motivo da correção (mínimo 3 caracteres).';
      return;
    }
    const request=id==null
      ? this.catalog.createProductionBatch(payload)
      : this.catalog.correctProductionBatch(id,payload,reason);
    this.mutate(request,id==null?'Lote de produção registrado.':
      'Lote corrigido; histórico anterior preservado.',()=>{
        if(id!=null && this.batchHistoryId===id) {
          this.batchHistoryId=null;
          this.batchRevisions=[];
        }
        this.cancelEditBatch();
    });
  }

  onContractFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    if (file && (file.size > 8 * 1024 * 1024 || file.type !== 'application/pdf')) {
      this.contractFile = null;
      this.errorMessage = 'O contrato precisa ser um PDF com até 8 MB.';
      return;
    }
    this.contractFile = file;
  }

  deleteOrphanedContractPdf(): void {
    if (!this.access?.owner || this.saving) return;
    const key = this.orphanedPdfKey.trim();
    if (!/^commerce\/contracts\/[1-9][0-9]*\/[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\.pdf$/.test(key)) {
      this.errorMessage = 'Informe a chave exata do PDF privado, no formato commerce/contracts/{arte}/{uuid}.pdf.';
      return;
    }
    if (!window.confirm(
      'Excluir definitivamente este PDF privado órfão do R2? ' +
      'A API verificará antes que ele não esteja vinculado a contrato ou minuta.'
    )) return;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.catalog.deleteOrphanedContractPdf(key)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saving = false;
          this.orphanedPdfKey = '';
          this.successMessage = 'PDF órfão removido do armazenamento privado.';
        },
        error: () => {
          this.saving = false;
          this.errorMessage = 'Não foi possível excluir o PDF órfão. ' +
            'Confira a chave e se ele ainda está vinculado a um contrato ou minuta.';
        }
      });
  }

  terminateContract(contract: CommerceSignedAgreement): void {
    if (!this.can('CONTRACTS_MANAGE') || contract.status !== 'ACTIVE') return;
    if (!window.confirm(
      'Encerrar o contrato ativo? O histórico ficará preservado e novos direitos não serão presumidos.'
    )) return;
    this.mutate(this.catalog.terminateContract(contract.artworkId,contract.id),
      'Contrato encerrado. O histórico foi mantido.');
  }

  downloadContract(contract: CommerceSignedAgreement): void {
    if (!this.can('CONTRACTS_MANAGE')) return;
    this.catalog.downloadContract(contract.artworkId,contract.id)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: pdf => {
          const url = URL.createObjectURL(pdf);
          const element = document.createElement('a');
          element.href = url;
          element.download = `contrato-${contract.id}.pdf`;
          document.body.appendChild(element);
          element.click();
          element.remove();
          setTimeout(() => URL.revokeObjectURL(url),5000);
        },
        error: () => this.errorMessage = 'Não foi possível recuperar o contrato privado.'
      });
  }


  onArtworkFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    if (file && (file.size > 25 * 1024 * 1024 ||
        !/\.(png|jpe?g|webp|pdf|svg|psd|ai|eps|zip)$/i.test(file.name))) {
      this.artworkUpload = null;
      this.errorMessage = 'Use PNG, JPG, WebP, PDF, SVG, PSD, AI, EPS ou ZIP de até 25 MiB.';
      return;
    }
    this.artworkUpload = file;
  }

  reloadFiles(): void {
    if (!this.can('ARTWORKS_MANAGE') || this.selectedArtworkId == null) {
      this.artworkFiles = [];
      return;
    }
    this.artworkFiles = [];
    const artworkId = this.selectedArtworkId;
    this.catalog.artworkFiles(artworkId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: files => {
          if (this.selectedArtworkId === artworkId) this.artworkFiles = files;
        },
        error: () => {
          if (this.selectedArtworkId === artworkId) {
            this.errorMessage = 'Falha ao carregar arquivos privados desta arte.';
          }
        }
      });
  }

  uploadArtworkFile(): void {
    if (!this.can('ARTWORKS_MANAGE') || this.selectedArtworkId == null ||
        !this.artworkUpload) {
      this.errorMessage = 'Selecione a arte e um arquivo válido.';
      return;
    }
    this.mutate(this.catalog.uploadArtworkFile(this.selectedArtworkId,
      this.artworkFileKind,this.artworkFileDescription.trim() || null,this.artworkUpload),
      'Arquivo da arte armazenado com segurança.');
  }

  downloadArtworkFile(file: CommerceArtworkFile): void {
    if (!this.can('ARTWORKS_MANAGE') || file.artworkId !== this.selectedArtworkId) return;
    this.catalog.downloadArtworkFile(file.artworkId,file.id)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = file.originalName;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url),5000);
        },
        error: () => this.errorMessage = 'Não foi possível baixar o arquivo privado.'
      });
  }

  archiveArtworkFile(file: CommerceArtworkFile): void {
    if (!this.can('ARTWORKS_MANAGE') || file.artworkId !== this.selectedArtworkId ||
        file.status !== 'ACTIVE') return;
    if (!window.confirm('Arquivar esta versão? O histórico e o arquivo privado serão preservados.')) return;
    this.mutate(this.catalog.archiveArtworkFile(file.artworkId,file.id),
      'Versão arquivada sem perder o histórico.');
  }

  reloadContracts(): void {
    if (!this.can('CONTRACTS_MANAGE') || this.selectedArtworkId == null) {
      this.contracts = [];
      this.preparations = [];
      return;
    }
    this.contracts = [];
    this.preparations = [];
    const artworkId = this.selectedArtworkId;
    this.catalog.contractPreparations(artworkId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: items => {
          if (this.selectedArtworkId === artworkId) this.preparations = items;
        },
        error: () => {
          if (this.selectedArtworkId === artworkId) {
            this.errorMessage = 'Falha ao carregar as minutas de contrato.';
          }
        }
      });
    this.catalog.contracts(artworkId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: items => {
          if (this.selectedArtworkId === artworkId) this.contracts = items;
        },
        error: () => {
          if (this.selectedArtworkId === artworkId) {
            this.errorMessage = 'Falha ao carregar os contratos desta arte.';
          }
        }
      });
  }

  /** Drafts are not effective contracts. No signed document is stored until step 2. */
  prepareContract(): void {
    const artworkId = this.selectedArtworkId;
    const form = this.contractForm;
    if (!this.can('CONTRACTS_MANAGE') || artworkId == null ||
        form.templateId == null || !form.effectiveFrom ||
        [this.contractorParty,this.artistParty].some(p =>
          !p.legalName.trim() || !p.document.trim() || !p.address.trim())) {
      this.errorMessage = 'Informe a arte, modelo, vigência e identificação legal das duas partes.';
      return;
    }
    const selected = this.templates.find(t => t.id === form.templateId);
    if (!selected?.active || !selected.fullText?.trim()) {
      this.errorMessage = 'Este modelo precisa de cláusulas completas antes da geração.';
      return;
    }
    this.mutate(this.catalog.prepareContract(artworkId,{
      templateId:form.templateId,
      effectiveFrom:form.effectiveFrom,
      effectiveUntil:form.effectiveUntil || null,
      oneTimeAmount:form.oneTimeAmount,
      contractor: {
        ...this.contractorParty,representative:this.contractorParty.representative || null
      },
      artist: {
        ...this.artistParty,representative:this.artistParty.representative || null
      }
    }), 'Minuta gerada e guardada em arquivo privado. Baixe o PDF para assinatura.', () => {
      this.contractMode = 'prepare';
    });
  }

  openUploadPreparation(item: CommerceContractPreparation): void {
    if (!this.can('CONTRACTS_MANAGE') || item.status !== 'PENDING' ||
        item.artworkId !== this.selectedArtworkId) return;
    this.selectedPreparationId = item.id;
    this.contractMode = 'upload';
    this.contractFile = null;
    this.signedFileReviewed = false;
    this.activeTab = 'contracts';
    this.screen = 'form';
    this.errorMessage = '';
  }

  uploadSignedPreparation(): void {
    if (!this.can('CONTRACTS_MANAGE') || this.selectedArtworkId == null ||
        this.selectedPreparationId == null || !this.contractFile ||
        !this.signedFileReviewed) {
      this.errorMessage = 'Selecione o PDF assinado e confirme a conferência das partes e assinaturas.';
      return;
    }
    if (this.contractFile.size > 8*1024*1024 ||
        (this.contractFile.type && this.contractFile.type !== 'application/pdf')) {
      this.errorMessage = 'O contrato assinado deve ser um PDF de até 8 MB.';
      return;
    }
    this.mutate(this.catalog.uploadSignedPreparation(
      this.selectedArtworkId,this.selectedPreparationId,this.contractFile),
      'Contrato assinado registrado. A obra agora utiliza as condições congeladas da minuta.',
      () => {
        this.selectedPreparationId = null;
        this.contractFile = null;
        this.signedFileReviewed = false;
        this.contractMode = 'prepare';
      });
  }

  downloadPreparation(item: CommerceContractPreparation): void {
    if (!this.can('CONTRACTS_MANAGE') || item.artworkId !== this.selectedArtworkId) return;
    this.catalog.downloadPreparation(item.artworkId,item.id)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: blob => {
          const url=URL.createObjectURL(blob);
          const anchor=document.createElement('a');
          anchor.href=url;
          anchor.download='contrato-para-assinatura-' + item.id + '.pdf';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(()=>URL.revokeObjectURL(url),5000);
        },
        error: () => this.errorMessage='Não foi possível baixar a minuta privada.'
      });
  }

  cancelPreparation(item: CommerceContractPreparation): void {
    if (!this.can('CONTRACTS_MANAGE') || item.status !== 'PENDING' ||
        item.artworkId !== this.selectedArtworkId || this.saving) return;
    if (!window.confirm('Cancelar esta minuta? Um novo documento precisará ser gerado e assinado.')) return;
    this.mutate(this.catalog.cancelPreparation(item.artworkId,item.id),
      'Minuta cancelada, com histórico preservado.');
  }

  get hasPendingPreparation(): boolean {
    return this.preparations.some(item => item.status === 'PENDING');
  }

  reloadLinks(): void {
    if (!this.can('PRODUCTS_MANAGE') || this.selectedProductId == null) {
      this.links = [];
      return;
    }
    this.links = [];
    const productId = this.selectedProductId;
    this.catalog.productArtworks(productId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: items => {
          if (this.selectedProductId === productId) this.links = items;
        },
        error: () => {
          if (this.selectedProductId === productId) {
            this.errorMessage = 'Falha ao carregar as artes do produto.';
          }
        }
      });
  }

  private backToListAfterSave(): void {
    this.screen = 'browse';
    if (this.activeTab === 'files') this.activeTab = 'artworks';
    if (this.activeTab === 'links') this.activeTab = 'products';
  }

  private mutate(request: Observable<unknown>, message: string,
                 afterSuccess?: () => void): void {
    if (this.saving) return;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = message;
        afterSuccess?.();
        this.backToListAfterSave();
        this.reload();
      },
      error: error => {
        this.saving = false;
        this.errorMessage = error?.error?.message ||
          'Não foi possível salvar. Confira os dados e tente novamente.';
      }
    });
  }
}
