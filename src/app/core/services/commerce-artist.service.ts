import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CommercialArtist {
  userId: number;
  artistName: string;
  telegramHandle: string | null;
  instagramHandle: string | null;
  contactEmail: string | null;
  internalNotes: string | null;
  canInvite: number | boolean;
  createdAt: string;
}

export interface RegisterCommercialArtist {
  artistName: string;
  telegramHandle: string | null;
  instagramHandle: string | null;
  contactEmail: string | null;
  internalNotes: string | null;
}

export interface IssuedArtistInvitation {
  id: number;
  token: string;
  confirmationCode: string;
  expiresAt: string;
}

export interface InvitationResult {
  status: 'VERIFY_EMAIL' | 'RELOGIN_REQUIRED';
  message: string;
}

export interface PersonalArtistAccess {
  eligible: boolean;
}

export interface ArtistPortfolioArtwork {
  id: number;
  title: string;
  status: string;
  artistUserId: number;
  artistName: string;
  accruedTotal: number;
  accruedMonth: number;
}

export interface ArtistPortfolioStatement {
  id: number;
  artistUserId: number;
  artistName: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
}

export interface ArtistPortfolio {
  year: number;
  month: number;
  accruedMonth: number;
  accruedTotal: number;
  paidForPeriod: number;
  paidTotal: number;
  artworks: ArtistPortfolioArtwork[];
  settlements: ArtistPortfolioStatement[];
}

/**
 * The only ownership entry is an admin-issued, short-lived invitation.
 * No artist ID search, spontaneous claim, or permanent alias ownership.
 */
@Injectable({ providedIn: 'root' })
export class CommerceArtistService {
  private readonly base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/artist`;

  constructor(private readonly http: HttpClient) {}

  profiles(): Observable<CommercialArtist[]> {
    return this.http.get<CommercialArtist[]>(`${this.base}/profiles`);
  }

  registerExternal(input: RegisterCommercialArtist): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/profiles`, input);
  }

  updateArtist(id: number,input: RegisterCommercialArtist): Observable<void> {
    return this.http.put<void>(
      `${environment.apiBaseUrl}/user/me/brafurries-commerce/artist/profiles/${id}`,input
    );
  }

  /** The API derives eligibility solely from the authenticated canonical user. */
  myAccess(): Observable<PersonalArtistAccess> {
    return this.http.get<PersonalArtistAccess>(`${this.base}/me/access`);
  }

  portfolio(year: number, month: number): Observable<ArtistPortfolio> {
    return this.http.get<ArtistPortfolio>(`${this.base}/me/portfolio`, {
      params: new HttpParams().set('year', year.toString()).set('month', month.toString())
    });
  }

  issueInvitation(artistUserId: number): Observable<IssuedArtistInvitation> {
    return this.http.post<IssuedArtistInvitation>(`${this.base}/invitations`, { artistUserId });
  }

  revokeInvitation(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/invitations/${id}/revoke`, {});
  }

  redeemInvitation(token: string, confirmationCode: string,
                   accountPassword: string): Observable<InvitationResult> {
    return this.http.post<InvitationResult>(`${this.base}/invitations/redeem`, {
      token, confirmationCode, accountPassword
    });
  }

  activateInvitation(token: string, confirmationCode: string,
                     email: string, password: string,
                     passwordConfirmation: string,
                     termsAgreement: boolean): Observable<InvitationResult> {
    return this.http.post<InvitationResult>(
      `${environment.apiBaseUrl}/auth/artist-invitation/activate`,
      { token, confirmationCode, email, password, passwordConfirmation, termsAgreement }
    );
  }
}
