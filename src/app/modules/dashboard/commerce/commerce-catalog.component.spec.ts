import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { CommerceNavigationComponent } from './commerce-navigation.component';
import { of } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import { CommerceCatalogService } from '../../../core/services/commerce-catalog.service';
import { CommerceArtistService } from '../../../core/services/commerce-artist.service';
import { CommerceCatalogComponent } from './commerce-catalog.component';

describe('CommerceCatalogComponent', () => {
  let fixture: ComponentFixture<CommerceCatalogComponent>;
  let component: CommerceCatalogComponent;
  let access: jasmine.SpyObj<PlatformAccessService>;
  let catalog: jasmine.SpyObj<CommerceCatalogService>;
  let artists: jasmine.SpyObj<CommerceArtistService>;

  async function create(permissions: string[], owner = false, enabled = true): Promise<void> {
    access = jasmine.createSpyObj<PlatformAccessService>('PlatformAccessService', ['myAccess']);
    catalog = jasmine.createSpyObj<CommerceCatalogService>('CommerceCatalogService', [
      'templates','artworks','suppliers','supplierChoices','products','productionBatches',
      'productArtworks','contracts','createArtwork','createTemplate',
      'createSupplier','createProduct','linkArtwork','createProductionBatch',
      'correctProductionBatch','productionBatchHistory',
      'searchArtists','signContract','downloadContract','terminateContract',
      'artworkFiles','uploadArtworkFile','downloadArtworkFile','archiveArtworkFile',
      'updateArtwork','setArtworkArchived','deleteArtwork','updateSupplier',
      'setSupplierActive','deleteSupplier','updateProduct','setProductActive','deleteProduct',
      'updateTemplate','setTemplateActive','deleteTemplate','unlinkArtwork'
    ]);
    artists = jasmine.createSpyObj<CommerceArtistService>('CommerceArtistService', [
      'profiles','registerExternal','updateArtist','issueInvitation','revokeInvitation'
    ]);
    artists.profiles.and.returnValue(of([]));
    artists.registerExternal.and.returnValue(of({ id: 44 }));
    artists.updateArtist.and.returnValue(of(void 0));
    catalog.updateArtwork.and.returnValue(of(void 0));
    catalog.setArtworkArchived.and.returnValue(of(void 0));
    catalog.deleteArtwork.and.returnValue(of(void 0));
    catalog.unlinkArtwork.and.returnValue(of(void 0));
    catalog.correctProductionBatch.and.returnValue(of(void 0));
    catalog.productionBatchHistory.and.returnValue(of([]));
    artists.issueInvitation.and.returnValue(of({
      id:62,token:'a'.repeat(64),confirmationCode:'ABCD1234EF56',
      expiresAt:'2026-11-11T10:00:00'
    }));
    artists.revokeInvitation.and.returnValue(of(void 0));
    access.myAccess.and.returnValue(of({ enabled, owner, permissions }));
    catalog.artworks.and.returnValue(of([
      { id: 12, title: 'Arte A', artistUserId: 31, artistName: 'Artista',
        creationCost: 100, status: 'ACTIVE', description: null }
    ]));
    catalog.templates.and.returnValue(of([{
      id: 13, name: 'Royalties', modality: 'ROYALTY', royaltyMethod: 'PERCENT_GROSS',
      royaltyPercent: 10, royaltyFixedAmount: null, active: true, description: null
    }]));
    catalog.suppliers.and.returnValue(of([]));
    catalog.supplierChoices.and.returnValue(of([{ id: 8, name: 'Oficina' }]));
    catalog.products.and.returnValue(of([{
      id: 3, sku: 'SKU-3', name: 'Caneca', description: null,
      estimatedUnitCost: 20, suggestedPrice: 60, active: true,
      preferredSupplierId: 8, preferredSupplierName: 'Oficina'
    }]));
    catalog.productionBatches.and.returnValue(of([]));
    catalog.contracts.and.returnValue(of([]));
    catalog.artworkFiles.and.returnValue(of([]));
    catalog.uploadArtworkFile.and.returnValue(of({ id: 51 }));
    catalog.archiveArtworkFile.and.returnValue(of(void 0));
    catalog.productArtworks.and.returnValue(of([]));
    catalog.searchArtists.and.returnValue(of([{ id: 31, name: 'Artista' }]));
    catalog.createArtwork.and.returnValue(of({ id: 14 }));
    catalog.linkArtwork.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      declarations: [CommerceCatalogComponent, CommerceNavigationComponent],
      imports: [CommonModule, FormsModule, RouterTestingModule],
      providers: [
        { provide: PlatformAccessService, useValue: access },
        { provide: CommerceCatalogService, useValue: catalog },
        { provide: CommerceArtistService, useValue: artists }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CommerceCatalogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  it('does not query private catalog endpoints for unapproved people', async () => {
    await create([]);
    expect(fixture.nativeElement.textContent).toContain('Você não tem permissão');
    expect(catalog.artworks).not.toHaveBeenCalled();
    expect(catalog.products).not.toHaveBeenCalled();
    expect(catalog.templates).not.toHaveBeenCalled();
  });

  it('does not query other business areas for limited product managers', async () => {
    await create(['PRODUCTS_MANAGE']);
    expect(component.visibleTabs().map(t => t.key)).toEqual(['products']);
    expect(catalog.products).toHaveBeenCalledTimes(1);
    expect(catalog.artworks).not.toHaveBeenCalled();
    expect(catalog.templates).not.toHaveBeenCalled();
    expect(catalog.suppliers).not.toHaveBeenCalled();
  });

  it('lets artist managers search real users and register artwork', async () => {
    await create(['ARTWORKS_MANAGE']);
    component.artistSearch = 'Art';
    component.searchForArtists();
    component.artworkForm = { title: 'Nova arte', description: '',
      artistUserId: 31, creationCost: 150 };
    component.createArtwork();

    expect(catalog.searchArtists).toHaveBeenCalledWith('Art');
    expect(catalog.createArtwork).toHaveBeenCalledWith(jasmine.objectContaining({
      artistUserId: 31, creationCost: 150
    }));
    expect(component.successMessage).toContain('Arte cadastrada');
  });

  it('requires both product and contract permissions to allocate royalty shares', async () => {
    await create(['PRODUCTS_MANAGE']);
    component.selectedProductId = 3;
    component.linkedArtworkId = 12;
    component.linkArtwork();
    expect(catalog.linkArtwork).not.toHaveBeenCalled();

    component.access = { enabled: true, owner: false,
      permissions: ['PRODUCTS_MANAGE','CONTRACTS_MANAGE'] };
    component.linkArtwork();
    expect(catalog.linkArtwork).toHaveBeenCalledWith(3,12,null);
  });

  it('limits document interactions to authorized contract managers', async () => {
    await create(['PRODUCTS_MANAGE']);
    expect(component.visibleTabs().some(t => t.key === 'contracts')).toBeFalse();
    expect(catalog.contracts).not.toHaveBeenCalled();
    expect(catalog.downloadContract).not.toHaveBeenCalled();
  });

  it('keeps only operational catalog and finance navigation, without Teams or Access', async () => {
    await create(['PRODUCTS_MANAGE']);
    const header = fixture.nativeElement.querySelector('header') as HTMLElement;
    expect(header.textContent).not.toContain('Equipe e Acessos');
    expect(header.textContent).not.toContain('Gerenciar permissões');
    expect(header.querySelector('a[href="/painel/gestao-comercial/financeiro"]')).toBeTruthy();
    expect(header.querySelector('a[href="/painel/gestao-comercial"]')).toBeNull();
  });

  it('restricts artwork file listing to explicitly authorized artwork managers', async () => {
    await create(['PRODUCTS_MANAGE']);
    expect(component.visibleTabs().some(tab => tab.key === 'files')).toBeFalse();
    expect(catalog.artworkFiles).not.toHaveBeenCalled();
    component.reloadFiles();
    expect(catalog.artworkFiles).not.toHaveBeenCalled();
  });

  it('uploads artwork source files only for authorized accounts and selected artwork', async () => {
    await create(['ARTWORKS_MANAGE']);
    const file = new File(['sample'], 'source.psd', { type: 'application/octet-stream' });
    component.artworkUpload = file;
    component.selectedArtworkId = 12;
    component.artworkFileKind = 'SOURCE';
    component.artworkFileDescription = 'Original editável';
    component.uploadArtworkFile();
    expect(catalog.uploadArtworkFile).toHaveBeenCalledWith(
      12,'SOURCE','Original editável',file);
    expect(component.successMessage).toContain('Arquivo da arte');
  });

  it('offers seven consolidated catalog sections to an authorized owner', async () => {
    await create([],true);
    expect(component.visibleTabs().length).toBe(7);
    expect(catalog.artworks).toHaveBeenCalled();
    expect(catalog.templates).toHaveBeenCalled();
    expect(catalog.suppliers).toHaveBeenCalled();
    expect(catalog.products).toHaveBeenCalled();
  });
  it('lets managers create Telegram artists without losing the pending artwork', async () => {
    await create(['ARTWORKS_MANAGE']);
    component.artworkForm.title = 'Arte encomendada';
    component.externalArtistForm.artistName = 'Artista Telegram';
    component.externalArtistForm.telegramHandle = '@canal';
    component.createExternalArtist();
    expect(artists.registerExternal).toHaveBeenCalledWith(jasmine.objectContaining({
      artistName: 'Artista Telegram', telegramHandle: '@canal',
      contactEmail: null
    }));
    expect(component.artworkForm.artistUserId).toBe(44);
    expect(component.artworkForm.title).toBe('Arte encomendada');
    expect(component.artistCandidates.some(a => a.id === 44)).toBeTrue();
  });

  it('only an owner can issue invitations for unactivated external artists', async () => {
    await create(['ARTWORKS_MANAGE'],false);
    const external = {
      userId:44,artistName:'Artista Telegram',telegramHandle:'@canal',
      instagramHandle:null,contactEmail:null,internalNotes:null,
      canInvite:1,createdAt:'2026-11-09'
    };
    component.issueInvitation(external);
    expect(artists.issueInvitation).not.toHaveBeenCalled();
    component.access={enabled:true,owner:true,permissions:[]};
    component.issueInvitation(external);
    expect(artists.issueInvitation).toHaveBeenCalledWith(44);
    expect(component.issuedInvitationLink).toContain('/artist-invite?token=');
    expect(component.issuedInvitationLink).not.toContain('artistUserId');
    expect(component.issuedInvitation?.confirmationCode).toBe('ABCD1234EF56');
    component.clearIssuedInvitation();
    expect(component.issuedInvitation).toBeNull();
  });

  it('never issues a new invite for already activated accounts', async () => {
    await create([],true);
    component.issueInvitation({
      userId:44,artistName:'Ativada',telegramHandle:null,
      instagramHandle:null,contactEmail:null,internalNotes:null,
      canInvite:0,createdAt:'2026-11-09'
    });
    expect(artists.issueInvitation).not.toHaveBeenCalled();
  });

  it('edits an artwork without creating a second artwork or changing its owner', async () => {
    await create(['ARTWORKS_MANAGE']);
    const artwork=component.artworks[0];
    component.startEditArtwork(artwork);
    expect(component.editingArtworkId).toBe(12);
    component.artworkForm.title='Arte corrigida';
    component.createArtwork();
    expect(catalog.updateArtwork).toHaveBeenCalledWith(12,jasmine.objectContaining({
      title:'Arte corrigida',artistUserId:31,creationCost:100
    }));
    expect(catalog.createArtwork).not.toHaveBeenCalled();
  });

  it('uses the API to archive an artwork and only deletes after confirmation', async () => {
    await create(['ARTWORKS_MANAGE']);
    const artwork=component.artworks[0];
    spyOn(window,'confirm').and.returnValue(true);
    component.toggleArtwork(artwork);
    expect(catalog.setArtworkArchived).toHaveBeenCalledWith(12,true);
    component.deleteArtwork(artwork);
    expect(catalog.deleteArtwork).toHaveBeenCalledWith(12);
  });

  it('allows updating administrative artist information without changing account credentials', async () => {
    await create(['ARTWORKS_MANAGE']);
    const artist={userId:35,artistName:'Artista externa',telegramHandle:'@ar',
      instagramHandle:null,contactEmail:null,internalNotes:null,
      canInvite:true,createdAt:'2026-11-09'};
    component.startEditArtist(artist);
    component.externalArtistForm.artistName='Artista revisada';
    component.createExternalArtist();
    expect(artists.updateArtist).toHaveBeenCalledWith(35,jasmine.objectContaining({
      artistName:'Artista revisada',telegramHandle:'@ar'
    }));
    expect(artists.registerExternal).not.toHaveBeenCalled();
  });

  it('corrects a lot with reason and never creates another lot', async () => {
    await create(['PRODUCTS_MANAGE','SUPPLIERS_MANAGE']);
    component.startEditBatch({
      id:45,productId:3,productName:'Caneca',supplierId:8,supplierName:'Oficina',
      quantity:20,unitCost:8,additionalCost:10,totalCost:170,
      producedOn:'2026-11-03',reference:'NF-1'
    });
    component.productionForm.reference='NF-2';
    component.batchCorrectionReason='Referência fiscal incorreta';
    component.createProduction();
    expect(catalog.correctProductionBatch).toHaveBeenCalledWith(45,
      jasmine.objectContaining({
        productId:3,supplierId:8,quantity:20,unitCost:8,reference:'NF-2'
      }),'Referência fiscal incorreta');
    expect(catalog.createProductionBatch).not.toHaveBeenCalled();
    expect(component.editingBatchId).toBeNull();
  });

  it('does not submit a production correction without justification', async () => {
    await create(['PRODUCTS_MANAGE','SUPPLIERS_MANAGE']);
    component.startEditBatch({
      id:45,productId:3,productName:'Caneca',supplierId:8,supplierName:'Oficina',
      quantity:20,unitCost:8,additionalCost:10,totalCost:170,
      producedOn:'2026-11-03',reference:'NF-1'
    });
    component.batchCorrectionReason='';
    component.createProduction();
    expect(catalog.correctProductionBatch).not.toHaveBeenCalled();
  });

  it('loads and displays before/after production revision history', async () => {
    await create(['PRODUCTS_MANAGE','SUPPLIERS_MANAGE']);
    catalog.productionBatchHistory.and.returnValue(of([{
      id:1,beforeJson:'{"quantity":10,"productId":3,"supplierId":8,"unitCost":10,"additionalCost":0,"producedOn":"2026-11-02","reference":"OLD"}',
      afterJson:'{"quantity":12,"productId":3,"supplierId":8,"unitCost":10,"additionalCost":0,"producedOn":"2026-11-02","reference":"NEW"}',
      reason:'Quantidade digitada errada',actorUserId:7,createdAt:'2026-11-09T13:00:00'
    }]));
    component.loadBatchHistory(45);
    expect(catalog.productionBatchHistory).toHaveBeenCalledWith(45);
    expect(component.batchRevisions.length).toBe(1);
    expect(component.describeBatchSnapshot(component.batchRevisions[0].afterJson))
      .toContain('12 un.');
  });

  it('keeps artwork browsing and editing on different screens', async () => {
    await create(['ARTWORKS_MANAGE']);
    expect(fixture.nativeElement.textContent).toContain('Artes cadastradas');
    component.openCreate('artworks');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cadastrar arte');
    expect(fixture.nativeElement.textContent).not.toContain('Artes cadastradas');
    component.backToList();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Artes cadastradas');
  });

  it('shows private files within the selected artwork record, never under a detached tab', async () => {
    await create(['ARTWORKS_MANAGE']);
    catalog.artworkFiles.and.returnValue(of([{
      id: 51, artworkId: 12, kind: 'SOURCE', originalName: 'mascote.psd',
      extension: 'psd', mediaType: 'application/octet-stream', description: null,
      sha256: 'abc', sizeBytes: 4096, status: 'ACTIVE', uploadedByUserId: 1,
      createdAt: '2026-11-11T13:00:00', archivedAt: null
    }]));
    component.reloadFiles();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('mascote.psd');
    expect(component.visibleTabs().some(tab => tab.key === 'files')).toBeFalse();
    component.openCreate('files', 12);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Enviar arquivo privado');
    expect(fixture.nativeElement.textContent).not.toContain('Artes cadastradas');
  });

  it('shows linked artwork names in product details without requiring contract management to view', async () => {
    await create(['PRODUCTS_MANAGE']);
    catalog.productArtworks.and.returnValue(of([{
      artworkId: 12, title: 'Arte do mascote', royaltyAllocationPercent: 50
    }]));
    component.reloadLinks();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Arte do mascote');
    expect(fixture.nativeElement.textContent).not.toContain('+ Vincular arte');
    component.openCreate('links', 3);
    expect(component.activeTab).toBe('products');
    component.access = { enabled: true, owner: false,
      permissions: ['PRODUCTS_MANAGE', 'CONTRACTS_MANAGE'] };
    component.openCreate('links', 3);
    fixture.detectChanges();
    expect(component.screen).toBe('form');
    expect(fixture.nativeElement.textContent).not.toContain('Catálogo de produtos');
  });

  it('preserves pending artwork values through separate external artist registration', async () => {
    await create(['ARTWORKS_MANAGE']);
    component.openCreate('artworks');
    component.artworkForm.title = 'Obra em andamento';
    component.openCreate('artists');
    component.externalArtistForm.artistName = 'Criadora';
    component.createExternalArtist();
    expect(component.activeTab).toBe('artworks');
    expect(component.screen).toBe('form');
    expect(component.artworkForm.title).toBe('Obra em andamento');
    expect(component.artworkForm.artistUserId).toBe(44);
  });

  it('visually relates each signed contract to its artwork and template', async () => {
    await create(['ARTWORKS_MANAGE','CONTRACTS_MANAGE']);
    catalog.contracts.and.returnValue(of([{
      id: 21, artworkId: 12, templateId: 13, artistUserId: 31,
      modality: 'ROYALTY', royaltyMethod: 'PERCENT_GROSS',
      royaltyPercent: 10, royaltyFixedAmount: null, oneTimeAmount: 0,
      effectiveFrom: '2026-11-01', effectiveUntil: null,
      sha256: 'abc123', sizeBytes: 5000, status: 'ACTIVE'
    }]));
    component.selectTab('contracts');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Arte: Arte A');
    expect(text).toContain('Modelo: Royalties');
    expect(text).toContain('Assinado #21');
    component.openCreate('contracts', 12);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Assinado #21');
    expect(fixture.nativeElement.textContent).toContain('Registrar contrato assinado');
  });

  it('renders the same fixed navigation base and link order as Financeiro', async () => {
    await create(['ARTWORKS_MANAGE']);
    const nav = fixture.nativeElement.querySelector('nav[aria-label="Áreas da Gestão Comercial"]') as HTMLElement;
    const links = Array.from(nav.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map(link => link.textContent?.trim())).toEqual(['Financeiro', 'Cadastros']);
    expect(links.map(link => new URL(link.href).pathname)).toEqual([
      '/painel/gestao-comercial/financeiro', '/painel/gestao-comercial/catalogo'
    ]);
    expect(links[1].getAttribute('aria-current')).toBe('page');
  });
});
