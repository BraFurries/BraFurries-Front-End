import { HttpDownloadProgressEvent, HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { UserService } from './user.service';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpEventStreamService } from './http-event-stream.service';

describe('HttpEventStreamService', () => {
  let service: HttpEventStreamService;
  let http: HttpTestingController;
  let session: jasmine.SpyObj<UserService>;

  beforeEach(() => {
    session = jasmine.createSpyObj<UserService>('UserService', ['ensureValidSession', 'getAccessToken']);
    session.ensureValidSession.and.returnValue(of(true));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: UserService, useValue: session }] });
    service = TestBed.inject(HttpEventStreamService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));

  it('does not connect or retry when the administrative session cannot be refreshed', fakeAsync(() => {
    session.ensureValidSession.and.returnValue(of(false));
    let failed = false;
    service.watch('http://example.test/stream').subscribe({
      error: () => { failed = true; }
    });
    expect(failed).toBeTrue();
    expect(session.ensureValidSession).toHaveBeenCalledTimes(1);
    http.expectNone('http://example.test/stream');
    tick(35000);
    expect(session.ensureValidSession).toHaveBeenCalledTimes(1);
  }));

  it('retries a temporary refresh outage and resumes with the recovered session', fakeAsync(() => {
    session.ensureValidSession.and.returnValues(of(false), of(true));
    session.getAccessToken.and.returnValue('expired-access-but-refresh-retained');

    const subscription = service.watch('http://example.test/stream').subscribe();
    expect(session.ensureValidSession).toHaveBeenCalledTimes(1);
    http.expectNone('http://example.test/stream');

    tick(1000);
    expect(session.ensureValidSession).toHaveBeenCalledTimes(2);
    const request = http.expectOne('http://example.test/stream');
    subscription.unsubscribe();
    expect(request.cancelled).toBeTrue();
  }));

  it('validates the session again on an actual reconnect', fakeAsync(() => {
    const subscription = service.watch('http://example.test/stream').subscribe();
    const first = http.expectOne('http://example.test/stream');
    expect(session.ensureValidSession).toHaveBeenCalledTimes(1);
    first.flush('');
    tick(1500);
    const second = http.expectOne('http://example.test/stream');
    expect(session.ensureValidSession).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
    expect(second.cancelled).toBeTrue();
  }));

  it('decodes incremental LF and CRLF frames, and cancels on unsubscribe', () => {
    const events: string[] = [];
    const subscription = service.watch<{ status: string }>('http://example.test/stream')
      .subscribe(x => events.push(x.type + ':' + x.data.status));
    const request = http.expectOne('http://example.test/stream');
    const first = 'event: status\ndata: {"status":"online"}\n';
    request.event({
      type: HttpEventType.DownloadProgress, loaded: first.length, partialText: first
    } as HttpDownloadProgressEvent);
    expect(events).toEqual([]);
    const second = first + '\n';
    request.event({
      type: HttpEventType.DownloadProgress, loaded: second.length, partialText: second
    } as HttpDownloadProgressEvent);
    expect(events).toEqual(['status:online']);
    const third = second + 'event: logs\r\ndata: {"status":"available"}\r\n\r\n';
    request.event({
      type: HttpEventType.DownloadProgress, loaded: third.length, partialText: third
    } as HttpDownloadProgressEvent);
    expect(events).toEqual(['status:online', 'logs:available']);
    subscription.unsubscribe();
    expect(request.cancelled).toBeTrue();
  });
});
