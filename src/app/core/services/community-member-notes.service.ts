import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface CommunityMemberNote {
  id: number;
  userId: number;
  authorUserId: number;
  authorDisplayName: string;
  updatedByUserId: number;
  updatedByDisplayName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class CommunityMemberNotesService {
  constructor(private readonly http: HttpClient) {}

  list(
    communityId: number,
    userId: number,
    includeArchived = false
  ): Observable<CommunityMemberNote[]> {
    const params = new HttpParams().set('includeArchived', includeArchived);
    return this.http.get<CommunityMemberNote[]>(
      this.url(communityId, userId),
      { params }
    );
  }

  create(
    communityId: number,
    userId: number,
    content: string
  ): Observable<CommunityMemberNote> {
    return this.http.post<CommunityMemberNote>(
      this.url(communityId, userId),
      { content }
    );
  }

  update(
    communityId: number,
    userId: number,
    noteId: number,
    content: string
  ): Observable<CommunityMemberNote> {
    return this.http.put<CommunityMemberNote>(
      `${this.url(communityId, userId)}/${noteId}`,
      { content }
    );
  }

  archive(
    communityId: number,
    userId: number,
    noteId: number
  ): Observable<CommunityMemberNote> {
    return this.http.patch<CommunityMemberNote>(
      `${this.url(communityId, userId)}/${noteId}/archive`,
      {}
    );
  }

  private url(communityId: number, userId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/members/${userId}/notes`;
  }
}
