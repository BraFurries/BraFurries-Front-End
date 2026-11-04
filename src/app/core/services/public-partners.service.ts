import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Public projection intentionally omits contacts, staff, permissions and metrics. */
export interface PublicPartner {
  id: number;
  name: string;
  category: string;
  imageUrl: string | null;
  url: string | null;
}

@Injectable({ providedIn: 'root' })
export class PublicPartnersService {
  private readonly url = `${environment.apiBaseUrl}/public/partners`;

  constructor(private readonly http: HttpClient) {}

  getActive(): Observable<PublicPartner[]> {
    return this.http.get<PublicPartner[]>(this.url);
  }
}
