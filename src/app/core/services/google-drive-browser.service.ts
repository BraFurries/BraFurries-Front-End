import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface DriveMount {id:string;name:string;}
export interface DriveEntry extends DriveMount {
  mimeType:string;folder:boolean;size:string|null;modifiedTime:string|null;version?:string|null;canRename?:boolean;canViewHistory?:boolean;canReplace?:boolean;canMove?:boolean;canCopy?:boolean;canTrash?:boolean;
}
export type DriveTransferAction='MOVE'|'COPY';
export interface DriveTransferRequest {sourceAnchor:string;parent:string;file:string;version:string;destinationAnchor:string;destination:string;action:DriveTransferAction;operationId:string;}
export interface DrivePage {entries:DriveEntry[];nextPageToken:string|null;canDownload?:boolean;canUpload?:boolean;canCreateFolder?:boolean;canStreamDownload?:boolean;streamMaxBytes?:number;canViewTrash?:boolean;}

export interface DriveTrashItem {operationId:string;name:string;mimeType:string;version:string;trashedAt:string|null;canRestore:boolean;}
export interface DriveTrashPage {items:DriveTrashItem[];nextCursor:string|null;}
export interface DriveRevision {id:string;modifiedTime:string;size:string;kept:boolean;current:boolean;}
export interface DriveHistory {revisions:DriveRevision[];nextPageToken:string|null;}

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

  downloadTicket(anchor:string,folder:string,file:string){
    return this.http.post<{ticket:string}>(environment.apiBaseUrl+'/user/me/platform-drive/downloads/ticket',{anchor,folder,file});
  }
  redeemDownload(ticket:string):void {
    if(!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw new Error('Download indisponível');
    const endpoint=new URL(environment.apiBaseUrl+'/user/me/platform-drive/downloads/redeem',window.location.origin);
    // Native attachment, no JS Blob containing the complete file. The capability
    // travels in the POST body, not in the URL or a persistent browser store.
    const frame=document.createElement('iframe');
    frame.name='brf-download-'+crypto.randomUUID();frame.hidden=true;
    frame.title='Transferência de arquivo';frame.referrerPolicy='no-referrer';
    document.body.appendChild(frame);
    const form=document.createElement('form');form.method='POST';form.action=endpoint.href;
    form.target=frame.name;form.hidden=true;
    const field=document.createElement('input');field.type='hidden';field.name='ticket';field.value=ticket;
    form.appendChild(field);document.body.appendChild(form);
    try{form.submit();}catch{frame.remove();throw new Error('Não foi possível iniciar o download');}
    finally{field.value='';form.remove();}
    // Do not remove the frame immediately: some browsers still own the request.
    setTimeout(()=>frame.remove(),2*60*60*1000+60000);
  }
  createFolder(anchor:string,parent:string,name:string,operationId:string){
    return this.http.post<{id:string;name:string}>(environment.apiBaseUrl+'/user/me/platform-drive/folder-operations',
      {anchor,parent,name,operationId});
  }

  rename(anchor:string,parent:string,file:string,version:string,name:string,operationId:string){
    return this.http.post<{id:string;name:string;version:string}>(environment.apiBaseUrl+'/user/me/platform-drive/rename-operations',
      {anchor,parent,file,version,name,operationId});
  }

  history(anchor:string,folder:string,file:string,pageToken?:string){
    const params=pageToken?new HttpParams().set('pageToken',pageToken):new HttpParams();
    return this.http.get<DriveHistory>(this.endpoint+'/mounts/'+encodeURIComponent(anchor)+'/folders/'+encodeURIComponent(folder)
      +'/files/'+encodeURIComponent(file)+'/revisions',{params});
  }

  transfer(request:DriveTransferRequest){
    return this.http.post<{id:string;name:string}>(environment.apiBaseUrl+'/user/me/platform-drive/transfer-operations',request);
  }

  private readonly trashEndpoint=environment.apiBaseUrl+'/user/me/platform-drive/trash';
  trashList(anchor:string,cursor?:string){
    let params=new HttpParams().set('anchor',anchor);
    if(cursor)params=params.set('cursor',cursor);
    return this.http.get<DriveTrashPage>(this.trashEndpoint,{params});
  }
  trashFile(anchor:string,parent:string,file:string,version:string,operationId:string){
    return this.http.post<{operationId:string;status:string}>(this.trashEndpoint,{anchor,parent,file,version,operationId});
  }
  restoreTrash(anchor:string,id:string,version:string){
    return this.http.post<{operationId:string;status:string}>(this.trashEndpoint+'/'+encodeURIComponent(id)+'/restore',{anchor,version});
  }
}
