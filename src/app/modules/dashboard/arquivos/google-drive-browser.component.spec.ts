import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { GoogleDriveBrowserComponent } from './google-drive-browser.component';
import { DrivePage, GoogleDriveBrowserService } from '../../../core/services/google-drive-browser.service';
import { UserService } from '../../../core/services/user.service';

describe('GoogleDriveBrowserComponent',()=>{
  let fixture:ComponentFixture<GoogleDriveBrowserComponent>;
  let drive:jasmine.SpyObj<GoogleDriveBrowserService>;
  let users:BehaviorSubject<{id:number}|null>;
  const mount={id:'anchor_folder',name:'Eventos'};
  const child={id:'child_folder',name:'Materiais',mimeType:'application/vnd.google-apps.folder',folder:true,size:null,modifiedTime:null};
  beforeEach(async()=>{
    users=new BehaviorSubject<{id:number}|null>({id:1});
    drive=jasmine.createSpyObj('GoogleDriveBrowserService',['mounts','list','content','downloadTicket','redeemDownload','createFolder','rename']);
    drive.mounts.and.returnValue(of([mount]));
    drive.list.and.returnValue(of({entries:[child],nextPageToken:'next'}));
    await TestBed.configureTestingModule({imports:[GoogleDriveBrowserComponent],providers:[
      {provide:GoogleDriveBrowserService,useValue:drive},{provide:UserService,useValue:{user$:users.asObservable()}}
    ]}).compileComponents();
    fixture=TestBed.createComponent(GoogleDriveBrowserComponent);
    fixture.detectChanges();
  });
  afterEach(()=>fixture.destroy());
  it('navigates from an authorized mount and pages without any Google identity',()=>{
    const c=fixture.componentInstance;
    c.openMount(mount);
    expect(drive.list).toHaveBeenCalledWith('anchor_folder','anchor_folder',undefined);
    c.openChild(child);
    expect(drive.list).toHaveBeenCalledWith('anchor_folder','child_folder',undefined);
    c.next();
    expect(drive.list).toHaveBeenCalledWith('anchor_folder','child_folder','next');
    c.openTrail(0);
    expect(c.trail).toEqual([mount]);
  });
  it('clears old metadata after switching accounts and ignores late responses',()=>{
    const pending=new Subject<DrivePage>();
    drive.list.and.returnValue(pending.asObservable());
    const c=fixture.componentInstance;
    c.openMount(mount);
    drive.mounts.and.returnValue(of([]));
    users.next({id:2});
    pending.next({entries:[child],nextPageToken:null});
    expect(c.entries).toEqual([]);
    expect(c.trail).toEqual([]);
    expect(c.mounts).toEqual([]);
  });
  it('clears inaccessible paths when access is revoked',()=>{
    drive.list.and.returnValue(throwError(()=>({status:404})));
    const c=fixture.componentInstance;
    c.openMount(mount);
    expect(c.entries).toEqual([]);
    expect(c.trail).toEqual([]);
    expect(c.mounts).toEqual([]);
    expect(c.error).toContain('sem acesso');
  });

  it('allows preview without download and rejects download locally',()=>{
    const file={...child,id:'file_id',name:'Imagem.png',folder:false,mimeType:'image/png'};
    drive.list.and.returnValue(of({entries:[file],nextPageToken:null,canDownload:false}));
    drive.content.and.returnValue(of(new Blob([new Uint8Array([1])],{type:'image/png'})));
    const c=fixture.componentInstance;
    c.openMount(mount);
    c.read(file,false);
    expect(drive.content).not.toHaveBeenCalled();
    c.read(file,true);
    expect(drive.content).toHaveBeenCalledWith('anchor_folder','anchor_folder','file_id',true);
    expect(c.previewUrl).toBeTruthy();
    c.closePreview();
    expect(c.previewUrl).toBeNull();
  });
  it('discards pending file content on user change',()=>{
    const file={...child,id:'file_id',name:'Imagem.png',folder:false,mimeType:'image/png'};
    drive.list.and.returnValue(of({entries:[file],nextPageToken:null,canDownload:true}));
    const pending=new Subject<Blob>();
    drive.content.and.returnValue(pending);
    const c=fixture.componentInstance;
    c.openMount(mount);
    c.read(file,true);
    users.next({id:2});
    pending.next(new Blob([new Uint8Array([1])],{type:'image/png'}));
    expect(c.previewUrl).toBeNull();
    expect(c.contentBusy).toBeFalse();
  });

  it('sends native downloads without requesting the entire file as a Blob',()=>{
    const file={...child,id:'file_id',name:'video.mp4',folder:false,mimeType:'video/mp4'};
    drive.list.and.returnValue(of({entries:[file],nextPageToken:null,canDownload:true,canStreamDownload:true,streamMaxBytes:5368709120}));
    drive.downloadTicket.and.returnValue(of({ticket:'test-ticket'}));
    const c=fixture.componentInstance;c.openMount(mount);c.read(file,false);
    expect(drive.downloadTicket).toHaveBeenCalledWith('anchor_folder','anchor_folder','file_id');
    expect(drive.redeemDownload).toHaveBeenCalledWith('test-ticket');
    expect(drive.content).not.toHaveBeenCalled();
  });
  it('does not redeem a delayed download after switching account',()=>{
    const file={...child,id:'file_id',name:'video.mp4',folder:false,mimeType:'video/mp4'};
    drive.list.and.returnValue(of({entries:[file],nextPageToken:null,canDownload:true,canStreamDownload:true}));
    const pending=new Subject<{ticket:string}>();drive.downloadTicket.and.returnValue(pending);
    const c=fixture.componentInstance;c.openMount(mount);c.read(file,false);
    users.next({id:2});pending.next({ticket:'old'});
    expect(drive.redeemDownload).not.toHaveBeenCalled();
  });
  it('reuses the same folder operation after an ambiguous result',()=>{
    drive.list.and.returnValue(of({entries:[],nextPageToken:null,canCreateFolder:true}));
    drive.createFolder.and.returnValue(throwError(()=>({status:503})));
    const c=fixture.componentInstance;c.openMount(mount);c.setFolderName('Nova pasta');c.createFolder();c.createFolder();
    expect(drive.createFolder).toHaveBeenCalledTimes(2);
    expect(drive.createFolder.calls.argsFor(0)).toEqual(drive.createFolder.calls.argsFor(1));
  });

  it('sends expected version and preserves rename operation key after failure',()=>{
    const file={...child,id:'file_id',name:'old.png',folder:false,mimeType:'image/png',version:'12',canRename:true};
    drive.list.and.returnValue(of({entries:[file],nextPageToken:null}));
    drive.rename.and.returnValue(throwError(()=>({status:503})));
    const c=fixture.componentInstance;c.openMount(mount);c.startRename(file);c.setRenameName('new.png');c.saveRename();c.saveRename();
    expect(drive.rename).toHaveBeenCalledTimes(2);
    expect(drive.rename.calls.argsFor(0).slice(0,5)).toEqual(['anchor_folder','anchor_folder','file_id','12','new.png']);
    expect(drive.rename.calls.argsFor(0)).toEqual(drive.rename.calls.argsFor(1));
  });
  it('does not offer rename for entries lacking the server permission',()=>{
    const c=fixture.componentInstance;c.openMount(mount);c.startRename(child);
    expect(c.renameEntry).toBeNull();
    expect(drive.rename).not.toHaveBeenCalled();
  });
});
