import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil, switchMap, of } from 'rxjs';
import { GoogleDriveUploadService, ReplacementTarget } from '../../../core/services/google-drive-upload.service';
import { uploadChunks, validateUploadUri } from '../../../core/services/google-drive-resumable-upload';

type Phase='idle'|'starting'|'sending'|'paused'|'publishing'|'confirm'|'canceling';
@Component({
  standalone:true,selector:'app-google-drive-upload',imports:[CommonModule],
  template:`
    <p *ngIf="replacement && !enabled" class="text-sm">Substituição indisponível neste piloto.</p>
    <section *ngIf="enabled" class="rounded-xl border p-4 space-y-3">
      <div class="flex flex-wrap justify-between items-center gap-2">
        <div><h2 class="font-bold">{{replacement ? 'Substituir ' + replacement.name : 'Enviar arquivo'}}</h2>
          <p class="text-xs text-gray-600">Piloto · envio direto ao Google · até {{maxBytes/1073741824 | number:'1.0-2'}} GiB</p></div>
        <label *ngIf="phase==='idle'" class="rounded-lg border px-3 py-2 text-sm cursor-pointer">
          Selecionar arquivo <input class="sr-only" type="file" [attr.accept]="replacement?.mimeType || null" (change)="select($event)">
        </label>
      </div>
      <p *ngIf="replacement" class="text-sm text-gray-600">O novo conteúdo substituirá o arquivo existente, mantendo seu nome e endereço.</p>
      <ng-container *ngIf="file">
        <p class="text-sm font-medium break-all">{{file.name}}</p>
        <progress class="w-full" [max]="file.size" [value]="confirmed" [attr.aria-label]="'Bytes confirmados pelo Google'"></progress>
        <p class="text-xs text-gray-600">{{confirmed/file.size | percent:'1.0-1'}} confirmado · {{phaseLabel}}</p>
        <p class="text-xs text-gray-500">Mantenha esta página aberta até a publicação. A retomada funciona nesta mesma sessão.</p>
      </ng-container>
      <p *ngIf="message" role="status" class="text-sm">{{message}}</p>
      <div class="flex flex-wrap gap-2">
        <button *ngIf="phase==='sending'" type="button" class="rounded border px-3 py-2 text-sm" (click)="pause()">Pausar</button>
        <button *ngIf="phase==='paused'" type="button" class="rounded border px-3 py-2 text-sm" (click)="resume()">Retomar</button>
        <button *ngIf="phase==='confirm'" type="button" class="rounded border px-3 py-2 text-sm" (click)="confirmPublication()">Verificar publicação</button>
        <button *ngIf="sessionId && phase!=='publishing' && phase!=='canceling'" type="button" class="rounded border px-3 py-2 text-sm" (click)="cancel()">Cancelar</button>
      </div>
    </section>
  `
})
export class GoogleDriveUploadComponent implements OnInit,OnDestroy {
  @Input({required:true}) anchor='';
  @Input({required:true}) destination='';
  @Input() replacement:ReplacementTarget|null=null;
  @Output() activeChange=new EventEmitter<boolean>();
  @Output() published=new EventEmitter<void>();
  private readonly stopped$=new Subject<void>();
  private readonly destroyed$=new Subject<void>();
  private generation=0;
  private abort:AbortController|null=null;
  private uri:string|null=null;
  sessionId:string|null=null;
  file:File|null=null;
  enabled=false;maxBytes=0;confirmed=0;message='';
  phase:Phase='idle';
  constructor(private readonly api:GoogleDriveUploadService){}
  get phaseLabel():string {
    return ({idle:'Pronto',starting:'Preparando sessão',sending:'Enviando',paused:'Pausado',
      publishing:'Validando e publicando',confirm:'Publicação pendente',canceling:'Cancelando'})[this.phase];
  }
  ngOnInit():void {
    this.api.capability(!!this.replacement).pipe(takeUntil(this.destroyed$),takeUntil(this.stopped$)).subscribe({
      next:c=>{this.enabled=c.enabled===true&&Number.isSafeInteger(c.maxBytes)&&c.maxBytes>0;this.maxBytes=c.maxBytes;},
      error:()=>{this.enabled=false;}
    });
  }
  select(event:Event):void {
    const input=event.target as HTMLInputElement;
    const file=input.files?.[0];input.value='';
    if(!file||!this.enabled||this.phase!=='idle')return;
    if(file.size<=0||file.size>this.maxBytes){this.message='Arquivo vazio ou acima do limite permitido.';return;}
    if(this.replacement && (file.type||'application/octet-stream')!==this.replacement.mimeType){this.message='Escolha um arquivo do mesmo formato.';return;}
    if(this.replacement&&!window.confirm('Substituir o conteúdo de '+this.replacement.name+'?'))return;
    this.file=file;this.confirmed=0;this.message='';this.phase='starting';this.activeChange.emit(true);
    const g=++this.generation;
    this.api.begin(this.anchor,this.destination,file,this.replacement??undefined).pipe(takeUntil(this.stopped$)).subscribe({
      next:s=>{
        if(g!==this.generation)return;
        this.sessionId=s.sessionId;
        try{this.uri=validateUploadUri(s.uploadUri);void this.transfer(false);}
        catch{this.phase='confirm';this.message='Sessão do Google inválida. Cancele o envio.';}
      },
      error:()=>{if(g===this.generation){this.reset();this.message='Não foi possível iniciar o upload. Verifique a pasta, o limite e suas permissões.';}}
    });
  }
  private async transfer(resume:boolean):Promise<void>{
    const file=this.file,uri=this.uri;
    if(!file||!uri)return;
    const g=++this.generation;
    this.abort=new AbortController();
    this.phase='sending';this.message='';
    try {
      await uploadChunks(file,uri,this.abort.signal,resume,bytes=>{if(g===this.generation)this.confirmed=bytes;});
      if(g!==this.generation)return;
      this.uri=null;this.confirmPublication();
    } catch(e){
      if(g!==this.generation)return;
      this.phase='paused';this.message=e instanceof Error?e.message:'Transferência interrompida.';
    } finally{if(g===this.generation)this.abort=null;}
  }
  pause():void {
    if(this.phase!=='sending')return;
    ++this.generation;this.abort?.abort();this.abort=null;this.phase='paused';this.message='Envio pausado.';
  }
  resume():void {
    if(this.phase!=='paused'||!this.sessionId||!this.uri)return;
    const g=++this.generation;this.phase='starting';
    this.api.status(this.sessionId,!!this.replacement).pipe(takeUntil(this.stopped$)).subscribe({
      next:s=>{
        if(g!==this.generation)return;
        if(s.status==='OPEN'&&!s.expired&&s.resumeAllowed===true){void this.transfer(true);return;}
        this.uri=null;this.phase='confirm';this.message='Sessão não está mais aberta. Verifique a publicação ou cancele.';
      },
      error:()=>{if(g===this.generation){this.phase='paused';this.message='Não foi possível consultar a sessão. Tente novamente.';}}
    });
  }
  confirmPublication():void {
    if(!this.sessionId||this.phase==='publishing'||this.phase==='canceling')return;
    const g=++this.generation;this.phase='publishing';this.message='';
    const id=this.sessionId;
    const operation=this.replacement?this.api.status(id,true).pipe(switchMap(s=>{
      if(s.status==='OPEN'&&!s.expired&&s.resumeAllowed)return this.api.publish(id,true);
      return of(s);
    })):this.api.publish(id,false);
    operation.pipe(takeUntil(this.stopped$)).subscribe({
      next:r=>{
        if(g!==this.generation)return;
        if(r.status==='PUBLISHED'){this.reset();this.message=this.replacement?'Arquivo substituído!':'Arquivo publicado!';this.published.emit();}
        else{this.phase='confirm';this.message=r.status==='PUBLISHING'?'Substituição em andamento. Verifique novamente.':r.status==='RECONCILE_REQUIRED'?'Resultado exige revisão administrativa. Não reenvie o arquivo.':'Publicação ainda não confirmada.';}
      },
      error:()=>{if(g===this.generation){this.phase='confirm';this.message='Publicação não confirmada. Verifique novamente; não reenvie o arquivo.';}}
    });
  }
  cancel():void {
    if(!this.sessionId||this.phase==='publishing'||this.phase==='canceling')return;
    ++this.generation;this.abort?.abort();this.abort=null;this.uri=null;this.stopped$.next();
    const g=this.generation;this.phase='canceling';
    this.api.cancel(this.sessionId,!!this.replacement).pipe(takeUntil(this.stopped$)).subscribe({
      next:r=>{
        if(g!==this.generation)return;
        const published=r.status==='PUBLISHED';
        this.reset();
        this.message=published?'Arquivo já publicado.':r.status==='CANCELED'||r.status==='CLEANUP_PENDING'||r.status==='CLEANED'||r.status==='EXPIRED'?
          'Sessão encerrada; limpeza processada separadamente.':'Sessão exige revisão administrativa.';
        if(published)this.published.emit();
      },
      error:()=>{if(g===this.generation){this.phase='confirm';this.message='Cancelamento não confirmado. Tente novamente.';}}
    });
  }
  reset(notify=true):void {
    ++this.generation;this.abort?.abort();this.abort=null;this.stopped$.next();
    this.uri=null;this.sessionId=null;this.file=null;this.confirmed=0;this.phase='idle';this.message='';
    if(notify)this.activeChange.emit(false);
  }
  ngOnDestroy():void {
    this.reset(false);this.destroyed$.next();this.destroyed$.complete();this.stopped$.complete();
  }
}
