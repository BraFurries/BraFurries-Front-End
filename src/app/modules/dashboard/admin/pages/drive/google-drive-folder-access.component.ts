import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export const INTERNAL_PERMISSIONS=[
  {code:'VIEW',label:'Visualizar arquivos'},
  {code:'DOWNLOAD',label:'Baixar arquivos'},
  {code:'UPLOAD',label:'Enviar arquivos'},
  {code:'CREATE_FOLDER',label:'Criar pastas'},
  {code:'RENAME',label:'Renomear arquivos'},
  {code:'REPLACE',label:'Substituir arquivos'},
  {code:'MOVE',label:'Mover arquivos'},
  {code:'TRASH',label:'Mover para a lixeira'}
] as const;
export const EXTERNAL_PERMISSIONS=[
  {code:'EXTERNAL_VIEW',label:'Visualizar documentos no Google'},
  {code:'EXTERNAL_EDIT',label:'Editar documentos no Google'},
  {code:'EXTERNAL_FOLDER',label:'Acessar a pasta diretamente pelo Google Drive'}
] as const;
type Principal='PERSON'|'ROLE';
interface Grant {principalType:Principal;principalId:number;permission:string;}
interface Option {key:string;type:Principal;id:number;name:string;}

@Component({
  selector:'app-google-drive-folder-access',
  standalone:true,
  imports:[CommonModule],
  template:`
    <section class="rounded-xl border p-4 space-y-3">
      <div class="flex items-center justify-between gap-2"><h3 class="font-bold">Permissões da pasta</h3><button type="button" [disabled]="busy || dirty" (click)="closed.emit()" class="rounded border px-3 py-1 text-sm">Fechar</button></div>
      <p class="text-sm text-gray-600">A pessoa precisa estar aprovada e possuir um cargo ativo com as mesmas permissões. Nenhuma alteração é enviada ao Google nesta etapa.</p>
      <p *ngIf="error" role="alert" class="rounded bg-red-50 p-2 text-sm text-red-800">{{error}}</p>
      <p *ngIf="notice" role="status" class="text-sm text-green-700">{{notice}}</p>
      <button type="button" [disabled]="busy || dirty" (click)="load()" class="rounded border px-3 py-2 text-sm">Recarregar</button>
      <label class="block text-sm font-semibold" for="drive-access-principal">Pessoa ou cargo</label>
      <select id="drive-access-principal" class="w-full rounded border p-2" [disabled]="busy || dirty || !loaded"
        [value]="selected?.key || ''" (change)="select($any($event.target).value)">
        <option value="">Selecione uma pessoa ou cargo</option>
        <option *ngFor="let option of options" [value]="option.key">{{option.name}}</option>
      </select>
      <p *ngIf="dirty" class="text-sm text-amber-800">Salve ou descarte as alterações antes de selecionar outro acesso.</p>
      <ng-container *ngIf="selected">
        <h4 class="font-bold text-sm">Gerenciador BraFurries</h4>
        <label *ngFor="let permission of internal" class="flex gap-2 items-center text-sm">
          <input type="checkbox" [disabled]="busy" [checked]="draft.has(permission.code)"
            (change)="toggle(permission.code,$any($event.target).checked)">{{permission.label}}
        </label>
        <h4 class="font-bold text-sm border-t pt-3">Google externo (configuração futura)</h4>
        <p class="text-xs text-gray-600">Estas concessões registram apenas a política desejada. Não liberam o editor nem o acesso externo nesta versão.</p>
        <label *ngFor="let permission of external" class="flex gap-2 items-center text-sm">
          <input type="checkbox" [disabled]="busy" [checked]="draft.has(permission.code)"
            (change)="toggle(permission.code,$any($event.target).checked)">{{permission.label}}
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" [disabled]="busy || !dirty" (click)="save()" class="rounded bg-braPurple px-3 py-2 text-white font-bold disabled:opacity-50">Salvar alterações</button>
          <button type="button" [disabled]="busy || !dirty" (click)="discard()" class="rounded border px-3 py-2">Descartar</button>
        </div>
      </ng-container>
    </section>
  `
})
export class GoogleDriveFolderAccessComponent implements OnChanges,OnDestroy {
  @Input({required:true}) folderId='';
  @Output() readonly closed=new EventEmitter<void>();
  readonly internal=INTERNAL_PERMISSIONS;
  readonly external=EXTERNAL_PERMISSIONS;
  private readonly cancel$=new Subject<void>();
  private readonly root=environment.apiBaseUrl+'/user/me';
  private grants:Grant[]=[];
  options:Option[]=[];
  selected:Option|null=null;
  original=new Set<string>();
  draft=new Set<string>();
  busy=false;
  loaded=false;
  error='';
  notice='';
  get dirty():boolean {
    return this.original.size!==this.draft.size || [...this.original].some(code=>!this.draft.has(code));
  }
  private get endpoint():string {
    return this.root+'/platform-drive/folders/'+encodeURIComponent(this.folderId)+'/access';
  }
  constructor(private readonly http:HttpClient){}
  ngOnChanges():void {this.load();}
  load():void {
    this.cancel$.next();
    this.busy=true;this.loaded=false;this.error='';this.notice='';
    this.selected=null;this.options=[];this.grants=[];this.original=new Set();this.draft=new Set();
    forkJoin({
      grants:this.http.get<Grant[]>(this.endpoint),
      people:this.http.get<{userId:number;name:string}[]>(this.root+'/platform-access/people'),
      roles:this.http.get<{roleId:number;name:string;active:boolean}[]>(this.root+'/platform-access/team-roles')
    }).pipe(takeUntil(this.cancel$)).subscribe({
      next:({grants,people,roles})=>{
        this.grants=grants;
        this.options=[
          ...people.map(p=>({key:'PERSON:'+p.userId,type:'PERSON' as const,id:p.userId,name:'Pessoa — '+p.name})),
          ...roles.filter(r=>r.active||grants.some(g=>g.principalType==='ROLE'&&g.principalId===r.roleId))
            .map(r=>({key:'ROLE:'+r.roleId,type:'ROLE' as const,id:r.roleId,name:'Cargo — '+r.name+(r.active?'':' (inativo)')}))
        ];
        this.busy=false;this.loaded=true;
      },
      error:()=>{this.busy=false;this.error='Não foi possível consultar as permissões.';}
    });
  }
  select(key:string):void {
    if(this.busy||this.dirty)return;
    this.selected=this.options.find(o=>o.key===key)||null;
    this.original=new Set(this.grants.filter(g=>g.principalType===this.selected?.type&&g.principalId===this.selected?.id).map(g=>g.permission));
    this.draft=new Set(this.original);this.notice='';this.error='';
  }
  toggle(code:string,checked:boolean):void {
    if(this.busy||!this.selected)return;
    if(checked)this.draft.add(code);else this.draft.delete(code);
  }
  discard():void {if(!this.busy){this.draft=new Set(this.original);this.error='';}}
  save():void {
    const selected=this.selected;
    if(this.busy||!selected||!this.dirty)return;
    const expected=[...this.original],desired=[...this.draft];
    this.busy=true;this.error='';this.notice='';
    this.http.put<void>(this.endpoint+'/'+selected.type+'/'+selected.id,{expected,desired})
      .pipe(takeUntil(this.cancel$)).subscribe({
        next:()=>{
          this.grants=this.grants.filter(g=>g.principalType!==selected.type||g.principalId!==selected.id)
            .concat(desired.map(permission=>({principalType:selected.type,principalId:selected.id,permission})));
          this.original=new Set(desired);this.draft=new Set(desired);this.busy=false;this.notice='Permissões salvas.';
        },
        error:e=>{this.busy=false;this.error=e.status===409?'A configuração mudou ou a pessoa deixou de ser elegível. Descarte e recarregue antes de tentar novamente.':'Não foi possível salvar as permissões.';}
      });
  }
  ngOnDestroy():void {this.cancel$.next();this.cancel$.complete();}
}
