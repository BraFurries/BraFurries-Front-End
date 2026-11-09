import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CommerceArtistService } from './commerce-artist.service';

describe('CommerceArtistService', () => {
  let artists: CommerceArtistService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/artist`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CommerceArtistService]
    });
    artists = TestBed.inject(CommerceArtistService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests own portfolio without any user or Community identifier', () => {
    artists.portfolio(2026,11).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/me/portfolio` &&
      r.params.get('year') === '2026' && r.params.get('month') === '11');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('userId')).toBeFalse();
    expect(req.request.params.has('communityId')).toBeFalse();
    req.flush({ year:2026, month:11, accruedMonth:0, accruedTotal:0,
      paidForPeriod:0, paidTotal:0, artworks:[], settlements:[] });
  });

  it('never sends contact as a login or verification credential', () => {
    artists.registerExternal({
      artistName: 'Artista Telegram',telegramHandle:'@contato',
      instagramHandle:null, contactEmail:'contact@example.invalid',internalNotes:null
    }).subscribe();
    const req=http.expectOne(`${base}/profiles`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      artistName:'Artista Telegram',telegramHandle:'@contato',
      instagramHandle:null,contactEmail:'contact@example.invalid',internalNotes:null
    });
    expect(req.request.body.password).toBeUndefined();
    expect(req.request.body.email).toBeUndefined();
    req.flush({ id:33 });
  });

  it('sends only an authenticated applicant claim request; approval remains owner endpoint', () => {
    artists.requestClaim(33,'Sou artista').subscribe();
    const req=http.expectOne(`${base}/me/claims`);
    expect(req.request.body).toEqual({artistUserId:33,message:'Sou artista'});
    expect(req.request.body.applicantUserId).toBeUndefined();
    req.flush({ id:15 });
    artists.approve(15,'TELEGRAM','Canal independente confirmou').subscribe();
    const approve=http.expectOne(`${base}/claims/15/approve`);
    expect(approve.request.method).toBe('POST');
    expect(approve.request.body).toEqual({
      verificationMethod:'TELEGRAM',verificationNotes:'Canal independente confirmou'
    });
    approve.flush(null);
  });
});
