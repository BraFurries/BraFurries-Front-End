import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminBotStatus, AdminBotLogItem, AdminBotLogsResponse } from '../../../../../shared/models/api/admin/admin';
import { Subscription, finalize } from 'rxjs';

type LogRequestMode = 'initial' | 'incremental' | 'older';

@Component({
  selector: 'app-admin-bot-details',
  standalone: false,
  templateUrl: './bot-coddy-details.component.html',
  styleUrls: []
})
export class AdminBotDetailsComponent implements OnInit, OnDestroy {
  botStatus: AdminBotStatus | null = null;
  loadingStatus = true;
  errorStatus = '';

  logs: AdminBotLogItem[] = [];
  logsStatus: 'available' | 'unavailable' = 'unavailable';
  oldestLoadedSequence: number | null = null;
  latestLoadedSequence: number | null = null;
  newLogsWhileScrolledUp = 0;
  loadingLogs = true;
  loadingOlder = false;
  loadingIncremental = false;
  hasOlderLogs = false;
  errorLogs = '';
  
  selectedLevel = 'INFO';
  logLevels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];
  selectedLogLimit = 100;
  logLimits = [100, 250, 500, 1000];
  failedLogRequestMode: LogRequestMode | null = null;
  
  autoRefreshEnabled = false;
  private refreshSubscription?: Subscription;
  private logsRequestInFlight = false;
  private logsSubscription?: Subscription;
  private scrollTimeout?: ReturnType<typeof setTimeout>;
  @ViewChild('logContainer') private logContainer?: ElementRef<HTMLElement>;

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.logsSubscription?.unsubscribe();
    clearTimeout(this.scrollTimeout);
  }

  loadData(): void {
    this.loadBotStatus();
    this.loadLogs();
  }

  loadBotStatus(): void {
    this.loadingStatus = true;
    this.errorStatus = '';

    this.adminService.getBotStatus().subscribe({
      next: (status) => {
        this.botStatus = status;
        this.loadingStatus = false;
      },
      error: () => {
        this.errorStatus = 'Não foi possível carregar o status do bot.';
        this.loadingStatus = false;
      }
    });
  }

  loadLogs(): void {
    if (this.logsRequestInFlight) return;
    this.requestLogs('initial');
  }

  refreshLogs(): void {
    if (this.logsRequestInFlight) return;
    if (this.latestLoadedSequence == null) {
      this.loadLogs();
      return;
    }
    this.requestLogs('incremental');
  }

  loadOlderLogs(): void {
    if (this.logsRequestInFlight || this.loadingOlder || !this.hasOlderLogs || this.oldestLoadedSequence == null) return;
    this.requestLogs('older');
  }

  retryLogs(): void {
    if (this.logsRequestInFlight) return;
    this.requestLogs(this.failedLogRequestMode ?? 'initial');
  }

  private requestLogs(mode: LogRequestMode): void {
    const fullLoad = mode === 'initial';
    const after = mode === 'incremental' ? this.latestLoadedSequence : null;
    const before = mode === 'older' ? this.oldestLoadedSequence : null;
    if (fullLoad) this.latestLoadedSequence = null;
    this.logsRequestInFlight = true;
    this.loadingLogs = fullLoad;
    this.loadingOlder = mode === 'older';
    this.loadingIncremental = mode === 'incremental';
    this.errorLogs = '';
    let reloadExpiredCursor = false;
    const scrollElement = mode === 'older' ? this.logContainer?.nativeElement : undefined;
    const previousScrollHeight = scrollElement?.scrollHeight ?? 0;
    const previousScrollTop = scrollElement?.scrollTop ?? 0;
    const request = new Subscription();
    this.logsSubscription = request;
    request.add(this.adminService.getBotLogs(this.selectedLogLimit, this.selectedLevel, after, before).pipe(
      finalize(() => {
        this.logsRequestInFlight = false;
        this.loadingLogs = false;
        this.loadingOlder = false;
        this.loadingIncremental = false;
        if (reloadExpiredCursor && !request.closed) this.loadLogs();
      })
    ).subscribe({
      next: (response) => {
        this.logsStatus = response.status;
        this.errorLogs = '';
        if (response.status !== 'available') {
          if (fullLoad && this.autoRefreshEnabled && !this.refreshSubscription) {
            this.startAutoRefresh();
          }
          return;
        }
        this.failedLogRequestMode = null;
        if (!fullLoad && response.cursorExpired) {
          this.resetLogHistory();
          reloadExpiredCursor = true;
          return;
        }
        const newItems = response.items ?? [];
        if (fullLoad) {
          this.logs = this.limitLogs(this.deduplicate(newItems));
          this.updateLoadedCursors(response.nextSequence ?? null);
          this.hasOlderLogs = this.logs.length < this.maxLoadedLogs && newItems.length >= this.selectedLogLimit;
          this.newLogsWhileScrolledUp = 0;
          this.scheduleScroll(false);
        } else if (mode === 'older') {
          this.logs = this.limitLogs(this.deduplicate([...newItems, ...this.logs]));
          this.updateLoadedCursors(this.latestLoadedSequence);
          this.hasOlderLogs = this.logs.length < this.maxLoadedLogs && newItems.length >= this.selectedLogLimit;
          this.schedulePreserveScroll(previousScrollHeight, previousScrollTop);
        } else {
          this.latestLoadedSequence = response.nextSequence ?? this.latestLoadedSequence;
          if (newItems.length === 0) return;
          const wasNearEnd = this.isNearEnd();
          const previousCount = this.logs.length;
          this.logs = this.limitLogs(this.deduplicate([...this.logs, ...newItems]));
          this.updateLoadedCursors(this.latestLoadedSequence);
          if (this.logs.length >= this.maxLoadedLogs) this.hasOlderLogs = false;
          const addedCount = this.logs.length - previousCount;
          if (wasNearEnd) {
            this.newLogsWhileScrolledUp = 0;
            this.scheduleScroll(true);
          } else {
            this.newLogsWhileScrolledUp += addedCount;
          }
        }
        if (fullLoad && this.autoRefreshEnabled && !this.refreshSubscription) {
          this.startAutoRefresh();
        }
      },
      error: () => {
        if (fullLoad && this.autoRefreshEnabled && !this.refreshSubscription) {
          this.startAutoRefresh();
        }
        this.failedLogRequestMode = mode;
        this.errorLogs = fullLoad
          ? 'Não foi possível carregar ou atualizar os logs.'
          : 'Falha ao atualizar. Exibindo os últimos registros recebidos.';
      }
    }));
  }

  onLevelChange(): void {
    if (this.autoRefreshEnabled) this.stopAutoRefresh();
    this.cancelAndResetLogs();
    this.loadLogs(); // reconnect after the fresh cursor is loaded
  }

  onLogLimitChange(): void {
    if (this.autoRefreshEnabled) this.stopAutoRefresh();
    this.cancelAndResetLogs();
    this.loadLogs();
  }

  private cancelAndResetLogs(): void {
    this.logsSubscription?.unsubscribe();
    clearTimeout(this.scrollTimeout);
    this.resetLogHistory();
  }

  private resetLogHistory(): void {
    this.oldestLoadedSequence = null;
    this.latestLoadedSequence = null;
    this.logs = [];
    this.hasOlderLogs = false;
    this.newLogsWhileScrolledUp = 0;
    this.failedLogRequestMode = null;
  }

  private deduplicate(items: AdminBotLogItem[]): AdminBotLogItem[] {
    const seen = new Set<number>();
    return items.filter(item => {
      if (item.sequence == null) return true;
      if (seen.has(item.sequence)) return false;
      seen.add(item.sequence);
      return true;
    });
  }

  private updateLoadedCursors(nextSequence: number | null): void {
    this.oldestLoadedSequence = this.logs.find(item => item.sequence != null)?.sequence ?? null;
    this.latestLoadedSequence = nextSequence;
  }

  private readonly maxLoadedLogs = 10000;

  private limitLogs(items: AdminBotLogItem[]): AdminBotLogItem[] {
    if (items.length <= this.maxLoadedLogs) return items;
    return items.slice(-this.maxLoadedLogs);
  }

  trackLog(index: number, log: AdminBotLogItem): number { return log.sequence ?? index; }

  onLogScroll(): void { if (this.isNearEnd()) this.newLogsWhileScrolledUp = 0; }

  scrollToNewLogs(): void { this.newLogsWhileScrolledUp = 0; this.scrollToEnd(true); }

  private scheduleScroll(smooth: boolean): void {
    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => this.scrollToEnd(smooth));
  }

  private schedulePreserveScroll(previousHeight: number, previousTop: number): void {
    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      const element = this.logContainer?.nativeElement;
      if (element) element.scrollTop = previousTop + element.scrollHeight - previousHeight;
    });
  }

  private isNearEnd(): boolean {
    const element = this.logContainer?.nativeElement;
    return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  private scrollToEnd(smooth: boolean): void {
    const element = this.logContainer?.nativeElement;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  toggleAutoRefresh(): void {
    this.autoRefreshEnabled = !this.autoRefreshEnabled;
    if (this.autoRefreshEnabled) {
      // An initial history query must establish the replay cursor first.
      if (!this.logsRequestInFlight) this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  private startAutoRefresh(): void {
    if (!this.autoRefreshEnabled || this.refreshSubscription) return;
    this.refreshSubscription = this.adminService.watchBotConsole(
      this.selectedLevel, this.latestLoadedSequence
    ).subscribe({
      next: event => {
        if (!this.autoRefreshEnabled) return;
        if (event.type === 'status') {
          this.botStatus = event.data as AdminBotStatus;
          this.loadingStatus = false;
          this.errorStatus = '';
          return;
        }
        if (event.type !== 'logs') return;
        const response = event.data as AdminBotLogsResponse;
        if (response.cursorExpired) {
          // A restarted Coddy/expired ring requires a fresh history cursor.
          this.stopAutoRefresh();
          this.cancelAndResetLogs();
          this.loadLogs();
          return;
        }
        this.logsStatus = response.status;
        if (response.status !== 'available') return;
        this.errorLogs = '';
        const wasNearEnd = this.isNearEnd();
        const count = this.logs.length;
        this.logs = this.limitLogs(this.deduplicate([
          ...this.logs, ...(response.items ?? [])
        ]));
        this.updateLoadedCursors(response.nextSequence ?? this.latestLoadedSequence);
        if (this.logs.length >= this.maxLoadedLogs) this.hasOlderLogs = false;
        const added = this.logs.length - count;
        if (added > 0) {
          if (wasNearEnd) {
            this.newLogsWhileScrolledUp = 0;
            this.scheduleScroll(true);
          } else {
            this.newLogsWhileScrolledUp += added;
          }
        }
      },
      error: () => {
        this.errorLogs = 'Falha na conexão ao vivo. Atualize manualmente para tentar novamente.';
      }
    });
  }

  private stopAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = undefined;
    }
  }

  formatUptime(seconds?: number | null): string {
    if (seconds == null) {
      return '-';
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m`;
  }

  getLogLevelClass(level: string): string {
    switch (level) {
      case 'DEBUG': return 'text-gray-400';
      case 'INFO': return 'text-blue-400';
      case 'WARNING': return 'text-yellow-400';
      case 'ERROR': return 'text-red-400';
      case 'CRITICAL': return 'text-red-600 font-bold bg-red-100/10 px-1 rounded';
      default: return 'text-gray-300';
    }
  }
}
