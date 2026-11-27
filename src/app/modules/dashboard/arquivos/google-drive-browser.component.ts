import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { distinctUntilChanged, map, Subject, takeUntil } from 'rxjs';
import { DriveEntry, DriveMount, GoogleDriveBrowserService } from '../../../core/services/google-drive-browser.service';
import { UserService } from '../../../core/services/user.service';

@Component({
  standalone:true,
  selector:'app-google-drive-browser',
  imports:[CommonModule],
  template:`
    <main class="max-w-6xl mx-auto space-y-4 p-4 sm:p-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="font-amaranth text-2xl font-bold">Arquivos</h1><p class="text-sm text-gray-600">Explore as pastas da BraFurries disponíveis para sua conta.</p></div>
        <button type="button" class="rounded-lg border px-3 py-2 text-sm" [disabled]="busy" (click)="home()">Atualizar pastas</button>
      </header>
      <nav aria-label="Caminho da pasta" class="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" (click)="home()" class="font-bold text-braPurple">Minhas pastas</button>
        <ng-container *ngFor="let item of trail; let i=index">
          <span aria-hidden="true">/</span>
          <button type="button" (click)="openTrail(i)" [disabled]="busy" class="text-braPurple break-all">{{item.name}}</button>
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
          <p *ngIf="!entries.length" class="text-sm text-gray-600">Nenhum item acessível nesta página.</p>
          <ul *ngIf="entries.length" class="rounded-xl border divide-y">
            <li *ngFor="let item of entries" class="p-3">
              <button *ngIf="item.folder; else file" type="button" (click)="openChild(item)" class="flex items-center gap-3 w-full text-left">
                <span aria-hidden="true" class="text-2xl">📁</span><span class="font-semibold break-all">{{item.name}}</span>
              </button>
              <ng-template #file>
                <div class="flex items-start gap-3">
                  <span aria-hidden="true" class="text-2xl">📄</span>
                  <div class="min-w-0"><p class="font-semibold break-all">{{item.name}}</p><p class="text-xs text-gray-600 break-all">{{item.mimeType}}<ng-container *ngIf="item.modifiedTime"> · {{item.modifiedTime | date:'dd/MM/yyyy HH:mm'}}</ng-container></p></div>
                </div>
              </ng-template>
            </li>
          </ul>
          <div class="flex gap-2 flex-wrap">
            <button *ngIf="pageIndex>0" type="button" (click)="previous()" class="rounded-lg border px-3 py-2 text-sm">Página anterior</button>
            <button *ngIf="nextToken" type="button" (click)="next()" class="rounded-lg border px-3 py-2 text-sm">Próxima página</button>
          </div>
        </ng-container>
      </ng-container>
      <p class="text-xs text-gray-500">Versão de navegação: somente nomes e metadados. Visualização do conteúdo, download e edição serão disponibilizados separadamente.</p>
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
  error='';
  nextToken:string|null=null;
  private tokens:(string|undefined)[]=[undefined];
  pageIndex=0;
  constructor(private readonly drive:GoogleDriveBrowserService,private readonly users:UserService){}
  ngOnInit():void {
    this.users.user$.pipe(map(user=>user?.id??null),distinctUntilChanged(),takeUntil(this.destroyed$)).subscribe(id=>{
      this.activeUser=id;
      this.home();
    });
  }
  home():void {
    this.cancel$.next();
    this.trail=[];this.mounts=[];this.clearPage();this.error='';this.busy=false;
    if(this.activeUser===null)return;
    this.busy=true;
    this.drive.mounts().pipe(takeUntil(this.cancel$)).subscribe({
      next:mounts=>{this.mounts=mounts;this.busy=false;},
      error:()=>{this.busy=false;this.error='Não foi possível consultar suas pastas. Verifique seu acesso ou tente novamente.';}
    });
  }
  openMount(mount:DriveMount):void {
    if(this.busy||!this.mounts.some(m=>m.id===mount.id))return;
    this.trail=[mount];this.clearPage();this.load();
  }
  openChild(entry:DriveEntry):void {
    if(this.busy||!entry.folder||!this.entries.some(e=>e.id===entry.id&&e.folder))return;
    this.trail=[...this.trail,{id:entry.id,name:entry.name}];this.clearPage();this.load();
  }
  openTrail(index:number):void {
    if(this.busy||index<0||index>=this.trail.length)return;
    this.trail=this.trail.slice(0,index+1);this.clearPage();this.load();
  }
  next():void {
    if(this.busy||!this.nextToken)return;
    this.tokens=this.tokens.slice(0,this.pageIndex+1);
    this.tokens.push(this.nextToken);this.pageIndex++;this.load();
  }
  previous():void {
    if(this.busy||this.pageIndex===0)return;
    this.pageIndex--;this.load();
  }
  private clearPage():void {this.entries=[];this.nextToken=null;this.tokens=[undefined];this.pageIndex=0;}
  private load():void {
    if(this.activeUser===null||!this.trail.length)return;
    this.cancel$.next();this.entries=[];this.nextToken=null;this.error='';this.busy=true;
    this.drive.list(this.trail[0].id,this.trail[this.trail.length-1].id,this.tokens[this.pageIndex])
      .pipe(takeUntil(this.cancel$)).subscribe({
        next:page=>{this.entries=page.entries;this.nextToken=page.nextPageToken;this.busy=false;},
        error:()=>{this.busy=false;this.mounts=[];this.trail=[];this.clearPage();this.error='Pasta indisponível ou sem acesso. Atualize suas pastas para continuar.';}
      });
  }
  ngOnDestroy():void {
    this.cancel$.next();this.cancel$.complete();this.destroyed$.next();this.destroyed$.complete();
  }
}
