import { HttpDownloadProgressEvent, HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { UserService } from './user.service';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AdminService } from './admin.service';
import { environment } from '../../../environments/environment';

describe('AdminService live Coddy stream reconnect', () => {
  let service: AdminService;
  let http: HttpTestingController;
  let session: jasmine.SpyObj<UserService>;

  beforeEach(() => {
    session = jasmine.createSpyObj<UserService>('UserService', ['ensureValidSession']);
    session.ensureValidSession.and.returnValue(of(true));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: UserService, useValue: session }]
    });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));

  it('reconnects with the last received log cursor rather than the initial cursor', fakeAsync(() => {
    const values: string[] = [];
    const subscription = service.watchBotConsole('INFO', 7)
      .subscribe(e => values.push(e.type));
    const base = `${environment.apiBaseUrl}/admin/bot/stream`;
    const first = http.expectOne(`${base}?level=INFO&after=7`);
    const payload = 'event: logs\ndata: {"status":"available","items":[],"nextSequence":9}\n\n';
    first.event({
      type: HttpEventType.DownloadProgress,
      loaded: payload.length, partialText: payload
    } as HttpDownloadProgressEvent);
    expect(values).toEqual(['logs']);
    first.flush('');
    tick(1500);
    const second = http.expectOne(`${base}?level=INFO&after=9`);
    expect(second.request.method).toBe('GET');
    subscription.unsubscribe();
    expect(second.cancelled).toBeTrue();
    expect(session.ensureValidSession).toHaveBeenCalledTimes(2);
  }));
});
