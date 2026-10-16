import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DiscordServerInfo } from '../../shared/models/discordServerInfo';

@Injectable({
  providedIn: 'root'
})
export class DiscordService {
  private readonly baseUrl = 'https://discord.com/api/v10/invites/brafurries?with_counts=true'; 

  constructor(private http: HttpClient) {}

  getServerInfo(): Observable<DiscordServerInfo> {
    return this.http.get<DiscordServerInfo>(this.baseUrl);
  }

}