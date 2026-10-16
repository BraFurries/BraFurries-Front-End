import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EventTransferInvite } from '../models/invite.model';

@Injectable({
  providedIn: 'root'
})
export class InviteService {

  constructor(private http: HttpClient) { }

  getEventTransferInvite(token: string): Observable<EventTransferInvite> {
    const endpoint = `${environment.apiBaseUrl}/invites/event-transfer/${token}`;
    return this.http.get<EventTransferInvite>(endpoint);
  }

  respondToEventTransferInvite(token: string, action: 'accept' | 'reject'): Observable<void> {
    const endpoint = `${environment.apiBaseUrl}/invites/${token}/${action}`;
    return this.http.post<void>(endpoint, {});
  }
}
