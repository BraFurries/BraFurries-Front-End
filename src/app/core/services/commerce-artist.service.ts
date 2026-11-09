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
  claimedByUserId: number | null;
  claimedAt: string | null;
  createdAt: string;
}

export interface RegisterCommercialArtist {
  artistName: string;
  telegramHandle: string | null;
  instagramHandle: string | null;
  contactEmail: string | null;
  internalNotes: string | null;
}

export interface ArtistClaim {
  id: number;
  artistUserId: number;
  artistName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  createdAt: string;
  reviewedAt: string | null;
}

export interface PendingArtistClaim {
  id: number;
  artistUserId: number;
  artistName: string;
  telegramHandle: string | null;
  instagramHandle: string | null;
  contactEmail: string | null;
  requesterUserId: number;
  requesterName: string;
  requesterEmail: string | null;
  message: string | null;
  createdAt: string;
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

  portfolio(year: number, month: number): Observable<ArtistPortfolio> {
    return this.http.get<ArtistPortfolio>(`${this.base}/me/portfolio`, {
      params: new HttpParams().set('year', year.toString()).set('month', month.toString())
    });
  }

  myClaims(): Observable<ArtistClaim[]> {
    return this.http.get<ArtistClaim[]>(`${this.base}/me/claims`);
  }

  requestClaim(artistUserId: number, message: string): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/me/claims`, {
      artistUserId, message: message.trim() || null
    });
  }

  pendingClaims(): Observable<PendingArtistClaim[]> {
    return this.http.get<PendingArtistClaim[]>(`${this.base}/claims/pending`);
  }

  approve(claimId: number, verificationMethod: string, verificationNotes: string): Observable<void> {
    return this.http.post<void>(`${this.base}/claims/${claimId}/approve`, {
      verificationMethod, verificationNotes
    });
  }

  reject(claimId: number, reason: string): Observable<void> {
    return this.http.post<void>(`${this.base}/claims/${claimId}/reject`, { reason });
  }

  revoke(artistUserId: number, reason: string): Observable<void> {
    return this.http.post<void>(`${this.base}/profiles/${artistUserId}/revoke`, { reason });
  }
}
