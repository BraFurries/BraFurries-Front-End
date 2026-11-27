import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ReplacementTarget {id:string;name:string;version:string;mimeType:string;}
export interface UploadCapability {enabled:boolean;maxBytes:number;}
export interface UploadStart {sessionId:string;uploadUri:string;}
export interface UploadStatus {sessionId:string;status:string;expired:boolean;resumeAllowed:boolean;}
export interface UploadResult {sessionId:string;status:string;}

@Injectable({providedIn:'root'})
export class GoogleDriveUploadService {
  private readonly endpoint=environment.apiBaseUrl+'/user/me/platform-drive/uploads';
  constructor(private readonly http:HttpClient){}
  private readonly replacementEndpoint=environment.apiBaseUrl+'/user/me/platform-drive/replacements';
  capability(replacement=false){return this.http.get<UploadCapability>((replacement?this.replacementEndpoint:this.endpoint)+'/pilot');}
  begin(anchor:string,destination:string,file:File,target?:ReplacementTarget){
    if(target)return this.http.post<UploadStart>(this.replacementEndpoint,{anchor,destination,file:target.id,
      version:target.version,mime:target.mimeType,size:file.size});
    return this.http.post<UploadStart>(this.endpoint,{anchor,destination,name:file.name,
      mime:file.type||'application/octet-stream',size:file.size});
  }
  status(id:string,replacement=false){return this.http.get<UploadStatus>((replacement?this.replacementEndpoint:this.endpoint)+'/'+encodeURIComponent(id));}
  publish(id:string,replacement=false){return this.http.post<UploadResult>((replacement?this.replacementEndpoint:this.endpoint)+'/'+encodeURIComponent(id)+'/publish',{});}
  cancel(id:string,replacement=false){return this.http.post<UploadResult>((replacement?this.replacementEndpoint:this.endpoint)+'/'+encodeURIComponent(id)+'/cancel',{});}
}
