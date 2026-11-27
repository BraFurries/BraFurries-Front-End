import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { GoogleDriveUploadComponent } from './google-drive-upload.component';
import { GoogleDriveUploadService, UploadStart } from '../../../core/services/google-drive-upload.service';

describe('GoogleDriveUploadComponent',()=>{
  let fixture:ComponentFixture<GoogleDriveUploadComponent>;
  let api:jasmine.SpyObj<GoogleDriveUploadService>;
  beforeEach(async()=>{
    api=jasmine.createSpyObj('GoogleDriveUploadService',['capability','begin','status','publish','cancel']);
    api.capability.and.returnValue(of({enabled:true,maxBytes:5368709120}));
    await TestBed.configureTestingModule({imports:[GoogleDriveUploadComponent],
      providers:[{provide:GoogleDriveUploadService,useValue:api}]}).compileComponents();
    fixture=TestBed.createComponent(GoogleDriveUploadComponent);
    fixture.componentRef.setInput('anchor','anchor_folder');
    fixture.componentRef.setInput('destination','child_folder');
    fixture.detectChanges();
  });
  afterEach(()=>fixture.destroy());
  function select(file:File){
    fixture.componentInstance.select({target:{files:[file],value:'x'}} as unknown as Event);
  }
  it('drops a delayed start response after account reset',()=>{
    const pending=new Subject<UploadStart>();api.begin.and.returnValue(pending);
    const request=spyOn(window,'fetch');
    select(new File(['hello'],'file.txt'));
    fixture.componentInstance.reset();
    pending.next({sessionId:'id',uploadUri:'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=secret'});
    expect(request).not.toHaveBeenCalled();
    expect(fixture.componentInstance.sessionId).toBeNull();
  });
  it('rejects empty files before requesting a capability',()=>{
    select(new File([],'empty.txt'));
    expect(api.begin).not.toHaveBeenCalled();
  });
  it('does not publish a file when returned URL is invalid',()=>{
    api.begin.and.returnValue(of({sessionId:'id',uploadUri:'https://example.com/upload'}));
    const request=spyOn(window,'fetch');
    select(new File(['hello'],'file.txt'));
    expect(request).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
    expect(fixture.componentInstance.sessionId).toBe('id');
  });

  it('rejects another format before creating a replacement session',()=>{
    fixture.componentInstance.replacement={id:'file_123',name:'art.png',version:'12',mimeType:'image/png'};
    select(new File(['hello'],'file.txt',{type:'text/plain'}));
    expect(api.begin).not.toHaveBeenCalled();
  });
  it('requires confirmation and sends the original version in replacement mode',()=>{
    const target={id:'file_123',name:'art.png',version:'12',mimeType:'image/png'};
    fixture.componentInstance.replacement=target;
    const confirm=spyOn(window,'confirm').and.returnValues(false,true);
    api.begin.and.returnValue(new Subject<UploadStart>());
    const file=new File(['hello'],'new.png',{type:'image/png'});
    select(file);expect(api.begin).not.toHaveBeenCalled();
    select(file);expect(confirm).toHaveBeenCalledTimes(2);
    expect(api.begin).toHaveBeenCalledWith('anchor_folder','child_folder',file,target);
  });
  it('checks status rather than replaying an in-progress replacement',()=>{
    const c=fixture.componentInstance;
    c.replacement={id:'file_123',name:'art.png',version:'12',mimeType:'image/png'};
    c.sessionId='session';c.phase='confirm';
    api.status.and.returnValue(of({sessionId:'session',status:'PUBLISHING',expired:false,resumeAllowed:false}));
    c.confirmPublication();
    expect(api.status).toHaveBeenCalledWith('session',true);
    expect(api.publish).not.toHaveBeenCalled();
    expect(c.phase).toBe('confirm');
  });
});
