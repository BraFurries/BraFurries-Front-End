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
    drive=jasmine.createSpyObj('GoogleDriveBrowserService',['mounts','list']);
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
});
