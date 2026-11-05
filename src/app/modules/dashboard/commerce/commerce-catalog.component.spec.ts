import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import { CommerceCatalogService } from '../../../core/services/commerce-catalog.service';
import { CommerceCatalogComponent } from './commerce-catalog.component';

describe('CommerceCatalogComponent', () => {
  let fixture: ComponentFixture<CommerceCatalogComponent>;
  let component: CommerceCatalogComponent;
  let access: jasmine.SpyObj<PlatformAccessService>;
  let catalog: jasmine.SpyObj<CommerceCatalogService>;

  async function create(permissions: string[], owner = false, enabled = true): Promise<void> {
    access = jasmine.createSpyObj<PlatformAccessService>('PlatformAccessService', ['myAccess']);
    catalog = jasmine.createSpyObj<CommerceCatalogService>('CommerceCatalogService', [
      'templates','artworks','suppliers','supplierChoices','products','productionBatches',
      'productArtworks','contracts','createArtwork','createTemplate',
      'createSupplier','createProduct','linkArtwork','createProductionBatch',
      'searchArtists','signContract','downloadContract','terminateContract'
    ]);
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
    catalog.productArtworks.and.returnValue(of([]));
    catalog.searchArtists.and.returnValue(of([{ id: 31, name: 'Artista' }]));
    catalog.createArtwork.and.returnValue(of({ id: 14 }));
    catalog.linkArtwork.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      declarations: [CommerceCatalogComponent],
      imports: [CommonModule, FormsModule, RouterTestingModule],
      providers: [
        { provide: PlatformAccessService, useValue: access },
        { provide: CommerceCatalogService, useValue: catalog }
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

  it('offers all seven catalog screens to an authorized owner', async () => {
    await create([],true);
    expect(component.visibleTabs().length).toBe(7);
    expect(catalog.artworks).toHaveBeenCalled();
    expect(catalog.templates).toHaveBeenCalled();
    expect(catalog.suppliers).toHaveBeenCalled();
    expect(catalog.products).toHaveBeenCalled();
  });
});
