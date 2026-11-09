import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ArtistPortfolio, CommerceArtistService } from '../../../core/services/commerce-artist.service';
import { CommerceArtistPortalComponent } from './commerce-artist-portal.component';

describe('CommerceArtistPortalComponent', () => {
  let fixture: ComponentFixture<CommerceArtistPortalComponent>;
  let component: CommerceArtistPortalComponent;
  let artists: jasmine.SpyObj<CommerceArtistService>;

  const portfolio: ArtistPortfolio = {
    year:2026, month:11, accruedMonth:70, accruedTotal:150,
    paidForPeriod:35, paidTotal:45,
    artworks: [
      {id:4,title:'Obra A',status:'ACTIVE',artistUserId:42,
       artistName:'Artista A',accruedMonth:70,accruedTotal:150}
    ],
    settlements: []
  };

  beforeEach(async () => {
    artists = jasmine.createSpyObj<CommerceArtistService>('CommerceArtistService', [
      'portfolio','myClaims','requestClaim'
    ]);
    artists.portfolio.and.returnValue(of(portfolio));
    artists.myClaims.and.returnValue(of([]));
    artists.requestClaim.and.returnValue(of({ id:15 }));
    await TestBed.configureTestingModule({
      declarations:[CommerceArtistPortalComponent],
      imports:[CommonModule,FormsModule],
      providers:[{provide:CommerceArtistService,useValue:artists}]
    }).compileComponents();
    fixture = TestBed.createComponent(CommerceArtistPortalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('shows exclusively the API-calculated personal royalty and payment totals', () => {
    expect(artists.portfolio).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Obra A');
    expect(fixture.nativeElement.textContent).toContain('Minhas artes e royalties');
    expect(fixture.nativeElement.textContent).toContain('Pagamentos registrados');
  });

  it('does not request any third-party account id when changing period', () => {
    component.year=2025; component.month=12; component.reload();
    expect(artists.portfolio).toHaveBeenCalledWith(2025,12);
  });

  it('does not send a claim without a valid artist identifier', () => {
    component.claimArtistId=null;
    component.requestClaim();
    expect(artists.requestClaim).not.toHaveBeenCalled();
    component.claimArtistId=31;
    component.claimMessage='Sou titular';
    component.requestClaim();
    expect(artists.requestClaim).toHaveBeenCalledWith(31,'Sou titular');
  });

  it('rejects invalid accounting dates before reaching the server', () => {
    component.year=2026; component.month=13;
    component.reload();
    expect(component.errorMessage).toContain('mês válidos');
    expect(artists.portfolio).toHaveBeenCalledTimes(1);
  });

  it('does not silently treat failed portfolio calls as zero earnings', () => {
    artists.portfolio.and.returnValue(throwError(() => new Error('backend unavailable')));
    component.reload();
    expect(component.errorMessage).toContain('Não foi possível carregar');
  });
});
