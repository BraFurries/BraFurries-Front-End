import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../../../environments/environment';
import { GoogleDriveConnectionComponent, readDriveCallback, safeDriveAuthorizationUrl } from './google-drive-connection.component';

describe('GoogleDriveConnectionComponent',()=>{
  let fixture:ComponentFixture<GoogleDriveConnectionComponent>;
  let http:HttpTestingController;
  const url=environment.apiBaseUrl+'/user/me/platform-drive';
  const connected={configured:true,connected:true,accountEmail:'institution@example.invalid',reconnectRequired:false};

  beforeEach(async()=>{
    await TestBed.configureTestingModule({imports:[GoogleDriveConnectionComponent],
      providers:[provideHttpClient(),provideHttpClientTesting()]}).compileComponents();
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
    fixture.componentInstance.checkRoot();
    http.expectOne(url+'/connection/check-root').flush({status:'NOT_AUTHORIZED'});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('A pasta não está autorizada');
  });

  it('requires confirmation before removing the local authorization',()=>{
    fixture.detectChanges();
    http.expectOne(url+'/connection').flush(connected);
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
});
