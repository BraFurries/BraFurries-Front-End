import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PartnerDiscordItem {
  partnerId: number;
  name: string;
  status: 'active' | 'pending' | 'suspended';
  representativeName: string | null;
  representativeDiscordUserId: string | null;
  exclusiveChannelEnabled: boolean;
  existingTextChannelId: string | null;
  adoptExistingTextChannel: boolean;
  threadId: string | null;
  textChannelId: string | null;
  desiredRevision: number;
  appliedRevision: number;
  lastSyncError: string | null;
  contentOutOfSync: boolean;
}

export interface PartnerDiscordSettings {
  guildId: string;
  categoryId: string | null;
  threadParentChannelId: string | null;
  configured: boolean;
  partners: PartnerDiscordItem[];
}

export interface OwnPartnerPublication {
  partnerId: number;
  partnerName: string;
  guildId: string;
  threadId: string;
}

export interface PartnerDiscordConfigRequest {
  categoryId: string | null;
  threadParentChannelId: string | null;
}

export interface PartnerDiscordOptionRequest {
  exclusiveChannelEnabled: boolean;
  existingTextChannelId: string | null;
  adoptExistingTextChannel: boolean;
}

@Injectable({ providedIn: 'root' })
export class PartnerDiscordService {
  private readonly baseUrl = `${environment.apiBaseUrl}/admin/partners`;

  constructor(private readonly http: HttpClient) {}

  getSettings(): Observable<PartnerDiscordSettings> {
    return this.http.get<PartnerDiscordSettings>(`${this.baseUrl}/discord`);
  }

  updateConfig(payload: PartnerDiscordConfigRequest): Observable<PartnerDiscordSettings> {
    return this.http.put<PartnerDiscordSettings>(`${this.baseUrl}/discord`, payload);
  }

  updatePartner(partnerId: number, payload: PartnerDiscordOptionRequest): Observable<PartnerDiscordItem> {
    return this.http.put<PartnerDiscordItem>(`${this.baseUrl}/${partnerId}/discord`, payload);
  }

  syncPartner(partnerId: number): Observable<PartnerDiscordItem> {
    return this.http.post<PartnerDiscordItem>(`${this.baseUrl}/${partnerId}/discord/sync`, {});
  }

  unpublishPartner(partnerId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${partnerId}/discord`);
  }

  syncAll(): Observable<PartnerDiscordItem[]> {
    return this.http.post<PartnerDiscordItem[]>(`${this.baseUrl}/discord/sync`, {});
  }

  getMyPublications(): Observable<OwnPartnerPublication[]> {
    return this.http.get<OwnPartnerPublication[]>(`${environment.apiBaseUrl}/user/me/partners/discord`);
  }

  /** A representative posts via the API, never via a Coddy internal URL. */
  publishAsRepresentative(partnerId: number, content: string): Observable<{ messageId: string; threadId: string }> {
    return this.http.post<{ messageId: string; threadId: string }>(
      `${environment.apiBaseUrl}/user/me/partners/${partnerId}/discord/posts`,
      { content }
    );
  }
}
