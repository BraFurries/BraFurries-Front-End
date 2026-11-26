import { Injectable, NgZone } from '@angular/core';

export interface PickerConfig {
  clientId:string; apiKey:string; projectNumber:string; folderId:string;
  googleSubject:string; googleEmail:string;
}
export interface PickerDocument { id?:string; name?:string; url?:string; mimeType?:string; }
interface PickerResponse { action:string; docs?:PickerDocument[]; }
interface PickerInstance { setVisible(visible:boolean):void; }
interface PickerView {
  setIncludeFolders(value:boolean):PickerView;
  setParent(id:string):PickerView;
  setMode(mode:string):PickerView;
  setSelectFolderEnabled(value:boolean):PickerView;
  setMimeTypes(types:string):PickerView;
  setFileIds(ids:string):PickerView;
}
interface PickerBuilder {
  addView(view:PickerView):PickerBuilder;
  setOAuthToken(token:string):PickerBuilder;
  setDeveloperKey(key:string):PickerBuilder;
  setAppId(id:string):PickerBuilder;
  setOrigin(origin:string):PickerBuilder;
  setSelectableMimeTypes(types:string):PickerBuilder;
  setCallback(callback:(result:PickerResponse)=>void):PickerBuilder;
  build():PickerInstance;
}
interface TokenResponse {access_token?:string;error?:string;}
interface GoogleBrowser {
  accounts:{oauth2:{initTokenClient(options:{
    client_id:string; scope:string; login_hint:string; include_granted_scopes:boolean;
    callback:(response:TokenResponse)=>void;error_callback:()=>void;
  }):{requestAccessToken(options:{prompt:string}):void}}};
  picker:{DocsView:new(id:string)=>PickerView;ViewId:{DOCS:string;FOLDERS:string};
    DocsViewMode:{LIST:string};PickerBuilder:new()=>PickerBuilder;
    Action:{PICKED:string;CANCEL:string}};
}
type GoogleWindow=Window & {google?:GoogleBrowser;gapi?:{
  load(name:string, options:{callback:()=>void;onerror:()=>void;timeout:number;ontimeout:()=>void}):void
}};

const FOLDER_MIME='application/vnd.google-apps.folder';

let scripts:Promise<void>|undefined;
function loadScript(src:string):Promise<void>{
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;script.async=true;
    const fail=()=>{window.clearTimeout(timeout);script.remove();reject(new Error('Google indisponível'));};
    const timeout=window.setTimeout(fail,15000);
    script.onload=()=>{window.clearTimeout(timeout);resolve();};
    script.onerror=fail;
    document.head.appendChild(script);
  });
}
function loadGoogle():Promise<void>{
  if(!scripts){
    const w=window as GoogleWindow;
    scripts=Promise.all([
      w.google?.accounts?.oauth2?Promise.resolve():loadScript('https://accounts.google.com/gsi/client'),
      w.gapi?Promise.resolve():loadScript('https://apis.google.com/js/api.js')
    ]).then(()=>new Promise<void>((resolve,reject)=>{
      if(w.google?.picker?.PickerBuilder){resolve();return;}
      if(!w.gapi){reject(new Error('Google indisponível'));return;}
      w.gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('Picker indisponível')),
        timeout:15000,ontimeout:()=>reject(new Error('Picker indisponível'))});
    })).catch(error=>{scripts=undefined;throw error;});
  }
  return scripts;
}

export interface PickerCallbacks {
  picked:(file:PickerDocument)=>void;
  canceled:()=>void;
  failed:(message:string)=>void;
}

export function isConfiguredRoot(file:PickerDocument|undefined,folderId:string):boolean{
  return !!file && file.id===folderId && file.mimeType===FOLDER_MIME;
}

/** Each invocation owns only its own browser token and Picker instance. */
@Injectable({providedIn:'root'})
export class GoogleDrivePickerBrowser {
  constructor(private readonly zone:NgZone){}
  prepare():Promise<void>{return loadGoogle();}

  /** Call synchronously from a click after prepare() has completed. */
  open(config:PickerConfig,mode:'files'|'root',callbacks:PickerCallbacks):()=>void{
    const google=(window as GoogleWindow).google;
    let active=true;
    let picker:PickerInstance|null=null;
    let timeout:number|undefined;
    const identityRequest=new AbortController();
    const clear=()=>{
      if(timeout!==undefined){window.clearTimeout(timeout);timeout=undefined;}
    };
    const close=()=>{
      active=false;clear();identityRequest.abort();
      const current=picker;picker=null;
      current?.setVisible(false);
    };
    const fail=(message:string)=>{
      if(!active)return;
      close();this.zone.run(()=>callbacks.failed(message));
    };
    if(!google?.accounts?.oauth2||!google.picker?.PickerBuilder){
      fail('Não foi possível carregar o seletor do Google.');return close;
    }
    const onToken=async(response:TokenResponse)=>{
      if(!active)return;
      clear();
      if(response.error||!response.access_token){fail('Autorização Google não concedida.');return;}
      timeout=window.setTimeout(()=>fail('Não foi possível validar a conta Google.'),15000);
      try{
        const result=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{
          headers:{Authorization:'Bearer '+response.access_token},cache:'no-store',credentials:'omit',
          signal:identityRequest.signal
        });
        if(!result.ok)throw new Error('identity');
        const identity=await result.json() as {sub?:string;email_verified?:boolean};
        if(!active)return;
        clear();
        if(identity.sub!==config.googleSubject||identity.email_verified!==true){
          fail(mode==='root'?'Selecione a conta Google institucional.':'Selecione a conta Google vinculada ao seu perfil.');return;
        }
        const view=new google.picker.DocsView(mode==='root'?google.picker.ViewId.FOLDERS:google.picker.ViewId.DOCS)
          .setIncludeFolders(true).setMode(google.picker.DocsViewMode.LIST)
          .setSelectFolderEnabled(mode==='root');
        // Root itself must be selectable, not just its children.
        if(mode==='root')view.setMimeTypes(FOLDER_MIME).setFileIds(config.folderId);
        else view.setParent(config.folderId);
        const builder=new google.picker.PickerBuilder().addView(view)
          .setOAuthToken(response.access_token).setDeveloperKey(config.apiKey)
          .setAppId(config.projectNumber).setOrigin(window.location.origin);
        if(mode==='root')builder.setSelectableMimeTypes(FOLDER_MIME);
        picker=builder.setCallback(result=>this.zone.run(()=>{
          if(!active)return;
          if(result.action===google.picker.Action.PICKED){
            const file=result.docs?.[0];
            if(mode==='root'&&!isConfiguredRoot(file,config.folderId)){
              fail('Selecione exatamente a pasta raiz configurada na plataforma.');return;
            }
            if(!file){fail('Nenhum arquivo foi selecionado.');return;}
            close();callbacks.picked(file);
          }else if(result.action===google.picker.Action.CANCEL){
            close();callbacks.canceled();
          }
        })).build();
        picker.setVisible(true);
      }catch{fail('Não foi possível validar a conta ou abrir o seletor.');}
    };
    try{
      const client=google.accounts.oauth2.initTokenClient({
        client_id:config.clientId,scope:'openid email https://www.googleapis.com/auth/drive.file',
        login_hint:config.googleSubject,include_granted_scopes:false,
        callback:response=>{void onToken(response);},
        error_callback:()=>fail('Autorização cancelada ou indisponível.')
      });
      timeout=window.setTimeout(()=>fail('Autorização Google não concluída. Tente novamente.'),180000);
      client.requestAccessToken({prompt:'select_account'});
    }catch{fail('Não foi possível iniciar a autorização Google.');}
    return close;
  }
}
