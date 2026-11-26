import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { GoogleDrivePickerBrowser, PickerConfig, isConfiguredRoot } from './google-drive-picker-browser';

interface ConnectionStatus {
  configured: boolean; connected: boolean; accountEmail: string|null; reconnectRequired: boolean;
}
interface ManagedFolder {folderId:string;parentFolderId:string;name:string;verifiedAt:string;}
type RootStatus='ACCESSIBLE'|'NOT_AUTHORIZED'|'ACCESS_DENIED'|'NOT_FOLDER'|'TRASHED'|'NOT_OWNED'|'CANNOT_SHARE'|'RECONNECT_REQUIRED'|'UNAVAILABLE';

export function readDriveCallback(fragment:string): {state:string;code:string}|null {
  const params=new URLSearchParams(fragment.replace(/^#/,''));
  const state=params.get('drive_state'), code=params.get('drive_code');
  return state && /^[A-Za-z0-9_-]{43}$/.test(state) && code && /^[!-~]{1,2048}$/.test(code)
    ? {state,code} : null;
}

export function safeDriveAuthorizationUrl(raw:string):string|null {
  try {
    const url=new URL(raw);
    return url.origin==='https://accounts.google.com' && !url.username && !url.password &&
      url.pathname==='/o/oauth2/v2/auth' ? url.href : null;
  } catch { return null; }
}

@Component({
  selector:'app-google-drive-connection',
  standalone:true,
  imports:[CommonModule],
  template:`
    <section class="rounded-2xl border bg-white p-5 space-y-4 max-w-3xl">
      <div>
        <h2 class="font-amaranth text-xl font-bold">Conexão institucional</h2>
        <p class="text-sm text-gray-600">Autorize a conta institucional para que a API possa acessar os arquivos selecionados, sem usar a senha do Google.</p>
      </div>
      <p *ngIf="busy" role="status" class="text-sm">Processando conexão...</p>
      <p *ngIf="error" role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-800">{{ error }}</p>
      <p *ngIf="status && !status.configured" class="rounded-lg bg-gray-50 p-3 text-sm">A conexão institucional ainda não está configurada no servidor.</p>
      <ng-container *ngIf="status?.configured">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <p class="font-semibold text-sm">{{ status?.accountEmail }}</p>
          <span class="rounded-full px-3 py-1 text-xs font-bold bg-gray-100" [class.text-green-700]="status?.connected">
            {{ status?.connected ? 'Autorização armazenada' : (status?.reconnectRequired ? 'Reconexão necessária' : 'Desconectado') }}
          </span>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button type="button" (click)="connect()" [disabled]="busy || rootPickerOpen" class="rounded-lg bg-braPurple px-4 py-2 text-white font-bold disabled:opacity-50">
            {{ status?.connected ? 'Reconectar conta' : 'Conectar conta institucional' }}
          </button>
          <button *ngIf="status?.connected" type="button" (click)="authorizeRoot()" [disabled]="busy || rootPreparing || rootPickerOpen" class="rounded-lg bg-braPurple px-4 py-2 font-bold text-white disabled:opacity-50">
            {{ rootPreparing ? 'Preparando seletor...' : 'Autorizar pasta raiz' }}
          </button>
          <button *ngIf="status?.connected" type="button" (click)="checkRoot()" [disabled]="busy || rootPickerOpen" class="rounded-lg border px-4 py-2 font-semibold">Verificar acesso à pasta raiz</button>
          <button *ngIf="status?.connected || status?.reconnectRequired" type="button" (click)="confirmDisconnect=true" [disabled]="busy || rootPickerOpen" class="rounded-lg border px-4 py-2 font-semibold text-red-700">Desconectar</button>
        </div>
        <div *ngIf="confirmDisconnect" class="rounded-lg border p-3 space-y-2">
          <p class="text-sm">Remover a autorização armazenada na BraFurries? Para revogar a concessão no Google, acesse as conexões da conta institucional.</p>
          <button type="button" (click)="disconnect()" [disabled]="busy" class="rounded-lg border px-3 py-1 font-bold text-red-700">Confirmar</button>
          <button type="button" (click)="confirmDisconnect=false" class="rounded-lg px-3 py-1">Cancelar</button>
        </div>
        <p *ngIf="rootStatus==='ACCESSIBLE'" role="status" class="rounded-lg bg-green-50 p-3 text-sm text-green-800">Pasta raiz acessível e compartilhável pela conta institucional.</p>
        <p *ngIf="status?.connected" class="text-xs text-gray-600">Selecione a pasta configurada usando a conta institucional. A API verificará o acesso com a autorização armazenada, não com o token do navegador.</p>
        <a *ngIf="rootConfig" [href]="'https://drive.google.com/drive/folders/'+rootConfig.folderId" target="_blank" rel="noopener noreferrer" class="text-sm font-semibold text-braPurple underline">Conferir pasta configurada no Google Drive</a>
        <p *ngIf="rootError" role="alert" class="rounded-lg bg-amber-50 p-3 text-sm">{{ rootError }}</p>
        <p *ngIf="rootStatus==='NOT_AUTHORIZED'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">A pasta não está autorizada para este aplicativo ou não foi encontrada. Use Autorizar pasta raiz e confirme a pasta configurada.</p>
        <p *ngIf="rootStatus==='ACCESS_DENIED'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">O Google negou a consulta à pasta. Autorize a pasta raiz e verifique novamente.</p>
        <p *ngIf="rootStatus==='NOT_FOLDER'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">O ID configurado não corresponde a uma pasta.</p>
        <p *ngIf="rootStatus==='TRASHED'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">A pasta configurada está na lixeira do Google Drive.</p>
        <p *ngIf="rootStatus==='NOT_OWNED'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">A pasta não pertence à conta institucional.</p>
        <p *ngIf="rootStatus==='CANNOT_SHARE'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">O Google não permite que a conta institucional gerencie o compartilhamento desta pasta.</p>
        <p *ngIf="rootStatus==='RECONNECT_REQUIRED'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">A autorização não está mais utilizável. Reconecte a conta.</p>
        <p *ngIf="rootStatus==='UNAVAILABLE'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">Não foi possível consultar o Google. Tente novamente.</p>
      </ng-container>
      <section *ngIf="status?.connected" class="border-t pt-4 space-y-3">
        <h3 class="font-amaranth text-lg font-bold">Pastas gerenciadas</h3>
        <p class="text-sm text-gray-600">Selecione subpastas da raiz institucional. A API verifica a propriedade e o caminho no Google antes de cadastrar. Nenhum compartilhamento será alterado.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="authorizeFolder()" [disabled]="busy || rootPreparing || rootPickerOpen" class="rounded-lg bg-braPurple px-4 py-2 text-white font-bold disabled:opacity-50">Cadastrar ou revalidar pasta</button>
          <button type="button" (click)="loadFolders()" [disabled]="busy || rootPickerOpen" class="rounded-lg border px-4 py-2 font-semibold">Consultar pastas cadastradas</button>
        </div>
        <p *ngIf="folderError" role="alert" class="rounded-lg bg-amber-50 p-3 text-sm">{{ folderError }}</p>
        <p *ngIf="folderNotice" role="status" class="rounded-lg bg-green-50 p-3 text-sm">{{ folderNotice }}</p>
        <p *ngIf="foldersLoaded && !folders.length" class="text-sm text-gray-600">Nenhuma pasta cadastrada.</p>
        <ul *ngIf="folders.length" class="divide-y rounded-lg border">
          <li *ngFor="let folder of folders" class="p-3 break-words">
            <a [href]="'https://drive.google.com/drive/folders/'+folder.folderId" target="_blank" rel="noopener noreferrer" class="font-semibold text-braPurple underline">{{ folder.name }}</a>
            <p class="text-xs text-gray-600">Verificada em {{ folder.verifiedAt | date:'dd/MM/yyyy HH:mm':'UTC' }} UTC · não representa acesso atual</p>
          </li>
        </ul>
      </section>
      <p class="text-xs text-gray-500">Nesta etapa não há concessão automática de permissões. O Picker individual continua separado.</p>
    </section>
  `
})
export class GoogleDriveConnectionComponent implements OnInit,OnDestroy {
  private readonly endpoint=environment.apiBaseUrl+'/user/me/platform-drive';
  private readonly destroyed$=new Subject<void>();
  status:ConnectionStatus|null=null;
  rootStatus:RootStatus|null=null;
  busy=false;
  confirmDisconnect=false;
  error='';
  rootConfig:PickerConfig|null=null;
  rootPreparing=false;
  rootPickerOpen=false;
  rootError='';
  folders:ManagedFolder[]=[];
  foldersLoaded=false;
  folderError='';
  folderNotice='';
  private rootGeneration=0;
  private closeRootPicker:(()=>void)|null=null;
  constructor(private readonly http:HttpClient,private readonly browser:GoogleDrivePickerBrowser) {}

  ngOnInit():void {
    const fragment=window.location.hash;
    const isCallback=/^#drive_(state|code|error)=/.test(fragment) || fragment.includes('&drive_state=');
    const callback=isCallback?readDriveCallback(fragment):null;
    // Remove the short-lived code before issuing any application request.
    if(isCallback) window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
    if(callback) {
      this.busy=true;
      this.http.post<ConnectionStatus>(this.endpoint+'/oauth/complete',callback)
        .pipe(takeUntil(this.destroyed$)).subscribe({
          next:status=>{this.status=status;this.busy=false;if(status.connected)this.prepareRoot();else this.resetRoot();},
          error:(error:HttpErrorResponse)=>{this.error=error.status===403?'Somente o proprietário pode concluir a conexão.':'Autorização não concluída. Inicie novamente com a conta institucional.';this.loadStatus();}
        });
    } else {
      if(isCallback) this.error='Autorização cancelada ou inválida.';
      this.loadStatus();
    }
  }
  private loadStatus():void {
    this.busy=true;
    this.http.get<ConnectionStatus>(this.endpoint+'/connection').pipe(takeUntil(this.destroyed$)).subscribe({
      next:status=>{this.status=status;this.busy=false;if(status.connected)this.prepareRoot();else this.resetRoot();},
      error:()=>{this.busy=false;this.error='Não foi possível consultar a conexão institucional.';}
    });
  }
  connect():void {
    if(this.busy||!this.status?.configured) return;
    this.busy=true;this.error='';this.rootStatus=null;
    this.http.post<{authorizationUrl:string}>(this.endpoint+'/oauth/start',{})
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:result=>{
          const url=safeDriveAuthorizationUrl(result.authorizationUrl);
          if(url) window.location.assign(url);
          else {this.busy=false;this.error='Endereço de autorização inválido.';}
        },
        error:()=>{this.busy=false;this.error='Não foi possível iniciar a autorização.';}
      });
  }
  private resetRoot():void {
    this.rootGeneration++;
    this.closeRootPicker?.();this.closeRootPicker=null;
    this.rootConfig=null;this.rootPreparing=false;this.rootPickerOpen=false;this.rootError='';
    this.folders=[];this.foldersLoaded=false;this.folderError='';this.folderNotice='';
  }
  prepareRoot():void {
    if(!this.status?.connected||this.rootPreparing||this.rootConfig)return;
    const attempt=++this.rootGeneration;
    this.rootPreparing=true;this.rootError='';
    this.http.get<PickerConfig>(this.endpoint+'/connection/root-picker')
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:async config=>{
          try{
            await this.browser.prepare();
            if(attempt===this.rootGeneration)this.rootConfig=config;
          }catch{if(attempt===this.rootGeneration)this.rootError='Não foi possível carregar o seletor. Clique em Autorizar pasta raiz para tentar novamente.';}
          finally{if(attempt===this.rootGeneration)this.rootPreparing=false;}
        },
        error:()=>{if(attempt===this.rootGeneration){this.rootPreparing=false;this.rootError='Não foi possível consultar a configuração do seletor institucional. Tente novamente.';}}
      });
  }
  authorizeRoot():void {
    if(this.busy||this.rootPickerOpen||this.rootPreparing||!this.status?.connected)return;
    const config=this.rootConfig;
    if(!config){this.prepareRoot();return;}
    const attempt=++this.rootGeneration;
    this.rootStatus=null;this.rootError='';this.rootPickerOpen=true;
    this.closeRootPicker=this.browser.open(config,'root',{
      picked:file=>{
        if(attempt!==this.rootGeneration)return;
        this.rootPickerOpen=false;
        if(!isConfiguredRoot(file,config.folderId)){
          this.rootError='Selecione a pasta raiz configurada.';return;
        }
        this.checkRoot();
      },
      canceled:()=>{if(attempt===this.rootGeneration)this.rootPickerOpen=false;},
      failed:message=>{if(attempt===this.rootGeneration){this.rootPickerOpen=false;this.rootError=message;}}
    });
  }
  loadFolders():void {
    if(this.busy||this.rootPickerOpen||!this.status?.connected)return;
    this.busy=true;this.folderError='';this.folderNotice='';
    this.http.get<ManagedFolder[]>(this.endpoint+'/folders').pipe(takeUntil(this.destroyed$)).subscribe({
      next:folders=>{this.folders=folders;this.foldersLoaded=true;this.busy=false;},
      error:()=>{this.busy=false;this.folders=[];this.foldersLoaded=false;this.folderError='Não foi possível consultar as pastas cadastradas.';}
    });
  }
  authorizeFolder():void {
    if(this.busy||this.rootPickerOpen||this.rootPreparing||!this.status?.connected)return;
    const config=this.rootConfig;
    if(!config){this.prepareRoot();return;}
    const attempt=++this.rootGeneration;
    this.folderError='';this.folderNotice='';this.rootPickerOpen=true;
    this.closeRootPicker=this.browser.open(config,'managed-folder',{
      picked:file=>{
        if(attempt!==this.rootGeneration)return;
        this.rootPickerOpen=false;
        if(!file.id||file.id===config.folderId||file.mimeType!=='application/vnd.google-apps.folder'){
          this.folderError='Selecione uma subpasta institucional.';return;
        }
        this.busy=true;
        this.http.post<ManagedFolder>(this.endpoint+'/folders',{folderId:file.id})
          .pipe(takeUntil(this.destroyed$)).subscribe({
            next:folder=>{
              this.busy=false;
              this.loadFolders();
              this.folderNotice='Pasta cadastrada ou revalidada com sucesso.';
            },
            error:()=>{this.busy=false;this.folderError='Não foi possível verificar a pasta. Autorize também as pastas ancestrais, se necessário, e tente novamente.';}
          });
      },
      canceled:()=>{if(attempt===this.rootGeneration)this.rootPickerOpen=false;},
      failed:message=>{if(attempt===this.rootGeneration){this.rootPickerOpen=false;this.folderError=message;}}
    });
  }
  checkRoot():void {
    if(this.busy||this.rootPickerOpen||!this.status?.connected) return;
    this.busy=true;this.error='';this.rootStatus=null;
    this.http.post<{status:RootStatus}>(this.endpoint+'/connection/check-root',{})
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:result=>{this.rootStatus=result.status;this.busy=false;},
        error:()=>{this.busy=false;this.error='Não foi possível verificar a pasta raiz.';}
      });
  }
  disconnect():void {
    if(this.busy||!this.confirmDisconnect) return;
    this.busy=true;this.error='';this.rootStatus=null;this.resetRoot();
    this.http.delete<void>(this.endpoint+'/connection').pipe(takeUntil(this.destroyed$)).subscribe({
      next:()=>{this.confirmDisconnect=false;this.loadStatus();},
      error:()=>{this.busy=false;this.error='Não foi possível desconectar a conta.';}
    });
  }
  ngOnDestroy():void {this.resetRoot();this.destroyed$.next();this.destroyed$.complete();}
}
