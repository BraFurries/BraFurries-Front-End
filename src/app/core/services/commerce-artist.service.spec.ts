import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CommerceArtistService } from './commerce-artist.service';

describe('CommerceArtistService', () => {
  let artists: CommerceArtistService;
  let http: HttpTestingController;
  const base=`${environment.apiBaseUrl}/user/me/brafurries-commerce/artist`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers:[provideHttpClient(),provideHttpClientTesting(),CommerceArtistService]
    });
    artists=TestBed.inject(CommerceArtistService);
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('fetches only the canonical account portfolio without userId or Community selectors', () => {
    artists.portfolio(2026,11).subscribe();
    const req=http.expectOne(r => r.url===`${base}/me/portfolio` &&
      r.params.get('year')==='2026' && r.params.get('month')==='11');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('userId')).toBeFalse();
    expect(req.request.params.has('communityId')).toBeFalse();
    req.flush({year:2026,month:11,accruedMonth:0,accruedTotal:0,
      paidForPeriod:0,paidTotal:0,artworks:[],settlements:[]});
  });

  it('registers external contact without turning it into login credentials', () => {
    artists.registerExternal({
      artistName:'Artista Telegram',telegramHandle:'@artista',
      instagramHandle:null,contactEmail:'contact@example.invalid',internalNotes:null
    }).subscribe();
    const req=http.expectOne(`${base}/profiles`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.email).toBeUndefined();
    expect(req.request.body.password).toBeUndefined();
    req.flush({id:31});
  });

  it('issues staff-only invitation with numeric artist id but never includes it in the link', () => {
    artists.issueInvitation(31).subscribe();
    const req=http.expectOne(`${base}/invitations`);
    expect(req.request.body).toEqual({artistUserId:31});
    expect(req.request.method).toBe('POST');
    req.flush({id:60,token:'a'.repeat(64),
      confirmationCode:'ABCD1234EF56',expiresAt:'2026-11-11T10:00:00'});
  });

  it('supports in-place activation with independently chosen local email and verification', () => {
    artists.activateInvitation('a'.repeat(64),'ABCD1234EF56',
      'artist@example.invalid','Password123','Password123',true).subscribe();
    const req=http.expectOne(`${environment.apiBaseUrl}/auth/artist-invitation/activate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      token:'a'.repeat(64),confirmationCode:'ABCD1234EF56',
      email:'artist@example.invalid',password:'Password123',
      passwordConfirmation:'Password123',termsAgreement:true
    });
    req.flush({status:'VERIFY_EMAIL',message:'Confirme o e-mail'});
  });

  it('redeems an authenticated invite with fresh password and no actor id supplied by browser', () => {
    artists.redeemInvitation('a'.repeat(64),'ABCD1234EF56','Password123').subscribe();
    const req=http.expectOne(`${base}/invitations/redeem`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      token:'a'.repeat(64),confirmationCode:'ABCD1234EF56',
      accountPassword:'Password123'
    });
    expect(req.request.body.requesterUserId).toBeUndefined();
    req.flush({status:'RELOGIN_REQUIRED',message:'Entre novamente'});
  });
});
