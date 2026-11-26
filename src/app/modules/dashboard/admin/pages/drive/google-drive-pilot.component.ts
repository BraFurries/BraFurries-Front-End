import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subject, distinctUntilChanged, map, of, switchMap, takeUntil, catchError } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { UserService } from '../../../../../core/services/user.service';
import { GoogleDriveConnectionComponent } from './google-drive-connection.component';
import { GoogleDrivePickerBrowser, PickerConfig } from './google-drive-picker-browser';

interface PilotConfig {
  enabled: boolean; linked: boolean;
  clientId: string | null; apiKey: string | null; projectNumber: string | null;
  folderId: string | null; googleSubject: string | null; googleEmail: string | null;
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
  imports:[CommonModule,RouterModule,GoogleDriveConnectionComponent],
  template:`
    <app-google-drive-connection *ngIf="config"></app-google-drive-connection>
    <section class="rounded-2xl border bg-white p-5 space-y-4 max-w-3xl mt-4">
      <h2 class="font-amaranth text-xl font-bold">Meus arquivos · Google Drive</h2>
      <p class="text-sm text-gray-600">Navegue pelo seletor oficial do Google e abra documentos com a sua conta vinculada. A pasta inicial deve ser compartilhada com você no próprio Drive.</p>
      <p *ngIf="loading" role="status" class="text-sm">Verificando disponibilidade...</p>
      <p *ngIf="error" role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-800">{{ error }}</p>
      <p *ngIf="config && !config.enabled" class="rounded-lg bg-gray-50 p-3 text-sm">A integração ainda não foi configurada no servidor.</p>
      <div *ngIf="config?.enabled && !config?.linked" class="rounded-lg bg-amber-50 p-3 text-sm">
        Vincule sua conta Google no <a routerLink="/painel/perfil" class="font-bold underline">perfil</a> antes de continuar.
      </div>
      <ng-container *ngIf="config?.enabled && config?.linked">
        <p class="text-sm font-semibold">Conta vinculada: {{ config?.googleEmail }}</p>
        <p class="text-xs text-gray-600">O seletor começa na pasta institucional. O Google também pode mostrar arquivos acessíveis pela sua própria conta.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="openPicker()" [attr.aria-busy]="busy" [disabled]="busy" class="rounded-lg bg-braPurple px-4 py-2 font-bold text-white disabled:opacity-50">
            {{ busy ? 'Carregando...' : (readyToAuthorize ? 'Abrir seletor do Google Drive' : 'Preparar seletor do Google Drive') }}
          </button>
          <a [href]="folderUrl" target="_blank" rel="noopener noreferrer" class="rounded-lg border px-4 py-2 font-semibold">Abrir pasta no Google Drive</a>
        </div>
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
  private closePicker:(()=>void)|null=null;

  constructor(private readonly http:HttpClient,private readonly user:UserService,
      private readonly browser:GoogleDrivePickerBrowser) {}
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
            this.error=error.status===403?'Acesso restrito ao responsável pela plataforma.':'Não foi possível consultar a integração.';
            return of(null);
          }));
      }),takeUntil(this.destroy$)).subscribe(config=>{this.config=config;this.loading=false;if(config?.enabled&&config.linked)void this.preparePicker();});
  }
  private reset():void {
    this.generation++;
    this.closePicker?.();
    this.closePicker=null;
    this.config=null;
    this.selected=null;
    this.error='';
    this.busy=false;
    this.readyToAuthorize=false;
  }
  async preparePicker():Promise<void> {
    if(!this.config?.enabled||!this.config.linked||this.busy||this.readyToAuthorize) return;
    const attempt=this.generation;
    this.error='';this.busy=true;
    try {
      await this.browser.prepare();
      if(attempt===this.generation)this.readyToAuthorize=true;
    } catch {
      if(attempt===this.generation)this.error='Não foi possível carregar o seletor. Tente novamente ou abra a pasta no Google Drive.';
    } finally {if(attempt===this.generation)this.busy=false;}
  }
  openPicker():void {
    if(this.busy)return;
    if(!this.readyToAuthorize){void this.preparePicker();return;}
    const c=this.config;
    if(!c?.enabled||!c.linked||!c.clientId||!c.apiKey||!c.projectNumber||!c.folderId||!c.googleSubject||!c.googleEmail)return;
    const config:PickerConfig={clientId:c.clientId,apiKey:c.apiKey,projectNumber:c.projectNumber,
      folderId:c.folderId,googleSubject:c.googleSubject,googleEmail:c.googleEmail};
    const attempt=++this.generation;
    this.closePicker?.();this.selected=null;this.error='';this.busy=true;
    this.closePicker=this.browser.open(config,'files',{
      picked:file=>{
        if(attempt!==this.generation)return;
        this.busy=false;
        const url=safeGoogleDocumentUrl(file.url);
        this.selected=url?{name:file.name||'Documento',url}:null;
        if(!url)this.error='Não foi possível abrir este documento pelo painel. Abra a pasta no Google Drive.';
      },
      canceled:()=>{if(attempt===this.generation)this.busy=false;},
      failed:message=>{if(attempt===this.generation){this.busy=false;this.error=message;}}
    });
  }
  ngOnDestroy():void {this.reset();this.destroy$.next();this.destroy$.complete();}
}
