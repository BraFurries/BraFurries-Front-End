import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
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
      'searchArtists','signContract','downloadContract','terminateContract',
      'artworkFiles','uploadArtworkFile','downloadArtworkFile','archiveArtworkFile'
    ]);
    artists = jasmine.createSpyObj<CommerceArtistService>('CommerceArtistService', [
      'profiles','registerExternal','issueInvitation','revokeInvitation'
    ]);
    artists.profiles.and.returnValue(of([]));
    artists.registerExternal.and.returnValue(of({ id: 44 }));
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
      declarations: [CommerceCatalogComponent],
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

  it('offers all eight catalog screens to an authorized owner', async () => {
    await create([],true);
    expect(component.visibleTabs().length).toBe(8);
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
});
