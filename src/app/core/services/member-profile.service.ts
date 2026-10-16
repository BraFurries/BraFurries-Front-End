import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MemberCommunityContextResponse,
  MemberModerationPage,
  MemberProfileResponse,
  UpdateMemberProfileResponse,
  UpdateProfileImageResponse
} from '../../shared/models/api/member-profile/member-profile';

@Injectable({ providedIn: 'root' })
export class MemberProfileService {
  private readonly baseUrl = `${environment.apiBaseUrl}/user/me`;

  constructor(private readonly http: HttpClient) {}

  getProfile(): Observable<MemberProfileResponse> {
    return this.http.get<MemberProfileResponse>(`${this.baseUrl}/profile`);
  }

  updateDisplayName(displayName: string): Observable<UpdateMemberProfileResponse> {
    return this.http.patch<UpdateMemberProfileResponse>(`${this.baseUrl}/profile`, { displayName });
  }

  uploadProfileImage(file: File): Observable<UpdateProfileImageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.put<UpdateProfileImageResponse>(`${this.baseUrl}/profile-image`, formData);
  }

  deleteProfileImage(): Observable<UpdateProfileImageResponse> {
    return this.http.delete<UpdateProfileImageResponse>(`${this.baseUrl}/profile-image`);
  }

  getCommunityContext(communityId: number): Observable<MemberCommunityContextResponse> {
    return this.http.get<MemberCommunityContextResponse>(`${this.baseUrl}/communities/${communityId}/context`);
  }

  getModeration(communityId: number, page: number, pageSize: number): Observable<MemberModerationPage> {
    const params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    return this.http.get<MemberModerationPage>(`${this.baseUrl}/communities/${communityId}/moderation`, { params });
  }
}
