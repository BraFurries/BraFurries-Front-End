import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

interface ConnectionStatus {
  configured: boolean; connected: boolean; accountEmail: string|null; reconnectRequired: boolean;
}
type RootStatus='ACCESSIBLE'|'NOT_AUTHORIZED'|'RECONNECT_REQUIRED'|'UNAVAILABLE';

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
          <button type="button" (click)="connect()" [disabled]="busy" class="rounded-lg bg-braPurple px-4 py-2 text-white font-bold disabled:opacity-50">
            {{ status?.connected ? 'Reconectar conta' : 'Conectar conta institucional' }}
          </button>
          <button *ngIf="status?.connected" type="button" (click)="checkRoot()" [disabled]="busy" class="rounded-lg border px-4 py-2 font-semibold">Verificar acesso à pasta raiz</button>
          <button *ngIf="status?.connected || status?.reconnectRequired" type="button" (click)="confirmDisconnect=true" [disabled]="busy" class="rounded-lg border px-4 py-2 font-semibold text-red-700">Desconectar</button>
        </div>
        <div *ngIf="confirmDisconnect" class="rounded-lg border p-3 space-y-2">
          <p class="text-sm">Remover a autorização armazenada na BraFurries? Para revogar a concessão no Google, acesse as conexões da conta institucional.</p>
          <button type="button" (click)="disconnect()" [disabled]="busy" class="rounded-lg border px-3 py-1 font-bold text-red-700">Confirmar</button>
          <button type="button" (click)="confirmDisconnect=false" class="rounded-lg px-3 py-1">Cancelar</button>
        </div>
        <p *ngIf="rootStatus==='ACCESSIBLE'" role="status" class="rounded-lg bg-green-50 p-3 text-sm text-green-800">Pasta raiz acessível e compartilhável pela conta institucional.</p>
        <p *ngIf="rootStatus==='NOT_AUTHORIZED'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">A pasta não está autorizada para este aplicativo, não pertence à conta institucional ou não pode ser compartilhada. Nenhuma permissão foi alterada.</p>
        <p *ngIf="rootStatus==='RECONNECT_REQUIRED'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">A autorização não está mais utilizável. Reconecte a conta.</p>
        <p *ngIf="rootStatus==='UNAVAILABLE'" role="status" class="rounded-lg bg-amber-50 p-3 text-sm">Não foi possível consultar o Google. Tente novamente.</p>
      </ng-container>
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
  constructor(private readonly http:HttpClient) {}

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
          next:status=>{this.status=status;this.busy=false;},
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
      next:status=>{this.status=status;this.busy=false;},
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
  checkRoot():void {
    if(this.busy||!this.status?.connected) return;
    this.busy=true;this.error='';this.rootStatus=null;
    this.http.post<{status:RootStatus}>(this.endpoint+'/connection/check-root',{})
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:result=>{this.rootStatus=result.status;this.busy=false;},
        error:()=>{this.busy=false;this.error='Não foi possível verificar a pasta raiz.';}
      });
  }
  disconnect():void {
    if(this.busy||!this.confirmDisconnect) return;
    this.busy=true;this.error='';this.rootStatus=null;
    this.http.delete<void>(this.endpoint+'/connection').pipe(takeUntil(this.destroyed$)).subscribe({
      next:()=>{this.confirmDisconnect=false;this.loadStatus();},
      error:()=>{this.busy=false;this.error='Não foi possível desconectar a conta.';}
    });
  }
  ngOnDestroy():void {this.destroyed$.next();this.destroyed$.complete();}
}
