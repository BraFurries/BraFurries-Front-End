import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CdkDrag, CdkDragEnd, CdkDragHandle } from '@angular/cdk/drag-drop';
import { distinctUntilChanged, map, Subject, takeUntil } from 'rxjs';
import { DriveEntry, DriveMount, DriveRevision, DriveTransferAction, DriveTransferRequest, GoogleDriveBrowserService } from '../../../core/services/google-drive-browser.service';
import { ReplacementTarget } from '../../../core/services/google-drive-upload.service';
import { GoogleDriveUploadComponent } from './google-drive-upload.component';
import { UserService } from '../../../core/services/user.service';

@Component({
  standalone:true,
  selector:'app-google-drive-browser',
  imports:[CommonModule,GoogleDriveUploadComponent,CdkDrag,CdkDragHandle],
  template:`
    <main class="max-w-6xl mx-auto space-y-4 p-4 sm:p-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="font-amaranth text-2xl font-bold">Arquivos</h1><p class="text-sm text-gray-600">Explore as pastas da BraFurries disponíveis para sua conta.</p></div>
        <button type="button" class="rounded-lg border px-3 py-2 text-sm" [disabled]="busy || uploadActive || folderBusy || renameBusy" (click)="home()">Atualizar pastas</button>
      </header>
      <nav aria-label="Caminho da pasta" class="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" (click)="home()" [disabled]="uploadActive || folderBusy || renameBusy" class="font-bold text-braPurple">Minhas pastas</button>
        <ng-container *ngFor="let item of trail; let i=index">
          <span aria-hidden="true">/</span>
          <button type="button" (click)="openTrail(i)" [disabled]="busy || uploadActive || renameBusy" class="text-braPurple break-all" [attr.data-transfer-anchor]="trail[0].id" [attr.data-transfer-folder]="item.id">{{item.name}}</button>
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
          <section *ngIf="hasTransfer || transferBusy || transferMessage" class="rounded-xl border p-3 space-y-3" [class.ring-2]="dragging" [class.ring-braPurple]="dragging">
            <div class="flex items-center flex-wrap gap-2">
              <span class="font-semibold text-sm">Arrastar e soltar</span>
              <button type="button" [disabled]="transferBusy || dragging" [attr.aria-pressed]="transferMode==='MOVE'" (click)="setTransferMode('MOVE')" class="rounded border px-3 py-1 text-sm" [class.font-bold]="transferMode==='MOVE'">Mover</button>
              <button type="button" [disabled]="transferBusy || dragging" [attr.aria-pressed]="transferMode==='COPY'" (click)="setTransferMode('COPY')" class="rounded border px-3 py-1 text-sm" [class.font-bold]="transferMode==='COPY'">Copiar</button>
              <button type="button" [disabled]="transferBusy || dragging" (click)="toggleTargets()" class="rounded border px-3 py-1 text-sm">{{targetsOpen ? 'Fechar destinos' : 'Outras pastas'}}</button>
            </div>
            <p class="text-xs text-gray-600">Segure a alça do item e solte sobre uma pasta ou sobre o destino abaixo. Escolha Copiar para manter o original.</p>
            <div class="rounded-lg border-2 border-dashed p-3 text-sm break-all" [class.border-braPurple]="dragging"
                [attr.data-transfer-anchor]="targetTrail[0]?.id || trail[0].id"
                [attr.data-transfer-folder]="targetTrail[targetTrail.length-1]?.id || trail[trail.length-1].id">
              Solte aqui: <strong>{{targetTrail.length ? targetTrail[targetTrail.length-1].name : trail[trail.length-1].name}}</strong>
            </div>
            <div *ngIf="targetsOpen" class="space-y-2 border rounded p-2">
              <div class="flex flex-wrap gap-2 text-sm">
                <button type="button" [disabled]="dragging || transferBusy || targetsBusy" (click)="targetHome()">Minhas pastas</button>
                <button *ngFor="let t of targetTrail;let i=index" type="button" [disabled]="dragging || transferBusy || targetsBusy" (click)="targetBack(i)"
                    [attr.data-transfer-anchor]="targetTrail[0].id" [attr.data-transfer-folder]="t.id" class="text-braPurple break-all">/ {{t.name}}</button>
              </div>
              <p *ngIf="targetsBusy" class="text-xs">Consultando destinos...</p>
              <p *ngIf="targetsError" role="alert" class="text-xs">{{targetsError}}</p>
              <div class="flex flex-wrap gap-2 max-h-48 overflow-auto">
                <button *ngFor="let t of targetFolders" type="button" [disabled]="dragging || transferBusy || targetsBusy" (click)="openTarget(t)"
                    [attr.data-transfer-anchor]="targetTrail[0]?.id || t.id" [attr.data-transfer-folder]="t.id" class="rounded border px-2 py-2 text-sm break-all">📁 {{t.name}}</button>
              </div>
              <button *ngIf="targetNext" type="button" [disabled]="dragging || transferBusy || targetsBusy" (click)="moreTargets()" class="text-xs underline">Mais pastas</button>
            </div>
            <p *ngIf="transferMessage" role="status" class="text-sm">{{transferMessage}}</p>
          </section>
          <section *ngIf="canCreateFolder && !renameEntry && !replacementTarget && !transferBusy && !dragging" class="rounded-xl border p-3 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <input #folderInput type="text" maxlength="255" aria-label="Nome da nova pasta" placeholder="Nome da nova pasta" class="rounded border px-3 py-2 flex-1 min-w-0" [value]="folderName" [disabled]="folderBusy || uploadActive || folderUncertain" (input)="setFolderName(folderInput.value)">
              <button type="button" [disabled]="folderBusy || uploadActive || !folderName.trim()" (click)="createFolder()" class="rounded border px-3 py-2 text-sm">{{folderBusy ? 'Criando...' : folderUncertain ? 'Verificar criação' : 'Nova pasta'}}</button>
              <button *ngIf="folderUncertain" type="button" [disabled]="folderBusy" (click)="resetFolderDraft()" class="rounded border px-3 py-2 text-sm">Descartar tentativa</button>
            </div>
            <p *ngIf="folderMessage" role="status" class="text-sm">{{folderMessage}}</p>
          </section>
          <app-google-drive-upload *ngIf="canUpload && !folderBusy && !renameEntry && !replacementTarget && !transferBusy && !dragging" [anchor]="trail[0].id" [destination]="trail[trail.length-1].id"
            (activeChange)="onUploadActive($event)" (published)="refreshAfterUpload()"></app-google-drive-upload>
          <section *ngIf="replacementTarget" class="space-y-2">
            <app-google-drive-upload [anchor]="trail[0].id" [destination]="trail[trail.length-1].id" [replacement]="replacementTarget"
              (activeChange)="onUploadActive($event)" (published)="refreshAfterUpload()"></app-google-drive-upload>
            <button type="button" [disabled]="uploadActive" (click)="closeReplacement()" class="rounded border px-3 py-2 text-sm">Fechar substituição</button>
          </section>
          <p *ngIf="uploadNotice" role="status" class="text-sm text-green-700">{{uploadNotice}}</p>
          <section *ngIf="historyEntry" class="rounded-xl border p-4 space-y-3">
            <div class="flex justify-between gap-2 items-center">
              <h2 class="font-bold break-all">Histórico · {{historyEntry.name}}</h2>
              <button type="button" class="rounded border px-3 py-2 text-sm" (click)="closeHistory()">Fechar</button>
            </div>
            <p class="text-xs text-gray-600">Versões disponíveis conforme a retenção do Google.</p>
            <p *ngIf="historyBusy" role="status" class="text-sm">Consultando versões...</p>
            <p *ngIf="historyError" role="alert" class="text-sm">{{historyError}}</p>
            <ul *ngIf="revisions.length" class="divide-y">
              <li *ngFor="let revision of revisions" class="py-2 flex flex-wrap justify-between gap-2">
                <div class="text-sm">{{revision.modifiedTime | date:'dd/MM/yyyy HH:mm'}} · {{revision.size}} bytes</div>
                <span class="text-xs">{{revision.current ? 'Versão atual' : revision.kept ? 'Preservada' : 'Retenção do Google'}}</span>
              </li>
            </ul>
            <p *ngIf="!historyBusy && !historyError && !revisions.length" class="text-sm">Nenhuma revisão nesta página.</p>
            <button *ngIf="historyNext" [disabled]="historyBusy" type="button" class="rounded border px-3 py-2 text-sm" (click)="nextHistory()">Próxima página</button>
          </section>
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
            <li *ngFor="let item of entries" class="p-3" cdkDrag [cdkDragDisabled]="!canDrag(item)"
                (cdkDragStarted)="dragging=true" (cdkDragEnded)="finishDrag($event,item)"
                [attr.data-transfer-anchor]="item.folder ? trail[0].id : null" [attr.data-transfer-folder]="item.folder ? item.id : null"
                [class.ring-1]="dragging && item.folder" [class.ring-braPurple]="dragging && item.folder">
              <button *ngIf="item.canMove || item.canCopy" cdkDragHandle type="button" aria-label="Arrastar item" title="Arrastar item" [disabled]="!canDrag(item) && !dragging" class="float-right rounded border px-3 py-2 cursor-grab active:cursor-grabbing touch-none select-none">⠿</button>
              <button *ngIf="item.folder; else file" type="button" [disabled]="uploadActive || renameBusy" (click)="openChild(item)" class="flex items-center gap-3 w-full text-left">
                <span aria-hidden="true" class="text-2xl">📁</span><span class="font-semibold break-all">{{item.name}}</span>
              </button>
              <ng-template #file>
                <div class="flex items-start gap-3">
                  <span aria-hidden="true" class="text-2xl">📄</span>
                  <div class="min-w-0"><p class="font-semibold break-all">{{item.name}}</p><p class="text-xs text-gray-600 break-all">{{item.mimeType}}<ng-container *ngIf="item.modifiedTime"> · {{item.modifiedTime | date:'dd/MM/yyyy HH:mm'}}</ng-container></p></div>
                </div>
                <div class="flex gap-2 flex-wrap mt-2">
                  <button *ngIf="item.canReplace && !replacementTarget && !renameEntry" type="button" [disabled]="contentBusy || uploadActive || folderBusy || renameBusy" (click)="startReplacement(item)" class="rounded border px-3 py-1 text-sm">Substituir arquivo</button>
                  <button *ngIf="item.canViewHistory" type="button" [disabled]="contentBusy || uploadActive || folderBusy || renameBusy" (click)="openHistory(item)" class="rounded border px-3 py-1 text-sm">Versões</button>
                  <button *ngIf="supportsPreview(item)" type="button" [disabled]="contentBusy || uploadActive || folderBusy || renameBusy" (click)="read(item,true)" class="rounded border px-3 py-1 text-sm">Visualizar</button>
                  <button *ngIf="canDownload && supportsDownload(item)" type="button" [disabled]="contentBusy || uploadActive || folderBusy || renameBusy" (click)="read(item,false)" class="rounded border px-3 py-1 text-sm">Baixar</button>
                </div>
              </ng-template>
              <button *ngIf="item.canRename && !renameEntry && !replacementTarget" type="button" [disabled]="uploadActive || folderBusy || contentBusy" (click)="startRename(item)" class="rounded border px-3 py-1 text-sm mt-2">Renomear</button>
              <section *ngIf="renameEntry?.id===item.id" class="rounded border p-3 mt-2 space-y-2">
                <label class="block text-sm font-medium">Novo nome
                  <input #renameInput type="text" maxlength="255" class="block w-full rounded border px-3 py-2" [value]="renameName" [disabled]="renameBusy || renameUncertain" (input)="setRenameName(renameInput.value)">
                </label>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="rounded border px-3 py-2 text-sm" [disabled]="renameBusy || !renameName.trim() || renameName.trim()===item.name" (click)="saveRename()">{{renameBusy ? 'Salvando...' : renameUncertain ? 'Verificar operação' : 'Salvar nome'}}</button>
                  <button type="button" class="rounded border px-3 py-2 text-sm" [disabled]="renameBusy" (click)="closeRename()">{{renameUncertain ? 'Fechar tentativa' : 'Cancelar'}}</button>
                </div>
                <p *ngIf="renameMessage" role="status" class="text-sm">{{renameMessage}}</p>
              </section>
            </li>
          </ul>
          <div class="flex gap-2 flex-wrap">
            <button *ngIf="pageIndex>0" type="button" [disabled]="uploadActive || renameBusy" (click)="previous()" class="rounded-lg border px-3 py-2 text-sm">Página anterior</button>
            <button *ngIf="nextToken" type="button" [disabled]="uploadActive || renameBusy" (click)="next()" class="rounded-lg border px-3 py-2 text-sm">Próxima página</button>
          </div>
        </ng-container>
      </ng-container>
      <p class="text-xs text-gray-500">Prévias de imagens e texto; documentos e planilhas Google têm prévia textual. Downloads comuns {{canStreamDownload ? 'de até ' + (streamMaxBytes / 1073741824 | number:'1.0-2') + ' GiB' : 'de até 10 MiB'}}. Exportações Google limitadas a 10 MB. A edição externa será disponibilizada separadamente.</p>
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
  canStreamDownload=false;
  streamMaxBytes=0;
  canCreateFolder=false;
  folderBusy=false;
  transferMode:DriveTransferAction='MOVE';
  transferBusy=false;dragging=false;transferMessage='';
  targetsOpen=false;targetsBusy=false;targetsError='';targetTrail:DriveMount[]=[];targetFolders:DriveMount[]=[];targetNext:string|null=null;
  private transferGeneration=0;private readonly transferCancel$=new Subject<void>();
  private targetsGeneration=0;private readonly targetsCancel$=new Subject<void>();
  historyEntry:DriveEntry|null=null;
  revisions:DriveRevision[]=[];historyBusy=false;historyError='';historyNext:string|null=null;
  private historyGeneration=0;
  private readonly historyCancel$=new Subject<void>();
  renameEntry:DriveEntry|null=null;
  renameName='';renameMessage='';renameBusy=false;renameUncertain=false;
  private renameOperation:string|null=null;
  private renameGeneration=0;
  private readonly renameCancel$=new Subject<void>();
  folderName='';
  folderMessage='';
  folderUncertain=false;
  private folderOperation:string|null=null;
  private folderGeneration=0;
  private readonly folderCancel$=new Subject<void>();
  replacementTarget:ReplacementTarget|null=null;
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
  constructor(private readonly drive:GoogleDriveBrowserService,private readonly users:UserService,private readonly host:ElementRef<HTMLElement>){}
  ngOnInit():void {
    this.users.user$.pipe(map(user=>user?.id??null),distinctUntilChanged(),takeUntil(this.destroyed$)).subscribe(id=>{
      if(this.uploadPanel){this.uploadPanel.enabled=false;this.uploadPanel.reset();}
      this.uploadActive=false;this.uploadNotice='';this.resetFolderDraft();this.resetRename();this.resetTransfers();
      this.activeUser=id;
      this.home();
    });
  }
  home():void {
    if(this.uploadActive||this.folderBusy||this.renameBusy||this.transferBusy||this.dragging)return;
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
    if(this.busy||this.uploadActive||this.folderBusy||this.renameBusy||this.transferBusy||this.dragging||!this.mounts.some(m=>m.id===mount.id))return;
    this.trail=[mount];this.clearPage();this.load();
  }
  openChild(entry:DriveEntry):void {
    if(this.busy||this.uploadActive||this.folderBusy||this.renameBusy||this.transferBusy||this.dragging||!entry.folder||!this.entries.some(e=>e.id===entry.id&&e.folder))return;
    this.trail=[...this.trail,{id:entry.id,name:entry.name}];this.clearPage();this.load();
  }
  openTrail(index:number):void {
    if(this.busy||this.uploadActive||this.folderBusy||this.renameBusy||this.transferBusy||this.dragging||index<0||index>=this.trail.length)return;
    this.trail=this.trail.slice(0,index+1);this.clearPage();this.load();
  }
  next():void {
    if(this.busy||this.uploadActive||this.folderBusy||this.renameBusy||this.transferBusy||this.dragging||!this.nextToken)return;
    this.tokens=this.tokens.slice(0,this.pageIndex+1);
    this.tokens.push(this.nextToken);this.pageIndex++;this.load();
  }
  previous():void {
    if(this.busy||this.uploadActive||this.folderBusy||this.renameBusy||this.transferBusy||this.dragging||this.pageIndex===0)return;
    this.pageIndex--;this.load();
  }
  private clearPage():void {this.resetTransfers();this.replacementTarget=null;this.closePreview();this.canDownload=false;this.canUpload=false;this.canStreamDownload=false;this.streamMaxBytes=0;this.canCreateFolder=false;this.resetFolderDraft();this.resetRename();this.contentError='';this.entries=[];this.nextToken=null;this.tokens=[undefined];this.pageIndex=0;}
  private load():void {
    if(this.activeUser===null||!this.trail.length)return;
    this.cancel$.next();this.resetTransfers();this.replacementTarget=null;this.resetRename();this.closePreview();this.canDownload=false;this.canUpload=false;this.contentError='';this.entries=[];this.nextToken=null;this.error='';this.busy=true;
    this.drive.list(this.trail[0].id,this.trail[this.trail.length-1].id,this.tokens[this.pageIndex])
      .pipe(takeUntil(this.cancel$)).subscribe({
        next:page=>{this.entries=page.entries;this.canDownload=page.canDownload===true;this.canUpload=page.canUpload===true;this.canCreateFolder=page.canCreateFolder===true;this.canStreamDownload=page.canStreamDownload===true;this.streamMaxBytes=page.streamMaxBytes??0;this.nextToken=page.nextPageToken;this.busy=false;},
        error:()=>{this.busy=false;this.mounts=[];this.trail=[];this.clearPage();this.error='Pasta indisponível ou sem acesso. Atualize suas pastas para continuar.';}
      });
  }
  onUploadActive(active:boolean):void {
    this.uploadActive=active;
    if(active){this.closePreview();this.contentError='';this.uploadNotice='';}
  }
  refreshAfterUpload():void {
    const replaced=!!this.replacementTarget;
    this.uploadActive=false;this.clearPage();this.uploadNotice=replaced?'Arquivo substituído com sucesso.':'Arquivo publicado com sucesso.';this.load();
  }
  get hasTransfer():boolean {return this.entries.some(e=>e.canMove||e.canCopy);}
  setTransferMode(mode:DriveTransferAction):void {if(!this.transferBusy&&!this.dragging)this.transferMode=mode;}
  canDrag(item:DriveEntry):boolean {
    return !this.busy&&!this.transferBusy&&!this.uploadActive&&!this.folderBusy&&!this.renameEntry&&!this.replacementTarget&&!this.contentBusy&&
      !!item.version&&(this.transferMode==='MOVE'?item.canMove===true:item.canCopy===true);
  }
  private resetTransfers():void {
    ++this.transferGeneration;this.transferCancel$.next();this.transferBusy=false;this.dragging=false;this.transferMessage='';
    ++this.targetsGeneration;this.targetsCancel$.next();this.targetsOpen=false;this.targetsBusy=false;this.targetsError='';
    this.targetTrail=[];this.targetFolders=[];this.targetNext=null;
  }
  toggleTargets():void {
    if(this.dragging||this.transferBusy)return;
    this.targetsOpen=!this.targetsOpen;
    if(this.targetsOpen)this.targetHome();
    else {++this.targetsGeneration;this.targetsCancel$.next();this.targetTrail=[];this.targetFolders=[];this.targetNext=null;this.targetsBusy=false;}
  }
  targetHome():void {
    if(this.dragging||this.transferBusy)return;
    ++this.targetsGeneration;this.targetsCancel$.next();this.targetTrail=[];this.targetFolders=[...this.mounts];this.targetNext=null;this.targetsBusy=false;this.targetsError='';
  }
  openTarget(item:DriveMount):void {
    if(this.dragging||this.transferBusy||this.targetsBusy||!this.targetFolders.some(t=>t.id===item.id))return;
    this.targetTrail=[...this.targetTrail,item];this.loadTargets();
  }
  targetBack(index:number):void {
    if(this.dragging||this.transferBusy||this.targetsBusy||index<0||index>=this.targetTrail.length)return;
    this.targetTrail=this.targetTrail.slice(0,index+1);this.loadTargets();
  }
  moreTargets():void {if(this.targetNext&&!this.targetsBusy&&!this.dragging&&!this.transferBusy)this.loadTargets(this.targetNext);}
  private loadTargets(token?:string):void {
    if(!this.targetTrail.length)return;
    const generation=++this.targetsGeneration;this.targetsCancel$.next();this.targetsBusy=true;this.targetsError='';
    if(!token)this.targetFolders=[];
    this.targetNext=null;
    this.drive.list(this.targetTrail[0].id,this.targetTrail[this.targetTrail.length-1].id,token)
      .pipe(takeUntil(this.targetsCancel$)).subscribe({
        next:p=>{if(generation===this.targetsGeneration){
          this.targetFolders=[...this.targetFolders,...p.entries.filter(e=>e.folder).map(e=>({id:e.id,name:e.name}))];
          this.targetNext=p.nextPageToken;this.targetsBusy=false;
        }},
        error:()=>{if(generation===this.targetsGeneration){this.targetsBusy=false;this.targetsError='Destino indisponível.';}}
      });
  }
  finishDrag(event:CdkDragEnd,item:DriveEntry):void {
    event.source.reset();this.dragging=false;
    if(!this.canDrag(item)||!this.trail.length||!item.version||this.activeUser===null||
       !this.entries.some(e=>e.id===item.id&&e.version===item.version))return;
    const pointer=event.event instanceof MouseEvent?event.event:event.event.changedTouches[0];
    if(!pointer)return;
    const zone=document.elementFromPoint(pointer.clientX,pointer.clientY)?.closest<HTMLElement>('[data-transfer-anchor][data-transfer-folder]');
    if(!zone||!this.host.nativeElement.contains(zone))return;
    const anchor=zone.dataset['transferAnchor'],destination=zone.dataset['transferFolder'];
    const parent=this.trail[this.trail.length-1].id;
    if(!anchor||!destination||destination===item.id||(this.transferMode==='MOVE'&&destination===parent))return;
    const request:DriveTransferRequest={sourceAnchor:this.trail[0].id,parent,file:item.id,version:item.version,
      destinationAnchor:anchor,destination,action:this.transferMode,operationId:crypto.randomUUID()};
    const generation=++this.transferGeneration;this.transferBusy=true;this.transferMessage='';this.closePreview();
    this.drive.transfer(request).pipe(takeUntil(this.transferCancel$)).subscribe({
      next:()=>{
        if(generation!==this.transferGeneration)return;
        this.transferBusy=false;this.clearPage();this.load();
        this.uploadNotice=request.action==='COPY'?'Arquivo copiado.':'Item movido.';
      },
      error:()=>{
        if(generation!==this.transferGeneration)return;
        this.transferBusy=false;this.clearPage();this.load();
        this.transferMessage='Operação não confirmada. Confira a pasta de destino antes de tentar novamente.';
      }
    });
  }
  startReplacement(item:DriveEntry):void {
    if(this.busy||this.transferBusy||this.dragging||this.uploadActive||this.folderBusy||this.renameEntry||this.replacementTarget||this.contentBusy||
       !item.canReplace||item.folder||!item.version||!this.entries.some(e=>e.id===item.id&&e.version===item.version&&e.canReplace&&!e.folder))return;
    this.closePreview();this.uploadNotice='';
    this.replacementTarget={id:item.id,name:item.name,version:item.version,mimeType:item.mimeType};
  }
  closeReplacement():void {if(!this.uploadActive)this.replacementTarget=null;}
  setFolderName(name:string):void {
    if(this.folderBusy||this.folderUncertain)return;
    this.folderName=name;this.folderOperation=null;this.folderMessage='';
  }
  resetFolderDraft():void {
    this.folderGeneration++;this.folderCancel$.next();this.folderBusy=false;
    this.folderName='';this.folderOperation=null;this.folderMessage='';this.folderUncertain=false;
  }
  createFolder():void {
    if(this.busy||this.transferBusy||this.dragging||this.folderBusy||this.uploadActive||!this.canCreateFolder||this.activeUser===null||!this.trail.length)return;
    const name=this.folderName.trim();
    if(!name)return;
    this.closePreview();
    this.folderOperation??=crypto.randomUUID();
    const generation=++this.folderGeneration;
    this.folderBusy=true;this.folderMessage='';
    this.drive.createFolder(this.trail[0].id,this.trail[this.trail.length-1].id,name,this.folderOperation)
      .pipe(takeUntil(this.folderCancel$)).subscribe({
        next:()=>{
          if(generation!==this.folderGeneration)return;
          this.resetFolderDraft();this.clearPage();this.uploadNotice='Pasta criada com sucesso.';this.load();
        },
        error:()=>{
          if(generation!==this.folderGeneration)return;
          this.folderBusy=false;this.folderUncertain=true;
          this.folderMessage='Criação não confirmada. Verifique novamente com a mesma operação; não crie outra pasta sem conferir.';
        }
      });
  }
  startRename(item:DriveEntry):void {
    if(this.busy||this.uploadActive||this.folderBusy||this.renameEntry||this.replacementTarget||this.contentBusy||
       !item.canRename||!item.version||!this.entries.some(e=>e.id===item.id&&e.version===item.version&&e.canRename))return;
    this.closePreview();this.renameEntry=item;this.renameName=item.name;
  }
  setRenameName(name:string):void {
    if(this.renameBusy||this.renameUncertain)return;
    this.renameName=name;this.renameOperation=null;this.renameMessage='';
  }
  private resetRename():void {
    ++this.renameGeneration;this.renameCancel$.next();
    this.renameEntry=null;this.renameName='';this.renameMessage='';this.renameBusy=false;
    this.renameUncertain=false;this.renameOperation=null;
  }
  closeRename():void {
    if(this.renameBusy)return;
    const refresh=this.renameUncertain;
    this.resetRename();if(refresh)this.load();
  }
  saveRename():void {
    const item=this.renameEntry,name=this.renameName.trim();
    if(this.renameBusy||this.transferBusy||this.dragging||this.uploadActive||this.folderBusy||this.busy||!item?.version||!item.canRename||
       this.activeUser===null||!this.trail.length||!name||name===item.name)return;
    this.renameOperation??=crypto.randomUUID();
    const generation=++this.renameGeneration;
    this.renameBusy=true;this.renameMessage='';
    this.drive.rename(this.trail[0].id,this.trail[this.trail.length-1].id,item.id,item.version,name,this.renameOperation)
      .pipe(takeUntil(this.renameCancel$)).subscribe({
        next:()=>{
          if(generation!==this.renameGeneration)return;
          this.resetRename();this.clearPage();this.uploadNotice='Nome atualizado com sucesso.';this.load();
        },
        error:()=>{
          if(generation!==this.renameGeneration)return;
          this.renameBusy=false;this.renameUncertain=true;
          this.renameMessage='Renomeação não confirmada. Verifique a mesma operação ou feche para atualizar a pasta. Não repita com outro identificador.';
        }
      });
  }
  supportsPreview(entry:DriveEntry):boolean {
    return !entry.folder && ['image/png','image/jpeg','image/gif','image/webp','text/plain','text/csv',
      'application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet'].includes(entry.mimeType);
  }
  supportsDownload(entry:DriveEntry):boolean {
    return !entry.folder && (!entry.mimeType.startsWith('application/vnd.google-apps.') ||
      ['application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet','application/vnd.google-apps.presentation'].includes(entry.mimeType));
  }
  closeHistory():void {
    ++this.historyGeneration;this.historyCancel$.next();this.historyEntry=null;this.revisions=[];this.historyBusy=false;this.historyError='';this.historyNext=null;
  }
  openHistory(item:DriveEntry):void {
    if(this.busy||this.uploadActive||this.folderBusy||this.renameBusy||this.transferBusy||this.dragging||this.contentBusy||!this.trail.length||this.activeUser===null||
       !this.entries.some(e=>e.id===item.id&&e.canViewHistory===true&&!e.folder))return;
    this.closePreview();this.historyEntry=item;this.loadHistory();
  }
  nextHistory():void {
    if(this.historyNext&&!this.historyBusy)this.loadHistory(this.historyNext);
  }
  private loadHistory(token?:string):void {
    const item=this.historyEntry;if(!item||!this.trail.length)return;
    const generation=++this.historyGeneration;this.historyCancel$.next();this.historyBusy=true;this.historyError='';this.revisions=[];this.historyNext=null;
    this.drive.history(this.trail[0].id,this.trail[this.trail.length-1].id,item.id,token).pipe(takeUntil(this.historyCancel$)).subscribe({
      next:r=>{if(generation===this.historyGeneration){this.revisions=r.revisions;this.historyNext=r.nextPageToken;this.historyBusy=false;}},
      error:()=>{if(generation===this.historyGeneration){this.historyBusy=false;this.historyError='Histórico indisponível ou sem acesso.';}}
    });
  }
  closePreview():void {
    this.closeHistory();
    this.contentGeneration++;this.contentCancel$.next();this.contentBusy=false;
    if(this.previewUrl)URL.revokeObjectURL(this.previewUrl);
    this.previewUrl=null;this.previewName='';this.previewText=null;this.previewNote='';
  }
  read(item:DriveEntry,preview:boolean):void {
    if(this.busy||this.uploadActive||this.folderBusy||this.renameBusy||this.transferBusy||this.dragging||this.contentBusy||this.activeUser===null||!this.trail.length||
        !this.entries.some(e=>e.id===item.id&&!e.folder)||
        (preview?!this.supportsPreview(item):!this.canDownload||!this.supportsDownload(item)))return;
    this.closePreview();this.contentError='';this.contentBusy=true;
    const generation=this.contentGeneration;
    if(!preview&&this.canStreamDownload&&!item.mimeType.startsWith('application/vnd.google-apps.')){
      this.drive.downloadTicket(this.trail[0].id,this.trail[this.trail.length-1].id,item.id)
        .pipe(takeUntil(this.contentCancel$)).subscribe({
          next:r=>{
            if(generation!==this.contentGeneration)return;
            this.contentBusy=false;
            try{this.drive.redeemDownload(r.ticket);this.uploadNotice='Solicitação enviada ao gerenciador de downloads do navegador.';}
            catch{this.contentError='Não foi possível iniciar o download.';}
          },
          error:()=>{if(generation===this.contentGeneration){this.contentBusy=false;this.contentError='Download indisponível, sem acesso ou acima do limite.';}}
        });
      return;
    }
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
    this.uploadPanel?.reset(false);this.resetTransfers();this.transferCancel$.complete();this.targetsCancel$.complete();this.resetRename();this.renameCancel$.complete();this.resetFolderDraft();this.folderCancel$.complete();this.closePreview();this.contentCancel$.complete();this.historyCancel$.complete();this.cancel$.next();this.cancel$.complete();this.destroyed$.next();this.destroyed$.complete();
  }
}
