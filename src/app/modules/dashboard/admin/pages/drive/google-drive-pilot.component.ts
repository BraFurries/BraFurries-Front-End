import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subject, distinctUntilChanged, map, of, switchMap, takeUntil, catchError } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { UserService } from '../../../../../core/services/user.service';

interface PilotConfig {
  enabled: boolean; linked: boolean;
  clientId: string | null; apiKey: string | null; projectNumber: string | null;
  folderId: string | null; googleSubject: string | null; googleEmail: string | null;
}
interface PickerDocument { name?: string; url?: string; }
interface PickerResponse { action: string; docs?: PickerDocument[]; }
interface PickerInstance { setVisible(visible: boolean): void; }
interface PickerView {
  setIncludeFolders(value: boolean): PickerView;
  setParent(id: string): PickerView;
  setMode(mode: string): PickerView;
  setSelectFolderEnabled(value: boolean): PickerView;
}
interface PickerBuilder {
  addView(view: PickerView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setCallback(callback: (result: PickerResponse) => void): PickerBuilder;
  build(): PickerInstance;
}
interface TokenResponse { access_token?: string; error?: string; }
interface GoogleBrowser {
  accounts: { oauth2: { initTokenClient(options: {
    client_id: string; scope: string; login_hint: string; include_granted_scopes: boolean;
    callback: (response: TokenResponse) => void; error_callback: () => void;
  }): {requestAccessToken(options: {prompt: string}): void} } };
  picker: { DocsView: new (id: string) => PickerView; ViewId: {DOCS: string};
    DocsViewMode: {LIST: string}; PickerBuilder: new () => PickerBuilder;
    Action: {PICKED: string; CANCEL: string} };
}
type GoogleWindow=Window & {google?: GoogleBrowser; gapi?: {
  load(name: string, options: {callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void}): void
}};

let scripts: Promise<void> | undefined;
function loadScript(src: string): Promise<void> {
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;
    script.async=true;
    const timeout=window.setTimeout(()=>fail(),15000);
    const fail=()=>{window.clearTimeout(timeout);script.remove();reject(new Error('Google indisponível'));};
    script.onload=()=>{window.clearTimeout(timeout);resolve();};
    script.onerror=fail;
    document.head.appendChild(script);
  });
}
function loadGoogle(): Promise<void> {
  if(!scripts) {
    const w=window as GoogleWindow;
    scripts=Promise.all([
      w.google?.accounts?.oauth2 ? Promise.resolve() : loadScript('https://accounts.google.com/gsi/client'),
      w.gapi ? Promise.resolve() : loadScript('https://apis.google.com/js/api.js')
    ]).then(()=>new Promise<void>((resolve,reject)=>{
      if(!w.gapi) {reject(new Error('Google indisponível'));return;}
      w.gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('Picker indisponível')),
        timeout:15000,ontimeout:()=>reject(new Error('Picker indisponível'))});
    })).catch(error=>{scripts=undefined;throw error;});
  }
  return scripts;
}

/** Only Google's HTTPS document links; never execute a returned arbitrary URL. */
export function safeGoogleDocumentUrl(raw: string | undefined): string | null {
  try {
    const url=new URL(raw??'');
    return url.protocol==='https:' && !url.username && !url.password && !url.port &&
      ['drive.google.com','docs.google.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

@Component({
  selector:'app-google-drive-pilot',
  standalone:true,
  imports:[CommonModule,RouterModule],
  template:`
    <section class="rounded-2xl border bg-white p-5 space-y-4 max-w-3xl">
      <h2 class="font-amaranth text-xl font-bold">Google Drive · Piloto privado</h2>
      <p class="text-sm text-gray-600">Navegue pelo seletor oficial do Google e abra documentos com a sua conta vinculada. A pasta inicial deve ser compartilhada com você no próprio Drive.</p>
      <p *ngIf="loading" role="status" class="text-sm">Verificando disponibilidade...</p>
      <p *ngIf="error" role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-800">{{ error }}</p>
      <p *ngIf="config && !config.enabled" class="rounded-lg bg-gray-50 p-3 text-sm">O piloto ainda não foi configurado no servidor.</p>
      <div *ngIf="config?.enabled && !config?.linked" class="rounded-lg bg-amber-50 p-3 text-sm">
        Vincule sua conta Google no <a routerLink="/painel/perfil" class="font-bold underline">perfil</a> antes de continuar.
      </div>
      <ng-container *ngIf="config?.enabled && config?.linked">
        <p class="text-sm font-semibold">Conta vinculada: {{ config?.googleEmail }}</p>
        <p class="text-xs text-gray-600">O seletor começa na pasta de testes, mas o Google pode mostrar outros arquivos da sua própria conta. Nesta fase não alteramos compartilhamentos e não fazemos upload.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="preparePicker()" [disabled]="busy" class="rounded-lg bg-braPurple px-4 py-2 font-bold text-white disabled:opacity-50">
            {{ busy ? 'Carregando...' : 'Abrir seletor do Google Drive' }}
          </button>
          <a [href]="folderUrl" target="_blank" rel="noopener noreferrer" class="rounded-lg border px-4 py-2 font-semibold">Abrir pasta no Google Drive</a>
        </div>
        <p *ngIf="readyToAuthorize" class="text-sm text-gray-600">O seletor está pronto. Autorize a conta vinculada para continuar.</p>
        <button *ngIf="readyToAuthorize" type="button" (click)="authorize()" [disabled]="busy" class="rounded-lg border px-4 py-2 font-bold">Autorizar Google</button>
        <div *ngIf="selected" class="rounded-lg bg-gray-50 p-3">
          <p class="text-sm font-semibold">{{ selected.name }}</p>
          <a [href]="selected.url" target="_blank" rel="noopener noreferrer" class="text-sm font-bold text-braPurple underline">Abrir documento no Google</a>
        </div>
      </ng-container>
    </section>
  `
})
export class GoogleDrivePilotComponent implements OnInit,OnDestroy {
  config: PilotConfig|null=null;
  loading=true;
  busy=false;
  readyToAuthorize=false;
  error='';
  selected: {name:string;url:string}|null=null;
  private readonly destroy$=new Subject<void>();
  private generation=0;
  private picker: PickerInstance|null=null;

  constructor(private readonly http:HttpClient,private readonly user:UserService,
      private readonly zone:NgZone) {}
  get folderUrl(): string {
    return 'https://drive.google.com/drive/folders/'+encodeURIComponent(this.config?.folderId??'');
  }
  ngOnInit(): void {
    this.user.user$.pipe(map(u=>u?.id??null),distinctUntilChanged(),
      switchMap(id=>{
        this.reset();
        if(id==null) {this.loading=false;return of(null);}
        this.loading=true;
        return this.http.get<PilotConfig>(environment.apiBaseUrl+'/user/me/platform-drive/pilot')
          .pipe(catchError((error:HttpErrorResponse)=>{
            this.error=error.status===403?'Piloto restrito ao responsável pela plataforma.':'Não foi possível consultar a integração.';
            return of(null);
          }));
      }),takeUntil(this.destroy$)).subscribe(config=>{this.config=config;this.loading=false;});
  }
  private reset():void {
    this.generation++;
    this.picker?.setVisible(false);
    this.picker=null;
    this.config=null;
    this.selected=null;
    this.error='';
    this.busy=false;
    this.readyToAuthorize=false;
  }
  async preparePicker():Promise<void> {
    if(!this.config?.enabled||!this.config.linked||this.busy) return;
    const attempt=this.generation;
    this.error='';
    this.busy=true;
    try {
      await loadGoogle();
      if(attempt===this.generation) this.readyToAuthorize=true;
    } catch {
      if(attempt===this.generation) this.error='Não foi possível carregar o seletor. Tente novamente ou abra a pasta no Google Drive.';
    } finally {if(attempt===this.generation) this.busy=false;}
  }
  authorize():void {
    const config=this.config;
    if(!this.readyToAuthorize||this.busy||!config?.linked||!config.clientId||!config.googleSubject) return;
    const google=(window as GoogleWindow).google;
    if(!google) {this.error='Google indisponível.';return;}
    const attempt=++this.generation;
    this.picker?.setVisible(false);
    this.picker=null;
    this.selected=null;
    this.busy=true;
    this.error='';
    try {
      const client=google.accounts.oauth2.initTokenClient({
        client_id:config.clientId,scope:'openid email https://www.googleapis.com/auth/drive.file',
        login_hint:config.googleSubject,include_granted_scopes:false,
        callback:response=>{void this.zone.run(()=>this.onToken(response,config,attempt));},
        error_callback:()=>this.zone.run(()=>this.fail(attempt,'Autorização cancelada ou indisponível.'))
      });
      // Must be called directly from a user gesture to allow the OAuth popup.
      client.requestAccessToken({prompt:'select_account'});
    } catch {this.fail(attempt,'Não foi possível iniciar a autorização Google.');}
  }
  private fail(attempt:number,message:string):void {
    if(attempt!==this.generation) return;
    this.busy=false;
    this.error=message;
  }
  private async onToken(response:TokenResponse,config:PilotConfig,attempt:number):Promise<void> {
    if(attempt!==this.generation) return;
    if(response.error||!response.access_token) {this.fail(attempt,'Autorização Google não concedida.');return;}
    try {
      // Browser-only request: no institutional token, no localStorage and no
      // access token sent to the BraFurries API. The subject must match the
      // verified identity returned by the owner-gated configuration endpoint.
      const identityResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{
        headers:{Authorization:'Bearer '+response.access_token},cache:'no-store',credentials:'omit'
      });
      if(!identityResponse.ok) throw new Error('identity');
      const identity=await identityResponse.json() as {sub?:string;email_verified?:boolean};
      if(attempt!==this.generation) return;
      if(identity.sub!==config.googleSubject||identity.email_verified!==true) {
        this.fail(attempt,'Selecione a mesma conta Google vinculada ao seu perfil.');return;
      }
      const google=(window as GoogleWindow).google;
      if(!google||!config.apiKey||!config.projectNumber||!config.folderId) throw new Error('config');
      const view=new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true).setParent(config.folderId).setMode(google.picker.DocsViewMode.LIST)
        .setSelectFolderEnabled(false);
      this.picker=new google.picker.PickerBuilder().addView(view)
        .setOAuthToken(response.access_token).setDeveloperKey(config.apiKey)
        .setAppId(config.projectNumber).setOrigin(window.location.origin)
        .setCallback(result=>this.zone.run(()=>{
          if(attempt!==this.generation) return;
          if(result.action===google.picker.Action.PICKED) {
            const file=result.docs?.[0];
            const url=safeGoogleDocumentUrl(file?.url);
            this.selected=url?{name:file?.name||'Documento',url}:null;
            if(!url) this.error='Não foi possível abrir este tipo de documento pelo painel. Abra a pasta no Google Drive.';
            this.picker?.setVisible(false);this.picker=null;
          } else if(result.action===google.picker.Action.CANCEL) {this.picker=null;}
        })).build();
      this.picker.setVisible(true);
      this.busy=false;
      this.readyToAuthorize=false;
    } catch {this.fail(attempt,'Não foi possível validar a conta ou abrir o seletor.');}
  }
  ngOnDestroy():void {this.reset();this.destroy$.next();this.destroy$.complete();}
}
