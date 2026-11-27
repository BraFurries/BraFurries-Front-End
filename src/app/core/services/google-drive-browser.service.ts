import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface DriveMount {id:string;name:string;}
export interface DriveEntry extends DriveMount {
  mimeType:string;folder:boolean;size:string|null;modifiedTime:string|null;
}
export interface DrivePage {entries:DriveEntry[];nextPageToken:string|null;canDownload?:boolean;canUpload?:boolean;}

@Injectable({providedIn:'root'})
export class GoogleDriveBrowserService {
  private readonly endpoint=environment.apiBaseUrl+'/user/me/platform-drive/browser';
  constructor(private readonly http:HttpClient){}
  mounts(){return this.http.get<DriveMount[]>(this.endpoint+'/mounts');}
  list(anchor:string,folder:string,pageToken?:string){
    const params=pageToken?new HttpParams().set('pageToken',pageToken):new HttpParams();
    return this.http.get<DrivePage>(this.endpoint+'/mounts/'+encodeURIComponent(anchor)+'/folders/'+encodeURIComponent(folder),{params});
  }

  content(anchor:string,folder:string,file:string,preview:boolean){
    return this.http.get(this.endpoint+'/mounts/'+encodeURIComponent(anchor)+'/folders/'+encodeURIComponent(folder)
      +'/files/'+encodeURIComponent(file)+(preview?'/preview':'/download'),{responseType:'blob'});
  }
}
