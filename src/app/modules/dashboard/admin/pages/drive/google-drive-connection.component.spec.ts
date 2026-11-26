import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../../../environments/environment';
import { GoogleDrivePickerBrowser, PickerCallbacks } from './google-drive-picker-browser';
import { GoogleDriveConnectionComponent, readDriveCallback, safeDriveAuthorizationUrl } from './google-drive-connection.component';

describe('GoogleDriveConnectionComponent',()=>{
  let browser:jasmine.SpyObj<GoogleDrivePickerBrowser>;
  let fixture:ComponentFixture<GoogleDriveConnectionComponent>;
  let http:HttpTestingController;
  const url=environment.apiBaseUrl+'/user/me/platform-drive';
  const connected={configured:true,connected:true,accountEmail:'institution@example.invalid',reconnectRequired:false};

  const pickerConfig={clientId:'fixture.apps.googleusercontent.com',apiKey:'fixture_key',projectNumber:'123',folderId:'fixture_folder',googleSubject:'institution-subject',googleEmail:'institution@example.invalid'};
  beforeEach(async()=>{
    browser=jasmine.createSpyObj('GoogleDrivePickerBrowser',['prepare','open']);
    browser.prepare.and.resolveTo();browser.open.and.returnValue(()=>{});
    await TestBed.configureTestingModule({imports:[GoogleDriveConnectionComponent],
      providers:[provideHttpClient(),provideHttpClientTesting(),{provide:GoogleDrivePickerBrowser,useValue:browser}]}).compileComponents();
    http=TestBed.inject(HttpTestingController);
    fixture=TestBed.createComponent(GoogleDriveConnectionComponent);
  });
  afterEach(()=>{fixture.destroy();http.verify();});

  it('rejects arbitrary authorization redirects and malformed callbacks',()=>{
    expect(safeDriveAuthorizationUrl('https://accounts.google.com.example.invalid/o/oauth2/v2/auth')).toBeNull();
    expect(safeDriveAuthorizationUrl('https://accounts.google.com/o/oauth2/v2/auth?state=fixture')).not.toBeNull();
    expect(readDriveCallback('#drive_state=invalid&drive_code=fixture')).toBeNull();
    expect(readDriveCallback('#drive_state='+'a'.repeat(43)+'&drive_code=fixture%2Fcode'))
      .toEqual({state:'a'.repeat(43),code:'fixture/code'});
  });

  it('shows a root authorization warning rather than claiming access',()=>{
    fixture.detectChanges();
    http.expectOne(url+'/connection').flush(connected);
    http.expectOne(url+'/connection/root-picker').flush(pickerConfig);
    fixture.componentInstance.checkRoot();
    http.expectOne(url+'/connection/check-root').flush({status:'NOT_AUTHORIZED'});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('A pasta não está autorizada');
  });

  it('requires confirmation before removing the local authorization',()=>{
    fixture.detectChanges();
    http.expectOne(url+'/connection').flush(connected);
    http.expectOne(url+'/connection/root-picker').flush(pickerConfig);
    fixture.componentInstance.disconnect();
    http.expectNone(url+'/connection');
    fixture.componentInstance.confirmDisconnect=true;
    fixture.componentInstance.disconnect();
    const request=http.expectOne(url+'/connection');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    http.expectOne(url+'/connection').flush({...connected,connected:false});
    expect(fixture.componentInstance.status?.connected).toBeFalse();
  });

  it('uses institutional identity and verifies the exact selected folder with the API',async()=>{
    fixture.detectChanges();
    http.expectOne(url+'/connection').flush(connected);
    http.expectOne(url+'/connection/root-picker').flush(pickerConfig);
    await fixture.whenStable();
    fixture.componentInstance.authorizeRoot();
    expect(browser.open).toHaveBeenCalledWith(pickerConfig,'root',jasmine.any(Object));
    const callbacks=browser.open.calls.mostRecent().args[2] as PickerCallbacks;
    callbacks.picked({id:'other_folder',mimeType:'application/vnd.google-apps.folder'});
    http.expectNone(url+'/connection/check-root');
    expect(fixture.componentInstance.rootError).toContain('pasta raiz');
    fixture.componentInstance.authorizeRoot();
    browser.open.calls.mostRecent().args[2].picked({id:'fixture_folder',mimeType:'application/vnd.google-apps.folder'});
    const check=http.expectOne(url+'/connection/check-root');
    expect(check.request.body).toEqual({});
    check.flush({status:'ACCESSIBLE'});
    expect(fixture.componentInstance.rootStatus).toBe('ACCESSIBLE');
  });

  it('registers only a subfolder and displays the server-verified registry',async()=>{
    fixture.detectChanges();
    http.expectOne(url+'/connection').flush(connected);
    http.expectOne(url+'/connection/root-picker').flush(pickerConfig);
    await fixture.whenStable();
    fixture.componentInstance.authorizeFolder();
    expect(browser.open).toHaveBeenCalledWith(pickerConfig,'managed-folder',jasmine.any(Object));
    browser.open.calls.mostRecent().args[2].picked({id:'fixture_folder',mimeType:'application/vnd.google-apps.folder'});
    http.expectNone(url+'/folders');
    fixture.componentInstance.authorizeFolder();
    browser.open.calls.mostRecent().args[2].picked({id:'child_folder',mimeType:'application/vnd.google-apps.folder'});
    const req=http.expectOne(url+'/folders');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({folderId:'child_folder'});
    const folder={folderId:'child_folder',parentFolderId:'fixture_folder',name:'Eventos',verifiedAt:'2026-11-26T22:00:00Z'};
    req.flush(folder);
    http.expectOne(url+'/folders').flush([folder]);
    expect(fixture.componentInstance.folders).toEqual([folder]);
  });
});
