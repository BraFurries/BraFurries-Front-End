import { Component, OnDestroy, OnInit } from '@angular/core';
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
  CommerceArtist, CommerceArtwork, CommerceArtworkFile, CommerceBatch,
  CommerceCatalogService, CommerceContractTemplate, CommerceProduct,
  CommerceProductArtwork, CommerceSignedAgreement, CommerceSupplier, CommerceSupplierOption
} from '../../../core/services/commerce-catalog.service';

type CatalogTab = 'artworks' | 'files' | 'templates' | 'contracts' |
  'suppliers' | 'products' | 'production' | 'links';

@Component({
  selector: 'app-commerce-catalog',
  standalone: false,
  templateUrl: './commerce-catalog.component.html'
})
export class CommerceCatalogComponent implements OnInit, OnDestroy {
  readonly tabs: { key: CatalogTab; label: string; permissions: PlatformPermissionCode[] }[] = [
    { key: 'artworks', label: 'Artes e artistas', permissions: ['ARTWORKS_MANAGE'] },
    { key: 'files', label: 'Arquivos das artes', permissions: ['ARTWORKS_MANAGE'] },
    { key: 'templates', label: 'Modelos de contratos', permissions: ['CONTRACTS_MANAGE'] },
    { key: 'contracts', label: 'Contratos assinados', permissions: ['CONTRACTS_MANAGE'] },
    { key: 'suppliers', label: 'Fornecedores', permissions: ['SUPPLIERS_MANAGE'] },
    { key: 'products', label: 'Produtos', permissions: ['PRODUCTS_MANAGE'] },
    { key: 'links', label: 'Artes nos produtos', permissions: ['PRODUCTS_MANAGE', 'CONTRACTS_MANAGE'] },
    { key: 'production', label: 'Lotes de produção', permissions: ['PRODUCTS_MANAGE', 'SUPPLIERS_MANAGE'] }
  ];
  access: PlatformAccess | null = null;
  activeTab: CatalogTab = 'artworks';
  loading = true;
  saving = false;
  searchingArtists = false;
  errorMessage = '';
  successMessage = '';

  templates: CommerceContractTemplate[] = [];
  artworks: CommerceArtwork[] = [];
  artworkFiles: CommerceArtworkFile[] = [];
  suppliers: CommerceSupplier[] = [];
  supplierChoices: CommerceSupplierOption[] = [];
  products: CommerceProduct[] = [];
  batches: CommerceBatch[] = [];
  contracts: CommerceSignedAgreement[] = [];
  links: CommerceProductArtwork[] = [];
  artistCandidates: CommerceArtist[] = [];
  externalArtists: CommercialArtist[] = [];
  showExternalArtistForm = false;
  issuedInvitation: IssuedArtistInvitation | null = null;
  issuedInvitationLink = '';
  issuedArtistName = '';
  issuingInvitation = false;
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
    royaltyPercent: 10 as number | null, royaltyFixedAmount: null as number | null
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
    this.errorMessage = '';
    this.successMessage = '';
    if (tab === 'contracts') this.reloadContracts();
    if (tab === 'files') this.reloadFiles();
    if (tab === 'links') this.reloadLinks();
  }

  reload(): void {
    this.loading = true;
    const tasks: Observable<unknown>[] = [];
    if (this.can('ARTWORKS_MANAGE') || this.can('CONTRACTS_MANAGE')) {
      tasks.push(this.fetch(this.catalog.artworks(), items => this.artworks = items));
    }
    if (this.can('ARTWORKS_MANAGE')) {
      tasks.push(this.fetch(this.artistService.profiles(), items => this.externalArtists = items));
    }
    if (this.can('CONTRACTS_MANAGE')) {
      tasks.push(this.fetch(this.catalog.templates(), items => this.templates = items));
    }
    if (this.can('SUPPLIERS_MANAGE')) {
      tasks.push(this.fetch(this.catalog.suppliers(), items => this.suppliers = items));
    }
    if (this.can('PRODUCTS_MANAGE')) {
      tasks.push(this.fetch(this.catalog.products(), items => this.products = items));
      tasks.push(this.fetch(this.catalog.supplierChoices(), items => this.supplierChoices = items));
    }
    if (this.can('SUPPLIERS_MANAGE') && this.can('PRODUCTS_MANAGE')) {
      tasks.push(this.fetch(this.catalog.productionBatches(), items => this.batches = items));
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

  private fetch<T>(request: Observable<T>, apply: (value: T) => void): Observable<unknown> {
    return request.pipe(
      tap(apply),
      map(() => null),
      catchError(() => {
        this.errorMessage = 'Alguns cadastros não puderam ser carregados. Confira os acessos e tente atualizar.';
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

  createExternalArtist(): void {
    if (!this.can('ARTWORKS_MANAGE') || this.saving ||
        !this.externalArtistForm.artistName.trim()) {
      this.errorMessage = 'Informe o nome artístico.';
      return;
    }
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    const form = this.externalArtistForm;
    this.artistService.registerExternal({
      artistName: form.artistName.trim(),
      telegramHandle: form.telegramHandle.trim() || null,
      instagramHandle: form.instagramHandle.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      internalNotes: form.internalNotes.trim() || null
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ id }) => {
        this.saving = false;
        this.artistCandidates = [
          { id, name: form.artistName.trim() },
          ...this.artistCandidates.filter(artist => artist.id !== id)
        ];
        this.artworkForm.artistUserId = id;
        this.artistSearch = form.artistName.trim();
        this.externalArtistForm = {
          artistName: '', telegramHandle: '', instagramHandle: '',
          contactEmail: '', internalNotes: ''
        };
        this.showExternalArtistForm = false;
        this.successMessage = 'Artista externa cadastrada. Já está selecionada para esta arte.';
        this.reload();
      },
      error: () => {
        this.saving = false;
        this.errorMessage = 'Não foi possível cadastrar esta artista externa.';
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

  createArtwork(): void {
    if (!this.can('ARTWORKS_MANAGE') || this.artworkForm.artistUserId == null) {
      this.errorMessage = 'Selecione um artista cadastrado na BraFurries.';
      return;
    }
    this.mutate(this.catalog.createArtwork({
      ...this.artworkForm, artistUserId: this.artworkForm.artistUserId
    }), 'Arte cadastrada.');
  }

  createTemplate(): void {
    if (!this.can('CONTRACTS_MANAGE')) return;
    const form = this.templateForm;
    this.mutate(this.catalog.createTemplate({
      name: form.name, description: form.description || null,
      modality: form.modality, royaltyMethod: form.royaltyMethod,
      royaltyPercent: form.royaltyMethod.startsWith('PERCENT_') ? form.royaltyPercent : null,
      royaltyFixedAmount: form.royaltyMethod.startsWith('FIXED_') ? form.royaltyFixedAmount : null
    }), 'Modelo de contrato cadastrado.');
  }

  createSupplier(): void {
    if (!this.can('SUPPLIERS_MANAGE')) return;
    this.mutate(this.catalog.createSupplier({
      name: this.supplierForm.name,
      contactName: this.supplierForm.contactName || null,
      email: this.supplierForm.email || null,
      phone: this.supplierForm.phone || null,
      notes: this.supplierForm.notes || null
    }), 'Fornecedor cadastrado.');
  }

  createProduct(): void {
    if (!this.can('PRODUCTS_MANAGE')) return;
    this.mutate(this.catalog.createProduct({
      ...this.productForm, description: this.productForm.description || null
    }), 'Produto cadastrado.');
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

  createProduction(): void {
    if (!this.can('PRODUCTS_MANAGE') || !this.can('SUPPLIERS_MANAGE')
      || this.productionForm.productId == null || this.productionForm.supplierId == null) {
      this.errorMessage = 'Selecione o produto e o fornecedor do lote.';
      return;
    }
    this.mutate(this.catalog.createProductionBatch({
      ...this.productionForm, productId: this.productionForm.productId,
      supplierId: this.productionForm.supplierId,
      reference: this.productionForm.reference || null
    }), 'Lote de produção registrado.');
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

  signContract(): void {
    if (!this.can('CONTRACTS_MANAGE') || this.selectedArtworkId == null
      || this.contractForm.templateId == null || !this.contractFile) {
      this.errorMessage = 'Escolha a arte, o modelo e o PDF assinado.';
      return;
    }
    if (!window.confirm('Confirma que este PDF está assinado e contém os termos válidos do contrato?')) return;
    this.mutate(this.catalog.signContract(this.selectedArtworkId,{
      templateId: this.contractForm.templateId,
      effectiveFrom: this.contractForm.effectiveFrom,
      effectiveUntil: this.contractForm.effectiveUntil || null,
      oneTimeAmount: this.contractForm.oneTimeAmount,
      file: this.contractFile
    }), 'Contrato assinado registrado e vinculado à arte.');
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
    this.catalog.artworkFiles(this.selectedArtworkId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: files => this.artworkFiles = files,
        error: () => this.errorMessage = 'Falha ao carregar arquivos privados desta arte.'
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
      return;
    }
    this.catalog.contracts(this.selectedArtworkId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: items => this.contracts = items,
        error: () => this.errorMessage = 'Falha ao carregar os contratos desta arte.'
      });
  }

  reloadLinks(): void {
    if (!this.can('PRODUCTS_MANAGE') || this.selectedProductId == null) {
      this.links = [];
      return;
    }
    this.catalog.productArtworks(this.selectedProductId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: items => this.links = items,
        error: () => this.errorMessage = 'Falha ao carregar as artes do produto.'
      });
  }

  private mutate(request: Observable<unknown>, message: string): void {
    if (this.saving) return;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = message;
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
