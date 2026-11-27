import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface UploadCapability {enabled:boolean;maxBytes:number;}
export interface UploadStart {sessionId:string;uploadUri:string;}
export interface UploadStatus {sessionId:string;status:string;expired:boolean;}
export interface UploadResult {sessionId:string;status:string;}

@Injectable({providedIn:'root'})
export class GoogleDriveUploadService {
  private readonly endpoint=environment.apiBaseUrl+'/user/me/platform-drive/uploads';
  constructor(private readonly http:HttpClient){}
  capability(){return this.http.get<UploadCapability>(this.endpoint+'/pilot');}
  begin(anchor:string,destination:string,file:File){
    return this.http.post<UploadStart>(this.endpoint,{anchor,destination,name:file.name,
      mime:file.type||'application/octet-stream',size:file.size});
  }
  status(id:string){return this.http.get<UploadStatus>(this.endpoint+'/'+encodeURIComponent(id));}
  publish(id:string){return this.http.post<UploadResult>(this.endpoint+'/'+encodeURIComponent(id)+'/publish',{});}
  cancel(id:string){return this.http.post<UploadResult>(this.endpoint+'/'+encodeURIComponent(id)+'/cancel',{});}
}
