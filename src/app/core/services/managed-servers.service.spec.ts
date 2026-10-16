import { HttpDownloadProgressEvent, HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ManagedServersService } from './managed-servers.service';

describe('ManagedServersService live Backup SSE', () => {
  let service: ManagedServersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ManagedServersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify({ ignoreCancelled: true }));

  it('decodes incremental progress frames without polling extra endpoints', () => {
    const states: string[] = [];
    const subscription = service.watchBackupOperation('77', 'RESTORE', 8)
      .subscribe(operation => states.push(operation.status));

    const request = http.expectOne(
      `${environment.apiBaseUrl}/user/me/guilds/77/backups/live/RESTORE/8`
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.reportProgress).toBeTrue();

    const first = 'event: state\ndata: {"id":8,"status":"RUNNING"}\n';
    request.event({
      type: HttpEventType.DownloadProgress,
      loaded: first.length,
      partialText: first
    } as HttpDownloadProgressEvent);
    expect(states).toEqual([]);

    const second = first + '\n';
    request.event({
      type: HttpEventType.DownloadProgress,
      loaded: second.length,
      partialText: second
    } as HttpDownloadProgressEvent);
    expect(states).toEqual(['RUNNING']);

    const third = second + 'event: state\r\ndata: {"id":8,"status":"PARTIAL"}\r\n\r\n';
    request.event({
      type: HttpEventType.DownloadProgress,
      loaded: third.length,
      partialText: third
    } as HttpDownloadProgressEvent);
    expect(states).toEqual(['RUNNING', 'PARTIAL']);
    subscription.unsubscribe();
  });
});
