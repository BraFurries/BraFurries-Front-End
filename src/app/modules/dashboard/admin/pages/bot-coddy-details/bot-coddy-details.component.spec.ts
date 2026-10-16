import { CommonModule } from '@angular/common';
import { ElementRef } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminBotLogItem, AdminBotLogsResponse, AdminBotStatus } from '../../../../../shared/models/api/admin/admin';
import { AdminBotDetailsComponent } from './bot-coddy-details.component';

describe('AdminBotDetailsComponent log polling', () => {
  let component: AdminBotDetailsComponent;
  let service: jasmine.SpyObj<AdminService>;
  let requests: Subject<AdminBotLogsResponse>[];
  let live: Subject<{ type: string; data: AdminBotStatus | AdminBotLogsResponse }>;

  function entry(sequence: number | null): AdminBotLogItem {
    return { sequence, timestamp: '2026-09-06T12:00:00Z', level: 'INFO', logger: 'test', message: String(sequence) };
  }

  function page(sequences: number[], nextSequence: number, latestSequence = nextSequence): AdminBotLogsResponse {
    return {
      status: 'available', items: sequences.map(entry), totalBuffered: latestSequence,
      limit: 100, oldestSequence: sequences[0] ?? null, latestSequence, nextSequence, cursorExpired: false
    };
  }

  function respond(index: number, response: AdminBotLogsResponse): void {
    requests[index].next(response);
    requests[index].complete();
  }

  beforeEach(() => {
    requests = [];
    service = jasmine.createSpyObj<AdminService>('AdminService', ['getBotLogs', 'getBotStatus', 'watchBotConsole']);
    live = new Subject();
    service.watchBotConsole.and.returnValue(live.asObservable());
    service.getBotLogs.and.callFake(() => {
      const request = new Subject<AdminBotLogsResponse>();
      requests.push(request);
      return request.asObservable();
    });
    service.getBotStatus.and.returnValue(of({ status: 'online' } as any));
    component = new AdminBotDetailsComponent(service);
  });

  afterEach(() => component.ngOnDestroy());

  it('starts with INFO as the minimum severity and exposes only severity levels', () => {
    expect(component.selectedLevel).toBe('INFO');
    expect(component.logLevels).toEqual(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']);
    expect(component.selectedLogLimit).toBe(100);
    expect(component.logLimits).toEqual([100, 250, 500, 1000]);
    component.loadLogs();
    expect(service.getBotLogs).toHaveBeenCalledWith(100, 'INFO', null, null);
  });

  it('uses nextSequence for the initial load and every incremental page, never the head', () => {
    component.loadLogs();
    respond(0, page([1], 1, 4));
    expect(component.latestLoadedSequence).toBe(1);
    component.refreshLogs();
    expect(service.getBotLogs).toHaveBeenCalledWith(100, 'INFO', 1, null);
    respond(1, page([2, 3], 3, 4));
    expect(component.latestLoadedSequence).toBe(3);
    component.refreshLogs();
    expect(service.getBotLogs).toHaveBeenCalledWith(100, 'INFO', 3, null);
    respond(2, page([4], 4));
    expect(component.logs.map(log => log.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('progresses past nonmatching logs without appending entries', () => {
    component.loadLogs();
    respond(0, page([], 0));
    component.refreshLogs();
    expect(service.getBotLogs).toHaveBeenCalledWith(100, 'INFO', 0, null);
    respond(1, page([], 17));
    expect(component.latestLoadedSequence).toBe(17);
    expect(component.logs).toEqual([]);
  });

  it('polls the first record after an empty initial buffer', () => {
    component.loadLogs();
    respond(0, page([], 0));
    component.refreshLogs();
    respond(1, page([1], 1));
    expect(component.logs.map(log => log.sequence)).toEqual([1]);
    expect(component.latestLoadedSequence).toBe(1);
  });

  it('reloads without a cursor when the process restarts or the ring buffer expires', () => {
    component.loadLogs();
    respond(0, page([5832], 5832));
    component.refreshLogs();
    respond(1, { ...page([], 3), cursorExpired: true });
    expect(component.latestLoadedSequence).toBeNull();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'INFO', null, null]);
    respond(2, page([1, 2, 3], 3));
    expect(component.logs.map(log => log.sequence)).toEqual([1, 2, 3]);
    expect(component.latestLoadedSequence).toBe(3);
  });

  it('streams both status and new logs only while Auto-refresh is enabled', fakeAsync(() => {
    component.loadLogs();
    respond(0, page([1], 1));
    component.toggleAutoRefresh();
    expect(service.watchBotConsole).toHaveBeenCalledOnceWith('INFO', 1);
    const liveStatus = { status: 'online', pingMs: 55, cpuUsagePercent: 3.4 } as AdminBotStatus;
    live.next({ type: 'status', data: liveStatus });
    live.next({ type: 'logs', data: page([2, 3], 3) });
    expect(component.botStatus?.pingMs).toBe(55);
    expect(component.logs.map(x => x.sequence)).toEqual([1, 2, 3]);
    tick(15000);
    expect(requests.length).toBe(1);
    expect(service.getBotStatus).not.toHaveBeenCalled();

    component.toggleAutoRefresh();
    expect(live.observed).toBeFalse();
    live.next({ type: 'logs', data: page([4], 4) });
    expect(component.logs.map(x => x.sequence)).toEqual([1, 2, 3]);
    component.ngOnDestroy();
    tick();
  }));

  it('waits for the initial history cursor before opening the live stream', () => {
    component.loadLogs();
    component.toggleAutoRefresh();
    expect(service.watchBotConsole).not.toHaveBeenCalled();
    respond(0, page([20], 20));
    expect(service.watchBotConsole).toHaveBeenCalledOnceWith('INFO', 20);
  });

  it('reconnects with a fresh history cursor after changing severity', () => {
    component.loadLogs();
    respond(0, page([1], 1));
    component.toggleAutoRefresh();
    component.selectedLevel = 'WARNING';
    component.onLevelChange();
    expect(live.observed).toBeFalse();
    expect(service.getBotLogs).toHaveBeenCalledWith(100, 'WARNING', null, null);
    respond(1, page([30], 30));
    expect(service.watchBotConsole).toHaveBeenCalledWith('WARNING', 30);
  });

  it('retries an initial failure with a full load', () => {
    component.loadLogs();
    requests[0].error(new Error('offline'));
    expect(component.loadingLogs).toBeFalse();
    expect(component.failedLogRequestMode).toBe('initial');
    component.retryLogs();
    expect(requests.length).toBe(2);
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'INFO', null, null]);
    respond(1, page([1], 1));
    expect(component.failedLogRequestMode).toBeNull();
  });

  it('retries an older-page failure without replacing loaded history', () => {
    component.loadLogs();
    respond(0, page(Array.from({ length: 100 }, (_, index) => index + 101), 200));
    component.loadOlderLogs();
    requests[1].error(new Error('temporary'));

    expect(component.logs.length).toBe(100);
    expect(component.failedLogRequestMode).toBe('older');
    component.retryLogs();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'INFO', null, 101]);
    respond(2, page([99, 100], 200));

    expect(component.logs.slice(0, 4).map(log => log.sequence)).toEqual([99, 100, 101, 102]);
    expect(component.logs.length).toBe(102);
    expect(component.failedLogRequestMode).toBeNull();
  });

  it('retries an incremental failure from the current polling cursor', () => {
    component.loadLogs();
    respond(0, page([1, 2], 2));
    component.refreshLogs();
    requests[1].error(new Error('temporary'));

    expect(component.logs.map(log => log.sequence)).toEqual([1, 2]);
    expect(component.failedLogRequestMode).toBe('incremental');
    component.retryLogs();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'INFO', 2, null]);
    respond(2, page([3], 3));

    expect(component.logs.map(log => log.sequence)).toEqual([1, 2, 3]);
    expect(component.failedLogRequestMode).toBeNull();
  });

  it('preserves the cursor and records during temporary incremental unavailability', () => {
    component.loadLogs();
    respond(0, page([1], 1));
    component.refreshLogs();
    respond(1, { ...page([], 0), status: 'unavailable', nextSequence: null });
    expect(component.latestLoadedSequence).toBe(1);
    expect(component.logs.map(log => log.sequence)).toEqual([1]);
    component.refreshLogs();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'INFO', 1, null]);
    respond(2, page([2], 2));
    expect(component.logs.map(log => log.sequence)).toEqual([1, 2]);
  });

  it('cancels an old filter request and loads the new filter without its cursor', () => {
    component.selectedLevel = 'WARNING';
    component.loadLogs();
    respond(0, page([7], 7));
    component.refreshLogs();
    component.selectedLevel = 'ERROR';
    component.onLevelChange();
    expect(requests[1].observed).toBeFalse();
    expect(component.latestLoadedSequence).toBeNull();
    expect(component.logs).toEqual([]);
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'ERROR', null, null]);
    requests[1].next(page([8], 8));
    expect(component.logs).toEqual([]);
    component.refreshLogs(); // New filter is still in flight.
    expect(requests.length).toBe(3);
    respond(2, { ...page([9], 9), items: [{ ...entry(9), level: 'ERROR' }] });
    expect(component.logs[0].level).toBe('ERROR');
    expect(component.latestLoadedSequence).toBe(9);
    component.refreshLogs();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'ERROR', 9, null]);
  });

  it('resets records and cursor when switching from INFO to DEBUG', () => {
    component.loadLogs();
    requests[0].error(new Error('temporary'));
    expect(component.failedLogRequestMode).toBe('initial');

    component.selectedLevel = 'DEBUG';
    component.onLevelChange();

    expect(component.logs).toEqual([]);
    expect(component.latestLoadedSequence).toBeNull();
    expect(component.failedLogRequestMode).toBeNull();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'DEBUG', null, null]);
  });

  it('resets records and cursor when switching from DEBUG to INFO', () => {
    component.selectedLevel = 'DEBUG';
    component.loadLogs();
    respond(0, page([1], 1));

    component.selectedLevel = 'INFO';
    component.onLevelChange();

    expect(component.logs).toEqual([]);
    expect(component.latestLoadedSequence).toBeNull();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'INFO', null, null]);
  });

  it('reloads with 1000 while preserving the selected severity', () => {
    component.selectedLevel = 'ERROR';
    component.loadLogs();
    requests[0].error(new Error('temporary'));
    expect(component.failedLogRequestMode).toBe('initial');

    component.selectedLogLimit = 1000;
    component.onLogLimitChange();

    expect(component.selectedLevel).toBe('ERROR');
    expect(component.logs).toEqual([]);
    expect(component.failedLogRequestMode).toBeNull();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([1000, 'ERROR', null, null]);
  });

  it('loads older records before the first sequence and prepends without duplicates', () => {
    component.loadLogs();
    respond(0, page(Array.from({ length: 100 }, (_, index) => index + 101), 200));
    expect(component.oldestLoadedSequence).toBe(101);
    expect(component.hasOlderLogs).toBeTrue();

    component.loadOlderLogs();
    expect(component.loadingOlder).toBeTrue();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'INFO', null, 101]);
    respond(1, page([99, 100, 101], 200));

    expect(component.logs.slice(0, 4).map(log => log.sequence)).toEqual([99, 100, 101, 102]);
    expect(component.logs.filter(log => log.sequence === 101).length).toBe(1);
    expect(component.oldestLoadedSequence).toBe(99);
    expect(component.latestLoadedSequence).toBe(200);
    expect(component.hasOlderLogs).toBeFalse();
  });

  it('accumulates three batches of 1000 without truncating loaded history', () => {
    component.selectedLogLimit = 1000;
    component.loadLogs();
    respond(0, page(Array.from({ length: 1000 }, (_, index) => index + 2001), 3000));
    component.loadOlderLogs();
    respond(1, page(Array.from({ length: 1000 }, (_, index) => index + 1001), 3000));
    component.loadOlderLogs();
    respond(2, page(Array.from({ length: 1000 }, (_, index) => index + 1), 3000));

    expect(component.logs.length).toBe(3000);
    expect(component.logs[0].sequence).toBe(1);
    expect(component.logs[2999].sequence).toBe(3000);
  });

  it('reloads safely when the history cursor has expired', () => {
    component.loadLogs();
    respond(0, page(Array.from({ length: 100 }, (_, index) => index + 101), 200));
    component.loadOlderLogs();
    respond(1, { ...page([], 200), cursorExpired: true });

    expect(component.logs).toEqual([]);
    expect(component.oldestLoadedSequence).toBeNull();
    expect(component.latestLoadedSequence).toBeNull();
    expect(service.getBotLogs.calls.mostRecent().args).toEqual([100, 'INFO', null, null]);
  });

  it('does not duplicate records returned again by polling', () => {
    component.loadLogs();
    respond(0, page([1, 2], 2));
    component.refreshLogs();
    respond(1, page([2, 3], 3));
    expect(component.logs.map(log => log.sequence)).toEqual([1, 2, 3]);
  });

  it('keeps only the 10000 newest records when polling exceeds local retention', () => {
    component.logs = Array.from({ length: 9990 }, (_, index) => entry(index + 1));
    component.oldestLoadedSequence = 1;
    component.latestLoadedSequence = 9990;
    component.refreshLogs();
    respond(0, page(Array.from({ length: 20 }, (_, index) => index + 9991), 10010));

    expect(component.logs.length).toBe(10000);
    expect(component.logs[0].sequence).toBe(11);
    expect(component.logs[9999].sequence).toBe(10010);
    expect(component.oldestLoadedSequence).toBe(11);
    expect(component.latestLoadedSequence).toBe(10010);
  });

  it('deduplicates while trimming incremental logs to local retention', () => {
    component.logs = Array.from({ length: 10000 }, (_, index) => entry(index + 1));
    component.oldestLoadedSequence = 1;
    component.latestLoadedSequence = 10000;
    component.refreshLogs();
    respond(0, page([10000, 10001], 10001));

    expect(component.logs.length).toBe(10000);
    expect(component.logs[0].sequence).toBe(2);
    expect(component.logs[9999].sequence).toBe(10001);
    expect(component.logs.filter(log => log.sequence === 10000).length).toBe(1);
  });

  it('caps prepended history at 10000 while retaining a contiguous older window', () => {
    component.selectedLogLimit = 1000;
    component.logs = Array.from({ length: 9500 }, (_, index) => entry(index + 1001));
    component.oldestLoadedSequence = 1001;
    component.latestLoadedSequence = 10500;
    component.hasOlderLogs = true;
    component.loadOlderLogs();
    respond(0, page(Array.from({ length: 1000 }, (_, index) => index + 1), 10500));

    expect(component.logs.length).toBe(10000);
    expect(component.logs[0].sequence).toBe(501);
    expect(component.logs[9999].sequence).toBe(10500);
    expect(component.oldestLoadedSequence).toBe(501);
    expect(component.latestLoadedSequence).toBe(10500);
    expect(component.hasOlderLogs).toBeFalse();
  });

  it('stops older history after a partial filtered batch without another request', () => {
    component.loadLogs();
    respond(0, page(Array.from({ length: 100 }, (_, index) => index + 101), 200));
    component.loadOlderLogs();
    respond(1, page([99, 100], 200));

    expect(component.hasOlderLogs).toBeFalse();
    component.loadOlderLogs();
    expect(requests.length).toBe(2);
  });

  it('cancels an initial load on filter change and cleans up the replacement on destroy', () => {
    component.loadLogs();
    component.selectedLevel = 'ERROR';
    component.onLevelChange();
    expect(requests[0].observed).toBeFalse();
    expect(requests[1].observed).toBeTrue();
    component.ngOnDestroy();
    expect(requests[1].observed).toBeFalse();
  });

  it('uses a stable index fallback for legacy entries', () => {
    expect(component.trackLog(4, entry(null))).toBe(4);
    expect(component.trackLog(4, entry(0))).toBe(0);
    expect(component.trackLog(4, entry(12))).toBe(12);
  });

  it('keeps the reader position and exposes the new logs button until requested', fakeAsync(() => {
    const element = { scrollHeight: 1000, scrollTop: 0, clientHeight: 100, scrollTo: jasmine.createSpy('scrollTo') };
    (component as any).logContainer = new ElementRef(element);
    component.latestLoadedSequence = 1;
    component.logs = [entry(1)];
    component.refreshLogs();
    respond(0, page([2, 3], 3));
    tick();
    expect(element.scrollTo).not.toHaveBeenCalled();
    expect(component.newLogsWhileScrolledUp).toBe(2);
    component.scrollToNewLogs();
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
    expect(component.newLogsWhileScrolledUp).toBe(0);
  }));

  it('follows incremental logs after rendering when the reader is near the end', fakeAsync(() => {
    const element = { scrollHeight: 1000, scrollTop: 900, clientHeight: 100, scrollTo: jasmine.createSpy('scrollTo') };
    (component as any).logContainer = new ElementRef(element);
    component.latestLoadedSequence = 1;
    component.refreshLogs();
    respond(0, page([2], 2));
    expect(element.scrollTo).not.toHaveBeenCalled();
    element.scrollHeight = 1100;
    tick();
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1100, behavior: 'smooth' });
  }));

  it('scrolls the initial load only after Angular has rendered its rows', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule], declarations: [AdminBotDetailsComponent],
      providers: [{ provide: AdminService, useValue: service }]
    }).overrideComponent(AdminBotDetailsComponent, {
      set: { template: '<div #logContainer><div class="log-row" *ngFor="let log of logs">{{log.message}}</div></div>' }
    });
    const fixture = TestBed.createComponent(AdminBotDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const element = fixture.nativeElement.firstElementChild as HTMLElement;
    let rowsAtScroll = 0;
    const scroll = spyOn(element, 'scrollTo').and.callFake(() => {
      rowsAtScroll = element.querySelectorAll('.log-row').length;
    });
    respond(0, page([1, 2], 2));
    expect(scroll).not.toHaveBeenCalled();
    fixture.detectChanges();
    tick();
    expect(rowsAtScroll).toBe(2);
    fixture.destroy();
  }));
});
