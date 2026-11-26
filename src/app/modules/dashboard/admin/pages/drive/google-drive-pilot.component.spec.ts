import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { UserService } from '../../../../../core/services/user.service';
import { environment } from '../../../../../../environments/environment';
import { GoogleDrivePilotComponent, safeGoogleDocumentUrl } from './google-drive-pilot.component';

describe('GoogleDrivePilotComponent',()=>{
  let fixture:ComponentFixture<GoogleDrivePilotComponent>;
  let http:HttpTestingController;
  let user:BehaviorSubject<{id:number}|null>;
  const url=environment.apiBaseUrl+'/user/me/platform-drive/pilot';
  const config={enabled:true,linked:true,clientId:'pilot.apps.googleusercontent.com',
    apiKey:'placeholder_browser_key_12345',projectNumber:'123456789',
    folderId:'private_test_folder',googleSubject:'linked-subject',googleEmail:'owner@example.invalid'};

  beforeEach(async()=>{
    user=new BehaviorSubject<{id:number}|null>({id:7});
    await TestBed.configureTestingModule({imports:[GoogleDrivePilotComponent],
      providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([]),
        {provide:UserService,useValue:{user$:user.asObservable()}}]}).compileComponents();
    http=TestBed.inject(HttpTestingController);
    fixture=TestBed.createComponent(GoogleDrivePilotComponent);
    fixture.detectChanges();
  });
  afterEach(()=>{fixture.destroy();http.verify();});

  it('never shows a Picker or private folder on a forbidden response',()=>{
    http.expectOne(url).flush({}, {status:403,statusText:'Forbidden'});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Piloto restrito');
    expect(fixture.nativeElement.querySelector('a[href*="drive.google.com"]')).toBeNull();
  });
  it('shows the linked account and private folder without loading Google scripts automatically',()=>{
    http.expectOne(url).flush(config);
    fixture.detectChanges();
    http.expectOne(environment.apiBaseUrl+'/user/me/platform-drive/connection')
      .flush({configured:true,connected:false,accountEmail:'owner@example.invalid',reconnectRequired:false});
    expect(fixture.nativeElement.textContent).toContain('owner@example.invalid');
    expect(fixture.nativeElement.querySelector('a[href*="drive.google.com"]').getAttribute('href'))
      .toBe('https://drive.google.com/drive/folders/private_test_folder');
    expect(fixture.componentInstance.readyToAuthorize).toBeFalse();
  });
  it('clears private links and selection on account switch',()=>{
    http.expectOne(url).flush(config);
    fixture.componentInstance.selected={name:'Private',url:'https://docs.google.com/document/d/test/edit'};
    user.next({id:9});
    fixture.detectChanges();
    expect(fixture.componentInstance.selected).toBeNull();
    expect(fixture.componentInstance.config).toBeNull();
    http.expectOne(url).flush({}, {status:403,statusText:'Forbidden'});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('owner@example.invalid');
  });
  it('rejects unsafe links returned by a picker callback',()=>{
    http.expectOne(url).flush({enabled:false,linked:false});
    expect(safeGoogleDocumentUrl('javascript:alert(1)')).toBeNull();
    expect(safeGoogleDocumentUrl('https://docs.google.com.example.invalid/test')).toBeNull();
    expect(safeGoogleDocumentUrl('https://docs.google.com/document/d/test/edit'))
      .toBe('https://docs.google.com/document/d/test/edit');
  });
});
