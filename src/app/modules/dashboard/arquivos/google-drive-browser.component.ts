import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { distinctUntilChanged, map, Subject, takeUntil } from 'rxjs';
import { DriveEntry, DriveMount, GoogleDriveBrowserService } from '../../../core/services/google-drive-browser.service';
import { GoogleDriveUploadComponent } from './google-drive-upload.component';
import { UserService } from '../../../core/services/user.service';

@Component({
  standalone:true,
  selector:'app-google-drive-browser',
  imports:[CommonModule,GoogleDriveUploadComponent],
  template:`
    <main class="max-w-6xl mx-auto space-y-4 p-4 sm:p-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="font-amaranth text-2xl font-bold">Arquivos</h1><p class="text-sm text-gray-600">Explore as pastas da BraFurries disponíveis para sua conta.</p></div>
        <button type="button" class="rounded-lg border px-3 py-2 text-sm" [disabled]="busy || uploadActive" (click)="home()">Atualizar pastas</button>
      </header>
      <nav aria-label="Caminho da pasta" class="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" (click)="home()" [disabled]="uploadActive" class="font-bold text-braPurple">Minhas pastas</button>
        <ng-container *ngFor="let item of trail; let i=index">
          <span aria-hidden="true">/</span>
          <button type="button" (click)="openTrail(i)" [disabled]="busy || uploadActive" class="text-braPurple break-all">{{item.name}}</button>
        </ng-container>
      </nav>
      <p *ngIf="busy" role="status" class="rounded-xl border p-4 text-sm">Consultando arquivos...</p>
      <p *ngIf="error" role="alert" class="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{{error}}</p>
      <ng-container *ngIf="!busy && !error">
        <div *ngIf="!trail.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button *ngFor="let mount of mounts" type="button" (click)="openMount(mount)" class="rounded-xl border p-4 text-left hover:border-braPurple flex gap-3 items-center">
            <span aria-hidden="true" class="text-2xl">📁</span><span class="font-semibold break-all">{{mount.name}}</span>
          </button>
          <p *ngIf="!mounts.length" class="text-sm text-gray-600">Nenhuma pasta disponível para sua conta.</p>
        </div>
        <ng-container *ngIf="trail.length">
          <app-google-drive-upload *ngIf="canUpload" [anchor]="trail[0].id" [destination]="trail[trail.length-1].id"
            (activeChange)="onUploadActive($event)" (published)="refreshAfterUpload()"></app-google-drive-upload>
          <p *ngIf="uploadNotice" role="status" class="text-sm text-green-700">{{uploadNotice}}</p>
          <p *ngIf="contentError" role="alert" class="rounded-xl bg-amber-50 p-3 text-sm">{{contentError}}</p>
          <p *ngIf="contentBusy" role="status" class="text-sm">Obtendo conteúdo...</p>
          <section *ngIf="previewName" class="rounded-xl border p-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-bold break-all">{{previewName}}</h2>
              <button type="button" (click)="closePreview()" class="rounded border px-3 py-2 text-sm">Fechar</button>
            </div>
            <p *ngIf="previewNote" class="text-xs text-gray-600">{{previewNote}}</p>
            <img *ngIf="previewUrl" [src]="previewUrl" [alt]="previewName" class="max-w-full max-h-[70vh] object-contain mx-auto">
            <pre *ngIf="previewText!==null" class="whitespace-pre-wrap break-words text-sm max-h-[65vh] overflow-auto">{{previewText}}</pre>
          </section>
          <p *ngIf="!entries.length" class="text-sm text-gray-600">Nenhum item acessível nesta página.</p>
          <ul *ngIf="entries.length" class="rounded-xl border divide-y">
            <li *ngFor="let item of entries" class="p-3">
              <button *ngIf="item.folder; else file" type="button" [disabled]="uploadActive" (click)="openChild(item)" class="flex items-center gap-3 w-full text-left">
                <span aria-hidden="true" class="text-2xl">📁</span><span class="font-semibold break-all">{{item.name}}</span>
              </button>
              <ng-template #file>
                <div class="flex items-start gap-3">
                  <span aria-hidden="true" class="text-2xl">📄</span>
                  <div class="min-w-0"><p class="font-semibold break-all">{{item.name}}</p><p class="text-xs text-gray-600 break-all">{{item.mimeType}}<ng-container *ngIf="item.modifiedTime"> · {{item.modifiedTime | date:'dd/MM/yyyy HH:mm'}}</ng-container></p></div>
                </div>
                <div class="flex gap-2 flex-wrap mt-2">
                  <button *ngIf="supportsPreview(item)" type="button" [disabled]="contentBusy || uploadActive" (click)="read(item,true)" class="rounded border px-3 py-1 text-sm">Visualizar</button>
                  <button *ngIf="canDownload && supportsDownload(item)" type="button" [disabled]="contentBusy" (click)="read(item,false)" class="rounded border px-3 py-1 text-sm">Baixar</button>
                </div>
              </ng-template>
            </li>
          </ul>
          <div class="flex gap-2 flex-wrap">
            <button *ngIf="pageIndex>0" type="button" [disabled]="uploadActive" (click)="previous()" class="rounded-lg border px-3 py-2 text-sm">Página anterior</button>
            <button *ngIf="nextToken" type="button" [disabled]="uploadActive" (click)="next()" class="rounded-lg border px-3 py-2 text-sm">Próxima página</button>
          </div>
        </ng-container>
      </ng-container>
      <p class="text-xs text-gray-500">Prévias de imagens e texto; documentos e planilhas Google têm prévia textual. Downloads de até 10 MiB. A edição externa será disponibilizada separadamente.</p>
    </main>
  `
})
export class GoogleDriveBrowserComponent implements OnInit,OnDestroy {
  private readonly destroyed$=new Subject<void>();
  private readonly cancel$=new Subject<void>();
  private activeUser:number|null=null;
  mounts:DriveMount[]=[];
  trail:DriveMount[]=[];
  entries:DriveEntry[]=[];
  busy=false;
  canDownload=false;
  canUpload=false;
  uploadActive=false;
  uploadNotice='';
  @ViewChild(GoogleDriveUploadComponent) private uploadPanel?:GoogleDriveUploadComponent;
  contentBusy=false;
  contentError='';
  previewName='';
  previewUrl:string|null=null;
  previewText:string|null=null;
  previewNote='';
  private contentGeneration=0;
  private readonly contentCancel$=new Subject<void>();
  error='';
  nextToken:string|null=null;
  private tokens:(string|undefined)[]=[undefined];
  pageIndex=0;
  constructor(private readonly drive:GoogleDriveBrowserService,private readonly users:UserService){}
  ngOnInit():void {
    this.users.user$.pipe(map(user=>user?.id??null),distinctUntilChanged(),takeUntil(this.destroyed$)).subscribe(id=>{
      if(this.uploadPanel){this.uploadPanel.enabled=false;this.uploadPanel.reset();}
      this.uploadActive=false;this.uploadNotice='';
      this.activeUser=id;
      this.home();
    });
  }
  home():void {
    if(this.uploadActive)return;
    this.uploadNotice='';this.cancel$.next();
    this.trail=[];this.mounts=[];this.clearPage();this.error='';this.busy=false;
    if(this.activeUser===null)return;
    this.busy=true;
    this.drive.mounts().pipe(takeUntil(this.cancel$)).subscribe({
      next:mounts=>{this.mounts=mounts;this.busy=false;},
      error:()=>{this.busy=false;this.error='Não foi possível consultar suas pastas. Verifique seu acesso ou tente novamente.';}
    });
  }
  openMount(mount:DriveMount):void {
    if(this.busy||this.uploadActive||!this.mounts.some(m=>m.id===mount.id))return;
    this.trail=[mount];this.clearPage();this.load();
  }
  openChild(entry:DriveEntry):void {
    if(this.busy||this.uploadActive||!entry.folder||!this.entries.some(e=>e.id===entry.id&&e.folder))return;
    this.trail=[...this.trail,{id:entry.id,name:entry.name}];this.clearPage();this.load();
  }
  openTrail(index:number):void {
    if(this.busy||this.uploadActive||index<0||index>=this.trail.length)return;
    this.trail=this.trail.slice(0,index+1);this.clearPage();this.load();
  }
  next():void {
    if(this.busy||this.uploadActive||!this.nextToken)return;
    this.tokens=this.tokens.slice(0,this.pageIndex+1);
    this.tokens.push(this.nextToken);this.pageIndex++;this.load();
  }
  previous():void {
    if(this.busy||this.uploadActive||this.pageIndex===0)return;
    this.pageIndex--;this.load();
  }
  private clearPage():void {this.closePreview();this.canDownload=false;this.canUpload=false;this.contentError='';this.entries=[];this.nextToken=null;this.tokens=[undefined];this.pageIndex=0;}
  private load():void {
    if(this.activeUser===null||!this.trail.length)return;
    this.cancel$.next();this.closePreview();this.canDownload=false;this.canUpload=false;this.contentError='';this.entries=[];this.nextToken=null;this.error='';this.busy=true;
    this.drive.list(this.trail[0].id,this.trail[this.trail.length-1].id,this.tokens[this.pageIndex])
      .pipe(takeUntil(this.cancel$)).subscribe({
        next:page=>{this.entries=page.entries;this.canDownload=page.canDownload===true;this.canUpload=page.canUpload===true;this.nextToken=page.nextPageToken;this.busy=false;},
        error:()=>{this.busy=false;this.mounts=[];this.trail=[];this.clearPage();this.error='Pasta indisponível ou sem acesso. Atualize suas pastas para continuar.';}
      });
  }
  onUploadActive(active:boolean):void {
    this.uploadActive=active;
    if(active){this.closePreview();this.contentError='';this.uploadNotice='';}
  }
  refreshAfterUpload():void {
    this.uploadActive=false;this.clearPage();this.uploadNotice='Arquivo publicado com sucesso.';this.load();
  }
  supportsPreview(entry:DriveEntry):boolean {
    return !entry.folder && ['image/png','image/jpeg','image/gif','image/webp','text/plain','text/csv',
      'application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet'].includes(entry.mimeType);
  }
  supportsDownload(entry:DriveEntry):boolean {
    return !entry.folder && (!entry.mimeType.startsWith('application/vnd.google-apps.') ||
      ['application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet','application/vnd.google-apps.presentation'].includes(entry.mimeType));
  }
  closePreview():void {
    this.contentGeneration++;this.contentCancel$.next();this.contentBusy=false;
    if(this.previewUrl)URL.revokeObjectURL(this.previewUrl);
    this.previewUrl=null;this.previewName='';this.previewText=null;this.previewNote='';
  }
  read(item:DriveEntry,preview:boolean):void {
    if(this.busy||this.uploadActive||this.contentBusy||this.activeUser===null||!this.trail.length||
        !this.entries.some(e=>e.id===item.id&&!e.folder)||
        (preview?!this.supportsPreview(item):!this.canDownload||!this.supportsDownload(item)))return;
    this.closePreview();this.contentError='';this.contentBusy=true;
    const generation=this.contentGeneration;
    this.drive.content(this.trail[0].id,this.trail[this.trail.length-1].id,item.id,preview)
      .pipe(takeUntil(this.contentCancel$)).subscribe({
        next:async blob=>{
          try {
            if(generation!==this.contentGeneration)return;
            if(!preview){
              const suffix=({'application/vnd.google-apps.document':'.docx',
                'application/vnd.google-apps.spreadsheet':'.xlsx','application/vnd.google-apps.presentation':'.pptx'} as Record<string,string>)[item.mimeType]||'';
              let name=Array.from(item.name.replace(/[\\/\u0000-\u001f\u007f]/g,'_').trim()).slice(0,180).join('')||'arquivo';
              if(suffix&&!name.toLowerCase().endsWith(suffix))name+=suffix;
              const url=URL.createObjectURL(new Blob([blob],{type:'application/octet-stream'}));
              const link=document.createElement('a');link.href=url;link.download=name;
              document.body.appendChild(link);
              try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
            }else if(['image/png','image/jpeg','image/gif','image/webp'].includes(blob.type)){
              if(blob.type!==item.mimeType)throw new Error('Formato alterado');
              this.previewUrl=URL.createObjectURL(blob);this.previewName=item.name;
            }else if(blob.type==='text/plain'){
              const value=await blob.text();
              if(generation!==this.contentGeneration)return;
              this.previewText=value;this.previewName=item.name;
              if(item.mimeType==='application/vnd.google-apps.spreadsheet')this.previewNote='Prévia CSV da primeira aba, sem formatação.';
              if(item.mimeType==='application/vnd.google-apps.document')this.previewNote='Prévia textual, sem formatação.';
            }else throw new Error('Formato não permitido');
          }catch{if(generation===this.contentGeneration)this.contentError='Não foi possível abrir o conteúdo.';}
          finally{if(generation===this.contentGeneration)this.contentBusy=false;}
        },
        error:e=>{
          if(generation!==this.contentGeneration)return;
          this.contentBusy=false;
          if(e.status===401||e.status===403||e.status===404){
            this.closePreview();this.mounts=[];this.trail=[];this.clearPage();
            this.error='Arquivo indisponível ou sem acesso. Atualize suas pastas para continuar.';
          }else this.contentError=e.status===413?'O arquivo excede o limite desta versão.':
            e.status===415?'Formato de arquivo não suportado.':'Não foi possível obter o conteúdo. Tente novamente.';
        }
      });
  }
  ngOnDestroy():void {
    this.uploadPanel?.reset(false);this.closePreview();this.contentCancel$.complete();this.cancel$.next();this.cancel$.complete();this.destroyed$.next();this.destroyed$.complete();
  }
}
