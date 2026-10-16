import { Component, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import { AdminEventMinidash, EventListFilters, EventMinidash, EventService, ManagedEventSummary, PaginatedResponse } from '../../../../core/services/event.service';
import { UserPermissionsService } from '../../../../core/services/user-permissions.service';
import { SeoService } from '../../../../core/services/seo-service.service';

interface MinidashItem {
    value: number;
    label: string;
    bgClass: string;
    textClass: string;
    labelClass: string;
}

interface ViewState<T> {
    data: T;
    isLoading: boolean;
    hasError: boolean;
}

type CommonEventFilter = 'all' | 'week' | 'month';

@Component({
    selector: 'app-geral',
    standalone: false,
    templateUrl: './geral.component.html',
    styleUrl: './geral.component.scss'
})
export class GeralComponent implements OnInit {
    readonly isAdmin = this.userPermissionsService.isAdmin();
    minidashItems: MinidashItem[] = this.buildMinidashItems();
    activeCommonFilter: CommonEventFilter = 'all';
    isInitialLoad = true;

    private readonly partnerEventsStateSubject = new BehaviorSubject<ViewState<ManagedEventSummary[]>>(
        this.buildLoadingState([])
    );
    private readonly commonEventsStateSubject = new BehaviorSubject<ViewState<PaginatedResponse<ManagedEventSummary> | null>>(
        this.buildLoadingState(null)
    );

    readonly partnerEventsState$: Observable<ViewState<ManagedEventSummary[]>> = this.partnerEventsStateSubject.asObservable();
    readonly commonEventsState$: Observable<ViewState<PaginatedResponse<ManagedEventSummary> | null>> = this.commonEventsStateSubject.asObservable();

    commonPage = 0;
    readonly commonPageSize = 6;

    get isPageLoading$(): Observable<boolean> {
        return combineLatest([
            this.partnerEventsState$,
            this.commonEventsState$
        ]).pipe(
            map(([partnerState, commonState]) => {
                if (this.isInitialLoad) {
                    return partnerState.isLoading || commonState.isLoading;
                }
                return false;
            })
        );
    }

    constructor(
        private readonly eventService: EventService,
        private readonly userPermissionsService: UserPermissionsService,
        private readonly seoService: SeoService
    ) { }

    ngOnInit(): void {
        this.seoService.updateMetaTags(
            'Eventos - BraFurries',
            'Explore eventos e encontros furry cadastrados na BraFurries, acompanhe atividades parceiras e participe da comunidade.'
        );
        this.loadMinidash();
        this.loadPartnerEvents();
        this.loadCommonEvents();

        combineLatest([
            this.partnerEventsState$,
            this.commonEventsState$
        ]).subscribe(([partnerState, commonState]) => {
            if (!partnerState.isLoading && !commonState.isLoading) {
                this.isInitialLoad = false;
            }
        });
    }

    setCommonFilter(filter: CommonEventFilter): void {
        if (this.activeCommonFilter === filter) {
            return;
        }

        this.activeCommonFilter = filter;
        this.commonPage = 0;
        this.loadCommonEvents();
    }

    changeCommonPage(newPage: number): void {
        this.commonPage = newPage;
        this.loadCommonEvents();
    }

    getFilterButtonClass(filter: CommonEventFilter): string {
        return this.activeCommonFilter === filter
            ? 'bg-white text-braDark shadow-sm'
            : 'text-gray-500 hover:text-braDark';
    }

    getEventTypeLabel(event: ManagedEventSummary): string {
        return event.isEvent ? 'Evento' : 'Meet';
    }

    getEventLocation(event: ManagedEventSummary): string {
        return `${event.city}, ${event.localeAbbrev}`;
    }

    getEventActionLabel(event: ManagedEventSummary): string {
        if (event.partnerEvent) {
            return 'Pagina oficial';
        }

        return event.isEvent ? 'Participar' : 'Acessar';
    }

    getEventMonth(startingDatetime: string): string {
        return new Intl.DateTimeFormat('pt-BR', { month: 'short' })
            .format(new Date(startingDatetime))
            .replace('.', '')
            .toUpperCase();
    }

    getEventDays(event: ManagedEventSummary): string {
        if (!event.startingDatetime) return '';
        
        const start = new Date(event.startingDatetime);
        const startDay = `${start.getDate()}`.padStart(2, '0');
        
        if (!event.endingDatetime) return startDay;
        
        const end = new Date(event.endingDatetime);
        if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate()) {
            return startDay;
        }
        
        const endDay = `${end.getDate()}`.padStart(2, '0');
        return `${startDay} a ${endDay}`;
    }

    isEventPast(event: ManagedEventSummary): boolean {
        if (!event.startingDatetime) return false;

        // Se o evento tem data de término explícita, só é passado se o término já passou (neste minuto)
        if (event.endingDatetime) {
            return new Date(event.endingDatetime).getTime() < new Date().getTime();
        }

        // Se não tem término explícito, considera "hoje" como a referência para não cinzar o evento no próprio dia
        const eventDate = new Date(event.startingDatetime);
        const today = new Date();
        eventDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return eventDate.getTime() < today.getTime();
    }

    shouldShowEventYear(event: ManagedEventSummary): boolean {
        if (!event.startingDatetime) return false;

        if (this.isEventPast(event)) return true;

        const eventDate = new Date(event.startingDatetime);
        const today = new Date();

        return eventDate.getFullYear() !== today.getFullYear();
    }

    private loadMinidash(): void {
        if (this.isAdmin) {
            this.eventService.getAdminEventsMinidash().subscribe({
                next: (minidash) => {
                    this.minidashItems = this.buildAdminMinidashItems(minidash);
                },
                error: () => {
                    this.minidashItems = this.buildMinidashItems();
                }
            });

            return;
        }

        this.eventService.getEventsMinidash().subscribe({
            next: (minidash) => {
                this.minidashItems = this.buildUserMinidashItems(minidash);
            },
            error: () => {
                this.minidashItems = this.buildMinidashItems();
            }
        });
    }

    private loadPartnerEvents(): void {
        this.partnerEventsStateSubject.next(this.buildLoadingState(this.partnerEventsStateSubject.value.data));

        this.eventService.getPartnerEvents().subscribe({
            next: (response) => {
                this.partnerEventsStateSubject.next(this.buildLoadedState(response.items));
            },
            error: () => {
                this.partnerEventsStateSubject.next(this.buildErrorState([]));
            }
        });
    }

    private loadCommonEvents(): void {
        this.commonEventsStateSubject.next(this.buildLoadingState(this.commonEventsStateSubject.value.data));

        this.eventService.getCommonEvents(this.buildCommonEventsFilters()).subscribe({
            next: (response) => {
                this.commonEventsStateSubject.next(this.buildLoadedState(response));
            },
            error: () => {
                this.commonEventsStateSubject.next(this.buildErrorState(null));
            }
        });
    }

    private buildCommonEventsFilters(): EventListFilters {
        const today = new Date();
        const baseFilters: EventListFilters = {
            page: this.commonPage,
            size: this.commonPageSize
        };

        if (this.activeCommonFilter === 'week') {
            return {
                ...baseFilters,
                weekStart: this.formatDateParam(this.getCurrentWeekStart(today))
            };
        }

        if (this.activeCommonFilter === 'month') {
            return {
                ...baseFilters,
                month: this.formatMonthParam(today)
            };
        }

        return baseFilters;
    }

    private getCurrentWeekStart(date: Date): Date {
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const daysFromMonday = day === 0 ? 6 : day - 1;

        weekStart.setDate(weekStart.getDate() - daysFromMonday);

        return weekStart;
    }

    private formatDateParam(date: Date): string {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    private formatMonthParam(date: Date): string {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');

        return `${year}-${month}`;
    }

    showMinidash = false;
    isMinidashExpanded = false;

    toggleMinidash(): void {
        this.isMinidashExpanded = !this.isMinidashExpanded;
    }

    private buildMinidashItems(): MinidashItem[] {
        return this.isAdmin
            ? this.buildAdminMinidashItems({ activeEvents: 0, partnerEvents: 0, pendingApprovalEvents: 0 })
            : this.buildUserMinidashItems({ activeOwnerEvents: 0, activeStaffEvents: 0, pendingReviewEvents: 0 });
    }

    private buildUserMinidashItems(minidash: EventMinidash): MinidashItem[] {
        const items: MinidashItem[] = [];

        this.showMinidash = minidash.activeOwnerEvents > 0 || minidash.activeStaffEvents > 0 || minidash.pendingReviewEvents > 0;

        if (this.showMinidash) {
            items.push({
                value: minidash.activeOwnerEvents,
                label: 'Meus eventos',
                bgClass: 'bg-white/5 border-white/10',
                textClass: 'text-white',
                labelClass: 'text-gray-400'
            });

            if (minidash.activeStaffEvents > 0) {
                items.push({
                    value: minidash.activeStaffEvents,
                    label: 'Como staff',
                    bgClass: 'bg-braYellow/10 border-braYellow/20',
                    textClass: 'text-braYellow',
                    labelClass: 'text-braYellow/80'
                });
            }

            if (minidash.pendingReviewEvents > 0) {
                items.push({
                    value: minidash.pendingReviewEvents,
                    label: 'Aguardando aprovacao',
                    bgClass: 'bg-braMagenta/10 border-braMagenta/20',
                    textClass: 'text-braMagenta',
                    labelClass: 'text-braMagenta/80'
                });
            }
        }

        return items;
    }

    private buildAdminMinidashItems(minidash: AdminEventMinidash): MinidashItem[] {
        this.showMinidash = true;

        return [
            {
                value: minidash.activeEvents,
                label: 'Eventos Ativos',
                bgClass: 'bg-white/5 border-white/10',
                textClass: 'text-white',
                labelClass: 'text-gray-400'
            },
            {
                value: minidash.partnerEvents,
                label: 'Parceiros',
                bgClass: 'bg-braYellow/10 border-braYellow/20',
                textClass: 'text-braYellow',
                labelClass: 'text-braYellow/80'
            },
            {
                value: minidash.pendingApprovalEvents,
                label: 'Aguardando aprovação',
                bgClass: 'bg-braMagenta/10 border-braMagenta/20',
                textClass: 'text-braMagenta',
                labelClass: 'text-braMagenta/80'
            }
        ];
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

}
