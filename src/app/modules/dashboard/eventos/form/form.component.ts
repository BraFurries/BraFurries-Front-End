import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Observable, throwError, merge, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, finalize, map, switchMap, tap } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { DialogComponent } from '../../../../shared/components/dialog/dialog.component';
import { EventAvailabilityDialogComponent } from './event-availability-dialog/event-availability-dialog.component';
import {
  EventAvailabilityNearbyEvent,
  EventAvailabilityResponse,
  EventLocale,
  EventService,
  EventStaffPermission,
  EventUpdatePayload,
  EventWritePayload
} from '../../../../core/services/event.service';
import { UserPermissionsService } from '../../../../core/services/user-permissions.service';
import { UserService } from '../../../../core/services/user.service';
import { Event } from '../../../../shared/models/api/events/event';
import { SeoService } from '../../../../core/services/seo-service.service';

type SelectOption<T> = {
  label: string;
  value: T;
};

type AvailabilityDialogKind = 'critical' | 'strong' | 'warning';

type AvailabilityRequest = {
  localeId: number;
  city: string;
  date: string;
  requestKey: string;
  confirmationKey: string;
};

type AvailabilityClassification = {
  type: AvailabilityDialogKind;
  title: string;
  message: string;
};

@Component({
  selector: 'app-form',
  standalone: false,
  templateUrl: './form.component.html',
  styleUrl: './form.component.scss'
})
export class FormComponent implements OnInit {
  eventoForm!: FormGroup;
  isEditing = false;
  eventId: number | null = null;
  isLoading = false;
  isSubmitting = false;
  canEditSchedule = true;
  currentEvent: Event | null = null;
  selectedLogoFile: File | null = null;
  logoDeleted = false;
  originalLogoUrl: string | null = null;
  isLocalesLoading = false;
  localeOptions: SelectOption<number>[] = [];
  private availabilityConfirmedKey: string | null = null;
  private availabilityDialogOpen = false;
  private availabilityCheckInFlightKey: string | null = null;
  private submitAfterAvailabilityKey: string | null = null;
  private originalAvailabilityKey: string | null = null;
  private availabilityCache = new Map<string, EventAvailabilityResponse>();

  readonly activityTypes: SelectOption<boolean>[] = [
    { label: 'Furmeet / Encontro Casual', value: false },
    { label: 'Evento Oficial / Convencao', value: true }
  ];

  readonly timeOptions: SelectOption<string>[] = this.buildTimeOptions();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly eventService: EventService,
    private readonly userPermissionsService: UserPermissionsService,
    private readonly userService: UserService,
    private readonly seoService: SeoService,
    private readonly dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Criar Evento - BraFurries',
      'Cadastre um novo evento ou encontro furry na BraFurries para divulgar informacoes, agenda e detalhes de participacao.'
    );
    this.eventoForm = new FormGroup({
      eventName: new FormControl('', [Validators.required, Validators.maxLength(64)]),
      city: new FormControl('', [Validators.required, Validators.maxLength(32)]),
      address: new FormControl('', [Validators.required, Validators.maxLength(256)]),
      startingDatetime: new FormControl<string | null>(null),
      endingDatetime: new FormControl<string | null>(null),
      startDate: new FormControl<Date | null>(null, [Validators.required]),
      startTime: new FormControl('', [Validators.required]),
      endDate: new FormControl<Date | null>(null, [Validators.required]),
      endTime: new FormControl('', [Validators.required]),
      localeId: new FormControl<number | null>({ value: null, disabled: true }, [Validators.required]),
      description: new FormControl('', [Validators.maxLength(512)]),
      pointName: new FormControl('', [Validators.maxLength(64)]),
      price: new FormControl('', [Validators.maxLength(16)]),
      maxPrice: new FormControl('', [Validators.maxLength(16)]),
      groupChatLink: new FormControl('', [Validators.maxLength(256)]),
      website: new FormControl('', [Validators.maxLength(64)]),
      ticketUrl: new FormControl('', [Validators.maxLength(256)]),
      priceConfirmed: new FormControl(false),
      outOfTickets: new FormControl(false),
      salesEnded: new FormControl(false),
      isEvent: new FormControl(false),
      isSingleDay: new FormControl(true)
    });

    this.setupDateSync();
    this.setupAvailabilityCheck();
    this.loadLocales();

    const routeEventId = Number(
      this.route.snapshot.paramMap.get('id') ?? this.route.snapshot.parent?.paramMap.get('id')
    );

    if (!routeEventId) {
      return;
    }

    this.isEditing = true;
    this.eventId = routeEventId;
    this.seoService.updateMetaTags(
      'Editar Evento - BraFurries',
      'Edite informacoes, agenda e detalhes de um evento cadastrado na BraFurries.'
    );
    this.loadEventForEditing(routeEventId);
  }

  salvarEvento(): void {
    this.syncDateTimeControls();

    if (this.eventoForm.invalid || this.isSubmitting || this.isLocalesLoading) {
      this.eventoForm.markAllAsTouched();
      return;
    }

    const availabilityRequest = this.getCurrentAvailabilityRequest();

    if (
      availabilityRequest
      && availabilityRequest.confirmationKey !== this.originalAvailabilityKey
      && availabilityRequest.confirmationKey !== this.availabilityConfirmedKey
    ) {
      this.checkAvailabilityBeforeSubmit(availabilityRequest);
      return;
    }

    this.submitEvento();
  }

  private submitEvento(): void {
    const request$ = this.isEditing && this.eventId
      ? this.eventService.updateEvent(this.eventId, this.buildUpdatePayload())
      : this.eventService.createEvent(this.buildCreatePayload());

    this.isSubmitting = true;

    request$.pipe(
      switchMap((eventResp) => {
        const idToUse = this.isEditing && this.eventId ? this.eventId : eventResp?.id;

        if (!idToUse) {
          return of(null);
        }

        if (this.selectedLogoFile) {
          return this.eventService.uploadEventLogo(idToUse, this.selectedLogoFile).pipe(
            map(() => idToUse)
          );
        }

        if (this.logoDeleted) {
          return this.eventService.deleteEventLogo(idToUse).pipe(
            map(() => idToUse)
          );
        }

        return of(idToUse);
      })
    ).subscribe({
      next: (idToUse) => {
        this.isSubmitting = false;
        if (idToUse) {
          this.router.navigate(this.isEditing ? ['/painel/eventos', idToUse] : ['/painel/eventos']);
        } else {
          this.router.navigate(['/painel/eventos']);
        }
      },
      error: () => {
        this.isSubmitting = false;
      }
    });
  }

  private checkAvailabilityBeforeSubmit(request: AvailabilityRequest): void {
    if (this.availabilityDialogOpen || this.availabilityCheckInFlightKey === request.requestKey) {
      this.submitAfterAvailabilityKey = request.confirmationKey;
      return;
    }

    const cachedAvailability = this.availabilityCache.get(request.requestKey);

    if (cachedAvailability) {
      this.handleAvailabilityResult(cachedAvailability, request.confirmationKey, () => this.submitEvento());
      return;
    }

    this.availabilityCheckInFlightKey = request.requestKey;

    this.eventService.getEventAvailability(request.localeId, request.city, request.date).pipe(
      finalize(() => {
        if (this.availabilityCheckInFlightKey === request.requestKey) {
          this.availabilityCheckInFlightKey = null;
        }
      })
    ).subscribe({
      next: (availability) => {
        this.availabilityCache.set(request.requestKey, availability);
        this.handleAvailabilityResult(availability, request.confirmationKey, () => this.submitEvento());
      },
      error: () => {
        this.dialog.open(DialogComponent, {
          width: '460px',
          data: {
            title: 'Não foi possível verificar a disponibilidade',
            message: 'Tente novamente em alguns instantes antes de salvar o evento.'
          }
        });
        this.submitAfterAvailabilityKey = null;
      }
    });
  }

  cancelar(): void {
    if (this.isEditing && this.eventId) {
      this.router.navigate(['/painel/eventos', this.eventId]);
      return;
    }

    this.router.navigate(['/painel/eventos']);
  }

  private loadLocales(): void {
    this.isLocalesLoading = true;
    this.eventoForm.get('localeId')?.disable({ emitEvent: false });

    this.eventService.getLocales().subscribe({
      next: (locales) => {
        this.localeOptions = locales.map((locale) => this.mapLocaleToOption(locale));
        this.isLocalesLoading = false;
        this.eventoForm.get('localeId')?.enable({ emitEvent: false });
      },
      error: () => {
        this.localeOptions = [];
        this.isLocalesLoading = false;
        this.eventoForm.get('localeId')?.enable({ emitEvent: false });
      }
    });
  }

  private mapLocaleToOption(locale: EventLocale): SelectOption<number> {
    return {
      label: `${locale.localeName} (${locale.localeAbbrev})`,
      value: locale.id
    };
  }

  private setupAvailabilityCheck(): void {
    const localeControl = this.eventoForm.get('localeId');
    const cityControl = this.eventoForm.get('city');
    const startDateControl = this.eventoForm.get('startDate');
    const isEventControl = this.eventoForm.get('isEvent');

    if (!localeControl || !cityControl || !startDateControl || !isEventControl) {
      return;
    }

    merge(
      localeControl.valueChanges,
      cityControl.valueChanges,
      startDateControl.valueChanges,
      isEventControl.valueChanges
    ).pipe(
      debounceTime(650),
      map(() => this.getCurrentAvailabilityRequest()),
      filter((request): request is AvailabilityRequest => !!request),
      filter(({ requestKey }) => requestKey !== this.availabilityCheckInFlightKey && !this.availabilityDialogOpen),
      distinctUntilChanged((previous, current) => previous.confirmationKey === current.confirmationKey),
      tap((request) => {
        this.availabilityCheckInFlightKey = request.requestKey;
      }),
      switchMap((request) => {
        const cachedAvailability = this.availabilityCache.get(request.requestKey);

        if (cachedAvailability) {
          this.availabilityCheckInFlightKey = null;
          return of({ availability: cachedAvailability, confirmationKey: request.confirmationKey });
        }

        return this.eventService.getEventAvailability(request.localeId, request.city, request.date).pipe(
        map((availability) => {
          this.availabilityCache.set(request.requestKey, availability);

          return { availability, confirmationKey: request.confirmationKey };
        }),
        catchError(() => {
          this.dialog.open(DialogComponent, {
            width: '460px',
            data: {
              title: 'Não foi possível verificar a disponibilidade',
              message: 'Tente novamente em alguns instantes antes de salvar o evento.'
            }
          });
          this.submitAfterAvailabilityKey = null;

          return EMPTY;
        }),
        finalize(() => {
          if (this.availabilityCheckInFlightKey === request.requestKey) {
            this.availabilityCheckInFlightKey = null;
          }
        })
        );
      })
    ).subscribe(({ availability, confirmationKey }) => {
      this.handleAvailabilityResult(availability, confirmationKey);
    });
  }

  private handleAvailabilityResult(availability: EventAvailabilityResponse, confirmationKey: string, onConfirmed?: () => void): void {
    const classification = this.classifyAvailability(availability);

    if (!classification) {
      this.availabilityConfirmedKey = confirmationKey;
      const shouldSubmitAfterConfirmation = this.submitAfterAvailabilityKey === confirmationKey;
      this.submitAfterAvailabilityKey = null;

      if (shouldSubmitAfterConfirmation) {
        this.submitEvento();
        return;
      }

      onConfirmed?.();
      return;
    }

    this.showAvailabilityDialog(availability, confirmationKey, classification, onConfirmed);
  }

  private showAvailabilityDialog(
    availability: EventAvailabilityResponse,
    confirmationKey: string,
    classification: AvailabilityClassification,
    onConfirmed?: () => void
  ): void {
    this.availabilityDialogOpen = true;
    const currentActivityIsEvent = this.currentActivityIsEvent();

    const selectedLocaleOption = this.localeOptions.find(opt => opt.value === availability.localeId);
    const localeAbbrevMatch = selectedLocaleOption?.label.match(/\(([^)]+)\)$/);
    const localeAbbrev = localeAbbrevMatch ? localeAbbrevMatch[1] : '';
    const formCity = this.eventoForm.get('city')?.value;

    const dialogRef = this.dialog.open(EventAvailabilityDialogComponent, {
      width: '600px',
      panelClass: 'availability-dialog-panel',
      data: {
        isEvent: currentActivityIsEvent,
        type: classification.type,
        title: classification.title,
        message: classification.message,
        availability,
        localeAbbrev,
        formCity
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean | undefined) => {
      this.availabilityDialogOpen = false;

      if (!confirmed) {
        this.availabilityConfirmedKey = null;
        this.submitAfterAvailabilityKey = null;
        this.eventoForm.patchValue({
          startDate: null,
          startingDatetime: null
        });
        return;
      }

      this.availabilityConfirmedKey = confirmationKey;
      const shouldSubmitAfterConfirmation = this.submitAfterAvailabilityKey === confirmationKey;
      this.submitAfterAvailabilityKey = null;

      if (shouldSubmitAfterConfirmation) {
        this.submitEvento();
        return;
      }

      onConfirmed?.();
    });
  }

  private getCurrentAvailabilityRequest(): AvailabilityRequest | null {
    const localeId = Number(this.eventoForm.get('localeId')?.value);
    const city = `${this.eventoForm.get('city')?.value ?? ''}`.trim();
    const date = this.formatDateOnly(this.eventoForm.get('startDate')?.value);
    const isEvent = this.currentActivityIsEvent();

    if (!localeId || !city || !date) {
      return null;
    }

    return {
      localeId,
      city,
      date,
      requestKey: this.buildAvailabilityRequestKey(localeId, city, date),
      confirmationKey: this.buildAvailabilityConfirmationKey(localeId, city, date, isEvent)
    };
  }



  private currentActivityIsEvent(): boolean {
    return this.coerceBoolean(this.eventoForm.get('isEvent')?.value);
  }

  private classifyAvailability(availability: EventAvailabilityResponse): AvailabilityClassification | null {
    const currentIsEvent = this.currentActivityIsEvent();
    const relatedEvents = availability.nearbyEvents ?? [];

    if (!availability.localeAvailable || !availability.cityAvailable) {
      if (!currentIsEvent && relatedEvents.length) {
        return this.classifyMeetAvailability(availability, relatedEvents);
      }

      return {
        type: 'critical',
        title: currentIsEvent ? 'Data extremamente não recomendada para evento' : 'Data extremamente não recomendada para meet',
        message: currentIsEvent
          ? 'Há evento ou meet em conflito direto com a data escolhida. Eventos no mesmo dia, ou evento e meet no mesmo dia, são extremamente não recomendados porque dividem público, divulgação e organização.'
          : 'Há conflito direto com a data escolhida. Revise as atividades próximas antes de confirmar.'
      };
    }

    if (!relatedEvents.length) {
      return null;
    }

    if (currentIsEvent) {
      return this.classifyEventAvailability(availability, relatedEvents);
    }

    return this.classifyMeetAvailability(availability, relatedEvents);
  }

  private classifyEventAvailability(
    availability: EventAvailabilityResponse,
    relatedEvents: EventAvailabilityNearbyEvent[]
  ): AvailabilityClassification {
    const hasSameDayEvent = relatedEvents.some((event) => this.dateFallsWithinEventRange(availability.date, event));

    if (hasSameDayEvent) {
      return {
        type: 'critical',
        title: 'Data extremamente não recomendada para evento',
        message: 'Existe uma atividade no mesmo dia da data escolhida. Eventos no mesmo dia, inclusive quando o outro item é um meet, são extremamente não recomendados porque tendem a prejudicar ambos.'
      };
    }

    return {
      type: 'strong',
      title: 'Evento próximo a outro evento',
      message: 'Existe outra atividade a até uma semana da data escolhida. Eventos perto de outro evento são fortemente não recomendados, pois podem dividir público, equipe, divulgação e planejamento.'
    };
  }

  private classifyMeetAvailability(
    availability: EventAvailabilityResponse,
    relatedEvents: EventAvailabilityNearbyEvent[]
  ): AvailabilityClassification {
    const sameDayEvents = relatedEvents.filter((event) => this.dateFallsWithinEventRange(availability.date, event));
    const hasSameDayOfficialEvent = sameDayEvents.some((event) => this.isOfficialEventType(event.type));
    const hasSameDaySameCityMeet = sameDayEvents.some((event) =>
      !this.isOfficialEventType(event.type)
      && event.localeId === availability.localeId
      && this.normalizeAvailabilityCity(event.city) === this.normalizeAvailabilityCity(availability.city)
    );

    if (hasSameDayOfficialEvent || hasSameDaySameCityMeet) {
      return {
        type: 'critical',
        title: 'Data extremamente não recomendada para meet',
        message: hasSameDayOfficialEvent
          ? 'Existe evento oficial no mesmo dia. Evento e meet no mesmo dia são extremamente não recomendados, mesmo quando o meet parece localmente viável.'
          : 'Existe outro meet no mesmo dia, na mesma cidade e no mesmo estado. Essa combinação é extremamente não recomendada porque concorre diretamente pelo mesmo público local.'
      };
    }

    const hasSameWeekendSameCityMeet = relatedEvents.some((event) =>
      !this.isOfficialEventType(event.type)
      && event.localeId === availability.localeId
      && this.normalizeAvailabilityCity(event.city) === this.normalizeAvailabilityCity(availability.city)
      && this.isSameWeekend(availability.date, event.date)
    );

    if (hasSameWeekendSameCityMeet) {
      return {
        type: 'strong',
        title: 'Meet no mesmo fim de semana e cidade',
        message: 'Existe outro meet no mesmo fim de semana, no mesmo estado e na mesma cidade. Pode acontecer, mas não é recomendado porque tende a dividir o público local.'
      };
    }

    const hasNearbyOfficialEvent = relatedEvents.some((event) => this.isOfficialEventType(event.type));

    if (hasNearbyOfficialEvent) {
      return {
        type: 'warning',
        title: 'Meet próximo a evento oficial',
        message: 'Existe um evento oficial a até uma semana da data escolhida. O meet pode acontecer, mas é importante considerar presença, deslocamento e divulgação antes de confirmar.'
      };
    }

    return {
      type: 'warning',
      title: 'Meet próximo no mesmo estado',
      message: 'Existe outro meet no mesmo fim de semana e no mesmo estado, mas em cidade diferente. Pode acontecer, mas cabe o aviso para avaliar deslocamento, presença e divulgação.'
    };
  }

  private isOfficialEventType(type: string): boolean {
    return type
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes('evento');
  }

  private isSameDay(referenceDate: string, eventDate: string): boolean {
    return this.formatDateOnly(eventDate) === referenceDate;
  }

  private dateFallsWithinEventRange(referenceDate: string, event: EventAvailabilityNearbyEvent): boolean {
    const reference = this.parseDateOnly(referenceDate);
    const start = this.parseDateOnly(this.formatDateOnly(event.date));
    const end = event.endingDate ? this.parseDateOnly(this.formatDateOnly(event.endingDate)) : start;

    if (!reference || !start || !end) {
      return this.isSameDay(referenceDate, event.date);
    }

    const referenceTime = reference.getTime();

    return referenceTime >= start.getTime() && referenceTime <= end.getTime();
  }

  private isSameWeekend(referenceDate: string, eventDate: string): boolean {
    const reference = this.parseDateOnly(referenceDate);
    const candidate = this.parseDateOnly(this.formatDateOnly(eventDate));

    if (!reference || !candidate) {
      return false;
    }

    const referenceWeekend = this.getWeekendRange(reference);
    const candidateWeekend = this.getWeekendRange(candidate);

    return referenceWeekend.start.getTime() === candidateWeekend.start.getTime()
      && referenceWeekend.end.getTime() === candidateWeekend.end.getTime();
  }

  private getWeekendRange(date: Date): { start: Date; end: Date } {
    const day = date.getDay();
    const saturdayOffset = day === 0 ? -1 : 6 - day;
    const saturday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + saturdayOffset);
    const sunday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() + 1);

    return { start: saturday, end: sunday };
  }

  private parseDateOnly(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (!match) {
      return null;
    }

    const parsedDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  private buildAvailabilityRequestKey(localeId: number, city: string, date: string): string {
    return `${localeId}|${this.normalizeAvailabilityCity(city)}|${date}`;
  }

  private buildAvailabilityConfirmationKey(localeId: number, city: string, date: string, isEvent: boolean): string {
    return `${this.buildAvailabilityRequestKey(localeId, city, date)}|${isEvent ? 'event' : 'meet'}`;
  }

  private normalizeAvailabilityCity(city: string): string {
    return city
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private formatDateOnly(value: Date | string | null): string {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }



  private loadEventForEditing(eventId: number): void {
    this.isLoading = true;

    this.ensureCanManageEvent(eventId).subscribe({
      next: ({ event, staffs }) => {
        this.currentEvent = event;
        this.canEditSchedule = this.userCanEditSchedule(event, staffs);
        this.patchFormWithEvent(event);
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.router.navigate(['/painel/eventos', eventId]);
      }
    });
  }

  private ensureCanManageEvent(eventId: number): Observable<{ event: Event; staffs: EventStaffPermission[] }> {
    if (this.userPermissionsService.isAdmin()) {
      return this.eventService.getEventById(eventId).pipe(
        map((event) => ({ event, staffs: [] }))
      );
    }

    return this.eventService.getEventStaffById(eventId).pipe(
      switchMap((staffs) => {
        if (!this.userCanAccessForm(staffs)) {
          return throwError(() => new Error('User cannot manage this event.'));
        }

        return this.eventService.getEventById(eventId).pipe(
          map((event) => ({ event, staffs }))
        );
      })
    );
  }

  private userCanAccessForm(staffs: EventStaffPermission[]): boolean {
    return this.userHasEventEditPermission(staffs);
  }

  private userCanEditSchedule(event: Event, staffs: EventStaffPermission[]): boolean {
    if (!this.isEditing) {
      return true;
    }

    if (this.userPermissionsService.isAdmin()) {
      return true;
    }

    return this.isEventCreator(event) || (this.userCanManageAgenda(staffs) && this.userHasEventEditPermission(staffs));
  }

  private isEventCreator(event: Event): boolean {
    return event.host.id === this.userService.getUser()?.id;
  }

  private userCanManageAgenda(staffs: EventStaffPermission[]): boolean {
    const loggedUserId = this.userService.getUser()?.id;

    if (!loggedUserId) {
      return false;
    }

    const staff = staffs.find((item) => item.userId === loggedUserId);

    return !!staff?.permissions?.some((permission) => this.normalizePermission(permission) === 'mngagenda');
  }

  private userHasEventEditPermission(staffs: EventStaffPermission[]): boolean {
    const loggedUserId = this.userService.getUser()?.id;

    if (!loggedUserId) {
      return false;
    }

    const staff = staffs.find((item) => item.userId === loggedUserId);

    return !!staff?.permissions?.some((permission) => this.normalizePermission(permission) === 'editevent');
  }

  private patchFormWithEvent(event: Event): void {
    this.originalLogoUrl = event.eventLogoUrl ?? null;
    this.originalAvailabilityKey = this.buildAvailabilityConfirmationKey(
      event.localeId,
      event.city,
      this.formatDateOnly(this.parseApiDate(event.startingDatetime)),
      this.coerceBoolean(event.isEvent)
    );
    this.availabilityConfirmedKey = this.originalAvailabilityKey;

    this.eventoForm.patchValue(
      {
        eventName: event.eventName,
        city: event.city,
        address: event.address,
        startingDatetime: event.startingDatetime,
        endingDatetime: event.endingDatetime,
        startDate: this.parseApiDate(event.startingDatetime),
        startTime: this.extractTime(event.startingDatetime),
        endDate: this.parseApiDate(event.endingDatetime),
        endTime: this.extractTime(event.endingDatetime),
        localeId: event.localeId,
        description: event.description ?? '',
        pointName: event.pointName ?? '',
        price: this.formatCurrency(event.price),
        maxPrice: this.formatCurrency(event.maxPrice),
        groupChatLink: event.groupChatLink ?? '',
        website: event.website ?? '',
        ticketUrl: event.ticketUrl ?? '',
        priceConfirmed: event.priceConfirmed,
        outOfTickets: event.outOfTickets,
        salesEnded: event.salesEnded,
        isEvent: this.coerceBoolean(event.isEvent),
        isSingleDay: this.checkIsSingleDay(event.startingDatetime, event.endingDatetime)
      },
      { emitEvent: false }
    );
  }

  private buildCreatePayload(): EventWritePayload {
    const rawValue = this.eventoForm.getRawValue();
    const {
      startDate: _startDate,
      startTime: _startTime,
      endDate: _endDate,
      endTime: _endTime,
      isSingleDay: _isSingleDay,
      ...formValue
    } = rawValue;

    return {
      ...formValue,
      description: formValue.description || null,
      pointName: formValue.pointName || null,
      groupChatLink: formValue.groupChatLink || null,
      website: formValue.website || null,
      ticketUrl: formValue.ticketUrl || null,
      price: this.parseCurrency(formValue.price),
      maxPrice: this.parseCurrency(formValue.maxPrice)
    };
  }

  private buildUpdatePayload(): EventUpdatePayload {
    const rawValue = this.eventoForm.getRawValue();
    const {
      startingDatetime,
      endingDatetime,
      startDate: _startDate,
      startTime: _startTime,
      endDate: _endDate,
      endTime: _endTime,
      isSingleDay: _isSingleDay,
      ...formValue
    } = rawValue;

    const payload: EventUpdatePayload = {
      ...formValue,
      description: formValue.description || null,
      pointName: formValue.pointName || null,
      groupChatLink: formValue.groupChatLink || null,
      website: formValue.website || null,
      ticketUrl: formValue.ticketUrl || null,
      price: this.parseCurrency(formValue.price),
      maxPrice: this.parseCurrency(formValue.maxPrice)
    };

    if (this.canEditSchedule) {
      payload.startingDatetime = startingDatetime;
      payload.endingDatetime = endingDatetime;
    }

    return payload;
  }

  private syncDateTimeControls(): void {
    const startDate = this.eventoForm.get('startDate')?.value;
    const startTime = this.eventoForm.get('startTime')?.value;
    const endDate = this.eventoForm.get('endDate')?.value;
    const endTime = this.eventoForm.get('endTime')?.value;

    this.eventoForm.patchValue(
      {
        startingDatetime: this.combineDateAndTime(startDate, startTime),
        endingDatetime: this.combineDateAndTime(endDate, endTime)
      },
      { emitEvent: false }
    );
  }

  private setupDateSync(): void {
    this.eventoForm.get('startDate')?.valueChanges.subscribe((startDate: Date | null) => {
      if (!startDate) return;

      const isSingleDay = this.eventoForm.get('isSingleDay')?.value;
      const currentEndDate = this.eventoForm.get('endDate')?.value;

      if (isSingleDay) {
        this.eventoForm.patchValue({ endDate: startDate });
      } else if (currentEndDate && this.compareDates(startDate, currentEndDate) > 0) {
        this.eventoForm.patchValue({ endDate: startDate });
      }
    });

    this.eventoForm.get('isSingleDay')?.valueChanges.subscribe((isSingleDay: boolean) => {
      if (isSingleDay) {
        const startDate = this.eventoForm.get('startDate')?.value;
        if (startDate) {
          this.eventoForm.patchValue({ endDate: startDate });
        }
      }
    });
  }

  private compareDates(date1: Date, date2: Date): number {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return d1.getTime() - d2.getTime();
  }

  private checkIsSingleDay(start: string | null, end: string | null): boolean {
    if (!start || !end) return true;
    const startDate = start.split('T')[0];
    const endDate = end.split('T')[0];
    return startDate === endDate;
  }

  private combineDateAndTime(date: Date | null, time: string): string | null {
    if (!date || !time) {
      return null;
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}T${time}`;
  }

  private parseCurrency(value: string | number | null): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isNaN(value) ? null : value;
    }

    const normalized = value.replace(/\./g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);

    return Number.isNaN(parsed) ? null : parsed;
  }

  private formatCurrency(value: number | null): string {
    if (value === null || value === undefined) {
      return '';
    }

    return value.toFixed(2).replace('.', ',');
  }

  private parseApiDate(value: string | null): Date | null {
    if (!value) {
      return null;
    }

    const parsedDate = new Date(value);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  private extractTime(value: string | null): string {
    if (!value) {
      return '';
    }

    const match = value.match(/T(\d{2}:\d{2})/);

    return match?.[1] ?? '';
  }

  private normalizePermission(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  private coerceBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      return normalized === 'true' || normalized === '1';
    }

    return false;
  }

  private buildTimeOptions(): SelectOption<string>[] {
    const options: SelectOption<string>[] = [];

    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 30) {
        const value = `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
        options.push({ label: value, value });
      }
    }

    return options;
  }

  onLogoSelected(event: globalThis.Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedLogoFile = input.files[0];
      this.logoDeleted = false;

      const reader = new FileReader();
      reader.onload = (e) => {
        if (!this.currentEvent) {
          this.currentEvent = {} as Event;
        }
        this.currentEvent.eventLogoUrl = e.target?.result as string;
      };
      reader.readAsDataURL(this.selectedLogoFile);
    }
  }

  removeLogo(): void {
    if (this.selectedLogoFile) {
      this.selectedLogoFile = null;
      this.logoDeleted = false;
      if (this.currentEvent) {
        this.currentEvent.eventLogoUrl = this.originalLogoUrl;
      }
      return;
    }

    if (this.originalLogoUrl && !this.logoDeleted) {
      const dialogRef = this.dialog.open(DialogComponent, {
        width: '400px',
        data: {
          title: 'Remover Logo',
          message: 'Tem certeza que deseja remover a logo deste evento? A remoção será efetivada ao salvar o evento.',
          type: 'boolean',
          buttons: ['Cancelar', 'Remover']
        }
      });

      dialogRef.afterClosed().subscribe((result: boolean) => {
        if (result) {
          this.logoDeleted = true;
          if (this.currentEvent) {
            this.currentEvent.eventLogoUrl = null;
          }
        }
      });
    }
  }
}
