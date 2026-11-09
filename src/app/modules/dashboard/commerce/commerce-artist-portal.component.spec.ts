import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ArtistPortfolio, CommerceArtistService } from '../../../core/services/commerce-artist.service';
import { CommerceArtistPortalComponent } from './commerce-artist-portal.component';

describe('CommerceArtistPortalComponent', () => {
  let fixture:ComponentFixture<CommerceArtistPortalComponent>;
  let component:CommerceArtistPortalComponent;
  let artists:jasmine.SpyObj<CommerceArtistService>;
  const portfolio:ArtistPortfolio={
    year:2026,month:11,accruedMonth:70,accruedTotal:150,
    paidForPeriod:35,paidTotal:45,artworks:[
      {id:4,title:'Obra A',status:'ACTIVE',artistUserId:42,artistName:'Artista A',
       accruedMonth:70,accruedTotal:150}
    ],settlements:[]
  };

  beforeEach(async () => {
    artists=jasmine.createSpyObj<CommerceArtistService>('CommerceArtistService',['portfolio']);
    artists.portfolio.and.returnValue(of(portfolio));
    await TestBed.configureTestingModule({
      declarations:[CommerceArtistPortalComponent],
      imports:[CommonModule,FormsModule],
      providers:[{provide:CommerceArtistService,useValue:artists}]
    }).compileComponents();
    fixture=TestBed.createComponent(CommerceArtistPortalComponent);
    component=fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(()=>fixture.destroy());

  it('shows own canonical artwork and financial totals without any claims button', () => {
    expect(artists.portfolio).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Obra A');
    expect(fixture.nativeElement.textContent).toContain('Minhas artes e royalties');
    expect(fixture.nativeElement.textContent).not.toContain('Solicitar reivindicação');
    expect(fixture.nativeElement.textContent).not.toContain('ID de artista');
  });

  it('changes accounting period without asking for any other user identifier', () => {
    component.year=2025;component.month=12;component.reload();
    expect(artists.portfolio).toHaveBeenCalledWith(2025,12);
  });

  it('fails closed on malformed accounting periods', () => {
    component.month=13;
    component.reload();
    expect(component.errorMessage).toContain('mês válidos');
    expect(artists.portfolio).toHaveBeenCalledTimes(1);
  });

  it('does not represent backend errors as zero royalties', () => {
    artists.portfolio.and.returnValue(throwError(() => new Error('unavailable')));
    component.reload();
    expect(component.portfolio).toBeNull();
    expect(component.errorMessage).toContain('Não foi possível carregar');
  });
});
