import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../../../environments/environment';
import { GoogleDriveFolderAccessComponent } from './google-drive-folder-access.component';

describe('GoogleDriveFolderAccessComponent',()=>{
  let fixture:ComponentFixture<GoogleDriveFolderAccessComponent>;
  let http:HttpTestingController;
  const root=environment.apiBaseUrl+'/user/me';
  const endpoint=root+'/platform-drive/folders/child_folder/access';
  beforeEach(async()=>{
    await TestBed.configureTestingModule({imports:[GoogleDriveFolderAccessComponent],
      providers:[provideHttpClient(),provideHttpClientTesting()]}).compileComponents();
    fixture=TestBed.createComponent(GoogleDriveFolderAccessComponent);
    http=TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('folderId','child_folder');
    fixture.detectChanges();
    http.expectOne(endpoint).flush([{principalType:'ROLE',principalId:5,permission:'VIEW'}]);
    http.expectOne(root+'/platform-access/people').flush([{userId:8,name:'Pessoa'}]);
    http.expectOne(root+'/platform-access/team-roles').flush([{roleId:5,name:'Marketing',active:true}]);
  });
  afterEach(()=>{fixture.destroy();http.verify();});

  it('saves one atomic replacement and keeps external access independent',()=>{
    const c=fixture.componentInstance;
    c.select('ROLE:5');
    c.toggle('EXTERNAL_EDIT',true);
    http.expectNone(endpoint+'/ROLE/5');
    c.select('PERSON:8');
    expect(c.selected?.key).toBe('ROLE:5');
    c.save();
    const req=http.expectOne(endpoint+'/ROLE/5');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({expected:['VIEW'],desired:['VIEW','EXTERNAL_EDIT']});
    req.flush(null);
    expect(c.dirty).toBeFalse();
    c.select('PERSON:8');
    expect(c.draft.size).toBe(0);
  });

  it('retains draft on conflict and can discard it without writing',()=>{
    const c=fixture.componentInstance;
    c.select('ROLE:5');
    c.toggle('DOWNLOAD',true);
    c.save();
    http.expectOne(endpoint+'/ROLE/5').flush({}, {status:409,statusText:'Conflict'});
    expect(c.dirty).toBeTrue();
    expect(c.error).toContain('recarregue');
    c.discard();
    expect(c.dirty).toBeFalse();
    http.expectNone(endpoint+'/ROLE/5');
  });
});
