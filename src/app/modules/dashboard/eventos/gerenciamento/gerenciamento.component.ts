import { Component, OnInit } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { EventListFilters, EventService, ManagedEventSummary, PaginatedResponse, PendingApprovalEvent } from '../../../../core/services/event.service';
import { UserPermissionsService } from '../../../../core/services/user-permissions.service';
import { UserService } from '../../../../core/services/user.service';
import { SeoService } from '../../../../core/services/seo-service.service';

interface ViewState<T> {
  data: T;
  isLoading: boolean;
  hasError: boolean;
}

@Component({
  selector: 'app-gerenciamento',
  standalone: false,
  templateUrl: './gerenciamento.component.html',
  styleUrl: './gerenciamento.component.scss'
})
export class GerenciamentoComponent implements OnInit {
  readonly isAdmin = this.userPermissionsService.isAdmin();
  private readonly loggedUserId = this.userService.getUser()?.id;

  private readonly pendingApprovalStateSubject = new BehaviorSubject<ViewState<PaginatedResponse<PendingApprovalEvent> | null>>(
    this.buildLoadingState(null)
  );
  private readonly partnerEventsStateSubject = new BehaviorSubject<ViewState<PaginatedResponse<ManagedEventSummary> | null>>(
    this.buildLoadingState(null)
  );
  private readonly commonEventsStateSubject = new BehaviorSubject<ViewState<PaginatedResponse<ManagedEventSummary> | null>>(
    this.buildLoadingState(null)
  );

  readonly pendingApprovalState$: Observable<ViewState<PaginatedResponse<PendingApprovalEvent> | null>> = this.pendingApprovalStateSubject.asObservable();
  readonly partnerEventsState$: Observable<ViewState<PaginatedResponse<ManagedEventSummary> | null>> = this.partnerEventsStateSubject.asObservable();
  readonly commonEventsState$: Observable<ViewState<PaginatedResponse<ManagedEventSummary> | null>> = this.commonEventsStateSubject.asObservable();

  pendingPage = 0;
  partnerPage = 0;
  commonPage = 0;
  readonly pageSize = 10;

  constructor(
    private readonly userPermissionsService: UserPermissionsService,
    private readonly eventService: EventService,
    private readonly userService: UserService,
    private readonly seoService: SeoService
  ) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Gerenciamento de Eventos - BraFurries',
      'Gerencie eventos da BraFurries, revise solicitacoes, acompanhe parcerias e administre atividades cadastradas.'
    );
    this.loadPendingApprovalEvents();
    this.loadPartnerEvents();
    this.loadCommonEvents();
  }

  approveEvent(eventId: number): void {
    this.eventService.approveEvent(eventId).subscribe({
      next: () => {
        const pendingState = this.pendingApprovalStateSubject.value.data;
        if (!pendingState) return;

        const pendingEvents = pendingState.items;
        const approvedEvent = pendingEvents.find((event) => event.id === eventId);

        this.pendingApprovalStateSubject.next(
          this.buildLoadedState({
            ...pendingState,
            items: pendingEvents.filter((event) => event.id !== eventId)
          })
        );

        if (approvedEvent) {
          const currentCommonState = this.commonEventsStateSubject.value.data;
          if (currentCommonState) {
            this.commonEventsStateSubject.next(
              this.buildLoadedState({
                ...currentCommonState,
                items: [
                  this.mapPendingApprovalEventToManagedEvent(approvedEvent),
                  ...currentCommonState.items.filter((event) => event.id !== approvedEvent.id)
                ]
              })
            );
          }
        }
      }
    });
  }

  rejectEvent(eventId: number): void {
    this.eventService.rejectEvent(eventId).subscribe({
      next: () => {
        const pendingState = this.pendingApprovalStateSubject.value.data;
        if (!pendingState) return;
        this.pendingApprovalStateSubject.next(
          this.buildLoadedState({
            ...pendingState,
            items: pendingState.items.filter((event) => event.id !== eventId)
          })
        );
      }
    });
  }

  canDeleteEvent(event: ManagedEventSummary): boolean {
    return this.isAdmin || event.host.id === this.loggedUserId;
  }

  canEditEvent(event: ManagedEventSummary): boolean {
    return this.isAdmin
      || event.host.id === this.loggedUserId
      || !!event.permissions?.some((permission) => this.normalizePermission(permission) === 'editevent');
  }

  canManagePartner(event: ManagedEventSummary): boolean {
    return this.isAdmin && event.partnerEvent;
  }

  canPromoteToPartner(event: ManagedEventSummary): boolean {
    return this.isAdmin && !event.partnerEvent;
  }

  formatPartnerEventDate(event: ManagedEventSummary): string {
    const startDate = new Date(event.startingDatetime);
    const endDate = event.endingDatetime ? new Date(event.endingDatetime) : null;

    if (!endDate || this.isSameDate(startDate, endDate)) {
      return this.formatFullDate(startDate);
    }

    if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
      const startDay = `${startDate.getDate()}`.padStart(2, '0');

      return `${startDay} a ${this.formatFullDate(endDate)}`;
    }

    return `${this.formatFullDate(startDate)} a ${this.formatFullDate(endDate)}`;
  }

  toggleManagedEventPartner(event: ManagedEventSummary): void {
    if (!this.isAdmin) {
      return;
    }

    const request$ = event.partnerEvent
      ? this.eventService.removeEventPartner(event.id)
      : this.eventService.addEventPartner(event.id);

    request$.subscribe({
      next: () => {
        const updatedEvent: ManagedEventSummary = {
          ...event,
          partnerEvent: !event.partnerEvent
        };

        const partnerState = this.partnerEventsStateSubject.value.data;
        const commonState = this.commonEventsStateSubject.value.data;

        if (event.partnerEvent) {
          if (partnerState) {
            this.partnerEventsStateSubject.next(
              this.buildLoadedState({
                ...partnerState,
                items: partnerState.items.filter((item) => item.id !== event.id)
              })
            );
          }
          if (commonState) {
            this.commonEventsStateSubject.next(
              this.buildLoadedState({
                ...commonState,
                items: [
                  updatedEvent,
                  ...commonState.items.filter((item) => item.id !== event.id)
                ]
              })
            );
          }
          return;
        }

        if (commonState) {
          this.commonEventsStateSubject.next(
            this.buildLoadedState({
              ...commonState,
              items: commonState.items.filter((item) => item.id !== event.id)
            })
          );
        }
        if (partnerState) {
          this.partnerEventsStateSubject.next(
            this.buildLoadedState({
              ...partnerState,
              items: [
                updatedEvent,
                ...partnerState.items.filter((item) => item.id !== event.id)
              ]
            })
          );
        }
      }
    });
  }

  deleteManagedEvent(event: ManagedEventSummary): void {
    if (!this.canDeleteEvent(event)) {
      return;
    }

    this.eventService.deleteEvent(event.id).subscribe({
      next: () => {
        if (event.partnerEvent) {
          const partnerState = this.partnerEventsStateSubject.value.data;
          if (partnerState) {
            this.partnerEventsStateSubject.next(
              this.buildLoadedState({
                ...partnerState,
                items: partnerState.items.filter((item) => item.id !== event.id)
              })
            );
          }
          return;
        }

        const commonState = this.commonEventsStateSubject.value.data;
        if (commonState) {
          this.commonEventsStateSubject.next(
            this.buildLoadedState({
              ...commonState,
              items: commonState.items.filter((item) => item.id !== event.id)
            })
          );
        }
      }
    });
  }

  changePendingPage(page: number): void {
    this.pendingPage = page;
    this.loadPendingApprovalEvents();
  }

  changePartnerPage(page: number): void {
    this.partnerPage = page;
    this.loadPartnerEvents();
  }

  changeCommonPage(page: number): void {
    this.commonPage = page;
    this.loadCommonEvents();
  }

  private getFilters(page: number): EventListFilters {
    return {
      userId: this.getScopedUserId(),
      page,
      size: this.pageSize
    };
  }

  private loadPendingApprovalEvents(): void {
    this.pendingApprovalStateSubject.next(this.buildLoadingState(this.pendingApprovalStateSubject.value.data));

    this.eventService.getPendingApprovalEvents(this.getFilters(this.pendingPage)).subscribe({
      next: (response) => {
        this.pendingApprovalStateSubject.next(this.buildLoadedState(response));
      },
      error: () => {
        this.pendingApprovalStateSubject.next(this.buildErrorState(null));
      }
    });
  }

  private loadPartnerEvents(): void {
    this.partnerEventsStateSubject.next(this.buildLoadingState(this.partnerEventsStateSubject.value.data));

    this.eventService.getPartnerEvents(this.getFilters(this.partnerPage)).subscribe({
      next: (response) => {
        this.partnerEventsStateSubject.next(this.buildLoadedState(response));
      },
      error: () => {
        this.partnerEventsStateSubject.next(this.buildErrorState(null));
      }
    });
  }

  private loadCommonEvents(): void {
    this.commonEventsStateSubject.next(this.buildLoadingState(this.commonEventsStateSubject.value.data));

    this.eventService.getCommonEvents(this.getFilters(this.commonPage)).subscribe({
      next: (response) => {
        this.commonEventsStateSubject.next(this.buildLoadedState(response));
      },
      error: () => {
        this.commonEventsStateSubject.next(this.buildErrorState(null));
      }
    });
  }

  private getScopedUserId(): number | undefined {
    if (this.isAdmin) {
      return undefined;
    }

    return this.loggedUserId;
  }

  private mapPendingApprovalEventToManagedEvent(event: PendingApprovalEvent): ManagedEventSummary {
    return {
      id: event.id,
      host: {
        id: 0,
        displayName: event.hostDisplayName
      },
      eventName: event.eventName,
      city: event.city,
      localeAbbrev: event.localeAbbrev,
      localeName: event.localeName,
      startingDatetime: event.startingDatetime,
      isEvent: event.isEvent,
      partnerEvent: event.partnerEvent,
      free: event.free,
      eventLogoUrl: event.eventLogoUrl,
      highlights: event.highlights,
      permissions: []
    };
  }

  private buildLoadingState<T>(data: T): ViewState<T> {
    return {
      data,
      isLoading: true,
      hasError: false
    };
  }

  private buildLoadedState<T>(data: T): ViewState<T> {
    return {
      data,
      isLoading: false,
      hasError: false
    };
  }

  private buildErrorState<T>(data: T): ViewState<T> {
    return {
      data,
      isLoading: false,
      hasError: true
    };
  }

  private normalizePermission(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  private isSameDate(firstDate: Date, secondDate: Date): boolean {
    return firstDate.getDate() === secondDate.getDate()
      && firstDate.getMonth() === secondDate.getMonth()
      && firstDate.getFullYear() === secondDate.getFullYear();
  }

  private formatFullDate(date: Date): string {
    const day = `${date.getDate()}`.padStart(2, '0');
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }
}
