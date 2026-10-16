import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { UserPermissionsService } from '../../../../core/services/user-permissions.service';
import { EventSchedulePayload, EventService, EventStaffPermission, AddStaffPayload } from '../../../../core/services/event.service';
import { UserService } from '../../../../core/services/user.service';
import { Event, EventStaff } from '../../../../shared/models/api/events/event';
import { UserReliability } from '../../../../core/models/user-reliability.model';
import { SeoService } from '../../../../core/services/seo-service.service';

type StaffPermissionRow = EventStaff & {
  permissions: string[];
  mngAgenda: boolean;
  editEvent: boolean;
  mngStaff: boolean;
  isSaving?: boolean;
};

@Component({
  selector: 'app-unico',
  standalone: false,
  templateUrl: './unico.component.html',
  styleUrl: './unico.component.scss',
})
export class UnicoComponent implements OnInit {
  isAdmin = false;
  isStaff = false;
  canEditSchedule = false;
  canManageStaff = false;
  eventoParceiro = false;
  evento: Event | null = null;
  isLoading = true;
  hasError = false;
  editingStaff = false;
  editingSchedule = false;
  isSavingSchedule = false;
  isUpdatingApproval = false;
  isUpdatingPartner = false;
  isLoadingStaffPermissions = false;
  hasStaffPermissionsError = false;
  staffPermissionsLoaded = false;
  staffPermissionRows: StaffPermissionRow[] = [];
  readonly timeOptions: { label: string; value: string }[] = this.buildTimeOptions();
  readonly scheduleForm = new FormGroup({
    startDate: new FormControl<Date | null>(null, [Validators.required]),
    startTime: new FormControl('', [Validators.required]),
    endDate: new FormControl<Date | null>(null, [Validators.required]),
    endTime: new FormControl('', [Validators.required]),
    isSingleDay: new FormControl(true)
  });

  constructor(
    private readonly userPermissionsService: UserPermissionsService,
    private readonly route: ActivatedRoute,
    private readonly eventService: EventService,
    private readonly userService: UserService,
    readonly router: Router,
    private readonly seoService: SeoService
  ) {
    this.seoService.updateMetaTags(
      'Eventos - BraFurries',
      'Veja detalhes de eventos e encontros furry cadastrados na BraFurries, incluindo agenda, equipe e informacoes de participacao.'
    );
    this.isAdmin = this.userPermissionsService.isAdmin();
  }

  ngOnInit(): void {
    this.setupDateSync();

    this.route.paramMap
      .pipe(
        map((params) => Number(params.get('id'))),
        distinctUntilChanged()
      )
      .subscribe((eventId) => this.loadEvent(eventId));
  }

  private setupDateSync(): void {
    this.scheduleForm.get('startDate')?.valueChanges.subscribe((startDate: Date | null) => {
      if (!startDate) return;

      const isSingleDay = this.scheduleForm.get('isSingleDay')?.value;
      const endDateControl = this.scheduleForm.get('endDate');
      const currentEndDate = endDateControl?.value as Date | null;

      if (isSingleDay) {
        endDateControl?.setValue(startDate);
      } else if (currentEndDate) {
        const startDay = new Date(startDate);
        startDay.setHours(0, 0, 0, 0);

        const endDay = new Date(currentEndDate);
        endDay.setHours(0, 0, 0, 0);

        if (startDay > endDay) {
          endDateControl?.setValue(startDate);
        }
      }
    });

    this.scheduleForm.get('isSingleDay')?.valueChanges.subscribe((isSingleDay) => {
      if (isSingleDay) {
        const startDate = this.scheduleForm.get('startDate')?.value;
        if (startDate) {
          this.scheduleForm.get('endDate')?.setValue(startDate);
        }
      }
    });
  }

  get isSingleDayEvent(): boolean {
    if (!this.evento?.startingDatetime || !this.evento?.endingDatetime) return false;
    const start = this.evento.startingDatetime.split('T')[0];
    const end = this.evento.endingDatetime.split('T')[0];
    return start === end;
  }

  private loadEvent(eventId: number): void {
    this.evento = null;
    this.hasError = false;
    this.isLoading = true;
    this.editingSchedule = false;
    this.editingStaff = false;
    this.isStaff = false;
    this.canEditSchedule = false;
    this.isLoadingStaffPermissions = false;
    this.hasStaffPermissionsError = false;
    this.staffPermissionsLoaded = false;
    this.staffPermissionRows = [];

    if (!eventId) {
      this.hasError = true;
      this.isLoading = false;
      return;
    }

    this.eventService.getEventById(eventId).subscribe({
      next: (event) => {
        this.evento = event;
        this.eventoParceiro = event.partnerEvent;
        this.isStaff = this.userCanAccessManagement(event);
        this.canEditSchedule = this.userCanEditSchedule(event);
        this.canManageStaff = this.userPermissionsService.isAdmin() || this.isEventCreator(event);
        this.patchScheduleForm(event);
        this.updateEventSeo(event);
        this.isLoading = false;

        if (this.isStaff && !this.staffPermissionsLoaded) {
          this.loadStaffPermissions();
        }
      },
      error: () => {
        this.hasError = true;
        this.isLoading = false;
      }
    });
  }

  toggleStaffEditing(): void {
    if (!this.evento || !this.canManageStaff) {
      return;
    }

    if (this.editingStaff) {
      this.editingStaff = false;
      return;
    }

    this.editingStaff = true;

    if (this.staffPermissionsLoaded || this.isLoadingStaffPermissions) {
      return;
    }

    this.loadStaffPermissions();
  }

  staffHasPermission(staff: StaffPermissionRow, permission: string): boolean {
    return this.staffIsHost(staff)
      || staff.permissions.some((item) => this.normalizePermission(item) === this.normalizePermission(permission));
  }

  toggleScheduleEditing(): void {
    if (!this.canEditSchedule || !this.evento) {
      return;
    }

    this.editingSchedule = !this.editingSchedule;

    if (this.editingSchedule) {
      this.patchScheduleForm(this.evento);
    }
  }

  salvarAgenda(): void {
    if (!this.evento || this.scheduleForm.invalid || this.isSavingSchedule) {
      this.scheduleForm.markAllAsTouched();
      return;
    }

    const payload = this.buildSchedulePayload();

    if (!this.hasScheduleChanged(payload)) {
      this.editingSchedule = false;
      return;
    }

    this.isSavingSchedule = true;

    this.eventService.updateEventSchedule(this.evento.id, payload).subscribe({
      next: () => {
        if (!this.evento) {
          this.isSavingSchedule = false;
          return;
        }

        this.evento = {
          ...this.evento,
          startingDatetime: payload.newStartingDatetime,
          endingDatetime: payload.newEndingDatetime
        };
        this.patchScheduleForm(this.evento);
        this.editingSchedule = false;
        this.isSavingSchedule = false;
      },
      error: () => {
        this.isSavingSchedule = false;
      }
    });
  }

  aprovarEvento(): void {
    if (!this.evento || this.isUpdatingApproval) {
      return;
    }

    this.isUpdatingApproval = true;

    this.eventService.approveEvent(this.evento.id).subscribe({
      next: () => {
        if (this.evento) {
          this.evento = {
            ...this.evento,
            approved: true
          };
        }

        this.isUpdatingApproval = false;
      },
      error: () => {
        this.isUpdatingApproval = false;
      }
    });
  }

  reprovarEvento(): void {
    if (!this.evento || this.isUpdatingApproval) {
      return;
    }

    this.isUpdatingApproval = true;

    this.eventService.rejectEvent(this.evento.id).subscribe({
      next: () => {
        if (this.evento) {
          this.evento = {
            ...this.evento,
            approved: false
          };
        }

        this.isUpdatingApproval = false;
      },
      error: () => {
        this.isUpdatingApproval = false;
      }
    });
  }

  toggleParceria(): void {
    if (!this.evento || this.isUpdatingPartner) {
      return;
    }

    this.isUpdatingPartner = true;

    const request$ = this.eventoParceiro
      ? this.eventService.removeEventPartner(this.evento.id)
      : this.eventService.addEventPartner(this.evento.id);

    request$.subscribe({
      next: () => {
        this.eventoParceiro = !this.eventoParceiro;

        if (this.evento) {
          this.evento = {
            ...this.evento,
            partnerEvent: this.eventoParceiro
          };
        }

        this.isUpdatingPartner = false;
      },
      error: () => {
        this.isUpdatingPartner = false;
      }
    });
  }

  staffIsHost(staff: Event['staffs'][number]): boolean {
    return staff.userId === this.evento?.host.id;
  }

  private loadStaffPermissions(): void {
    if (!this.evento) {
      return;
    }

    this.isLoadingStaffPermissions = true;
    this.hasStaffPermissionsError = false;

    this.eventService.getEventStaffById(this.evento.id).subscribe({
      next: (staffPermissions) => {
        this.staffPermissionRows = this.buildStaffPermissionRows(this.evento?.staffs ?? [], staffPermissions);
        this.staffPermissionsLoaded = true;
        this.isLoadingStaffPermissions = false;

        const loggedUserId = this.userService.getUser()?.id;
        const myStaffRow = this.staffPermissionRows.find(r => r.userId === loggedUserId);
        if (myStaffRow && myStaffRow.permissions.some(p => this.normalizePermission(p) === 'mngstaff')) {
          this.canManageStaff = true;
        }
      },
      error: () => {
        this.staffPermissionRows = [];
        this.hasStaffPermissionsError = true;
        this.isLoadingStaffPermissions = false;
      }
    });
  }

  private buildStaffPermissionRows(
    staffs: EventStaff[],
    staffPermissions: EventStaffPermission[]
  ): StaffPermissionRow[] {
    return staffs.map((staff) => {
      const perms = staffPermissions.find((item) => item.userId === staff.userId)?.permissions ?? [];
      return {
        ...staff,
        permissions: perms,
        mngAgenda: perms.some((p) => this.normalizePermission(p) === 'mngagenda'),
        editEvent: perms.some((p) => this.normalizePermission(p) === 'editevent'),
        mngStaff: perms.some((p) => this.normalizePermission(p) === 'mngstaff'),
        isSaving: false
      };
    });
  }

  private userCanAccessManagement(event: Event): boolean {
    return this.userPermissionsService.isAdmin()
      || this.isEventCreator(event)
      || this.userIsEventStaff(event);
  }

  private userCanEditSchedule(event: Event): boolean {
    return this.userPermissionsService.isAdmin()
      || this.isEventCreator(event);
  }

  showTransferDialog = false;
  showViewOwnershipDialog = false;
  showAdminTransferForm = false;
  showConfirmTransferDialog = false;
  transferTargetControl = new FormControl('');
  transferReasonControl = new FormControl('');
  transferEventNameConfirmationControl = new FormControl('');
  isTransferring = false;

  currentOwnerReliability: UserReliability | null = null;
  isLoadingCurrentOwnerReliability = false;

  newOwnerReliability: UserReliability | null = null;
  isLoadingNewOwnerReliability = false;

  pendingTransferPayload: any = null;
  pendingTransferIsAdmin = false;

  isEventCreator(event: Event | null): boolean {
    if (!event) return false;
    return event.host.id === this.userService.getUser()?.id;
  }

  abrirDialogTransferencia(): void {
    this.showTransferDialog = true;
    this.transferTargetControl.reset('');
    this.transferEventNameConfirmationControl.reset('');
  }

  fecharDialogTransferencia(): void {
    this.showTransferDialog = false;
  }

  abrirDialogVerTitularidade(): void {
    this.showViewOwnershipDialog = true;
    this.showAdminTransferForm = false;
    this.transferTargetControl.reset('');
    this.transferReasonControl.reset('');
    this.currentOwnerReliability = null;
    this.newOwnerReliability = null;

    if (this.evento?.host?.id) {
      this.isLoadingCurrentOwnerReliability = true;
      this.userService.getUserReliability(this.evento.host.id).subscribe({
        next: (res) => {
          this.currentOwnerReliability = res;
          this.isLoadingCurrentOwnerReliability = false;
        },
        error: () => {
          this.isLoadingCurrentOwnerReliability = false;
        }
      });
    }
  }

  fecharDialogVerTitularidade(): void {
    this.showViewOwnershipDialog = false;
  }

  showAddStaffModal = false;
  isAddingStaff = false;
  staffTargetControl = new FormControl('');
  staffCargoControl = new FormControl('');
  staffMngAgendaControl = new FormControl(false);
  staffEditEventControl = new FormControl(false);
  staffMngStaffControl = new FormControl(false);

  showRemoveStaffModal = false;
  isRemovingStaff = false;
  staffToRemove: StaffPermissionRow | null = null;

  abrirAddStaffModal(): void {
    this.showAddStaffModal = true;
    this.staffTargetControl.reset('');
    this.staffCargoControl.reset('');
    this.staffMngAgendaControl.setValue(false);
    this.staffEditEventControl.setValue(false);
    this.staffMngStaffControl.setValue(false);
  }

  fecharAddStaffModal(): void {
    this.showAddStaffModal = false;
  }

  adicionarStaff(): void {
    if (!this.evento) return;
    const targetValue = this.staffTargetControl.value?.trim();
    if (!targetValue) return;

    const isId = /^\d+$/.test(targetValue);

    const payload: AddStaffPayload = {
      mngAgenda: !!this.staffMngAgendaControl.value,
      editEvent: !!this.staffEditEventControl.value,
      mngStaff: !!this.staffMngStaffControl.value,
      cargo: this.staffCargoControl.value?.trim() || ''
    };

    if (isId) {
      payload.userId = parseInt(targetValue, 10);
    } else {
      payload.email = targetValue;
    }

    this.isAddingStaff = true;
    this.eventService.addEventStaff(this.evento.id, payload).subscribe({
      next: () => {
        this.isAddingStaff = false;
        this.fecharAddStaffModal();
        this.loadEvent(this.evento!.id);
        this.loadStaffPermissions();
      },
      error: () => {
        this.isAddingStaff = false;
        alert('Erro ao adicionar membro à equipe. Verifique os dados e tente novamente.');
      }
    });
  }

  abrirRemoveStaffModal(staff: StaffPermissionRow): void {
    this.staffToRemove = staff;
    this.showRemoveStaffModal = true;
  }

  fecharRemoveStaffModal(): void {
    this.showRemoveStaffModal = false;
    this.staffToRemove = null;
  }

  removerStaff(): void {
    if (!this.evento || !this.staffToRemove) return;
    this.isRemovingStaff = true;

    this.eventService.removeEventStaff(this.evento.id, this.staffToRemove.userId).subscribe({
      next: () => {
        this.isRemovingStaff = false;
        this.fecharRemoveStaffModal();
        this.loadEvent(this.evento!.id);
        this.loadStaffPermissions();
      },
      error: () => {
        this.isRemovingStaff = false;
        alert('Erro ao remover membro da equipe.');
      }
    });
  }

  salvarStaff(staff: StaffPermissionRow): void {
    if (!this.evento) return;

    const payload = {
      mngAgenda: !!staff.mngAgenda,
      editEvent: !!staff.editEvent,
      mngStaff: !!staff.mngStaff,
      cargo: staff.cargo?.trim() || ''
    };

    staff.isSaving = true;

    this.eventService.updateEventStaff(this.evento.id, staff.userId, payload).subscribe({
      next: () => {
        staff.isSaving = false;

        // update main event staffs array so that the basic view updates
        const evStaff = this.evento!.staffs.find(s => s.userId === staff.userId);
        if (evStaff) evStaff.cargo = payload.cargo;

        // update local string array of permissions
        staff.permissions = [];
        if (payload.mngAgenda) staff.permissions.push('mngagenda');
        if (payload.editEvent) staff.permissions.push('editevent');
        if (payload.mngStaff) staff.permissions.push('mngstaff');

        // Show temporary success feedback in UI could be done via a toast, 
        // but for now relying on the state update is enough.
      },
      error: () => {
        staff.isSaving = false;
        alert('Erro ao salvar permissões do membro da equipe.');
      }
    });
  }


  buscarNovoTitularAdmin(): void {
    const targetValue = this.transferTargetControl.value?.trim();
    if (!targetValue) return;

    this.isLoadingNewOwnerReliability = true;
    this.newOwnerReliability = null;

    const isId = /^\d+$/.test(targetValue);

    let obs$;
    if (isId) {
      obs$ = this.userService.getUserReliability(parseInt(targetValue, 10));
    } else {
      obs$ = this.userService.getUserReliability(undefined, targetValue);
    }

    obs$.subscribe({
      next: (res) => {
        this.newOwnerReliability = res;
        this.isLoadingNewOwnerReliability = false;
      },
      error: () => {
        this.isLoadingNewOwnerReliability = false;
      }
    });
  }

  enviarTransferencia(isAdminForce: boolean): void {
    if (!this.evento) return;
    const targetValue = this.transferTargetControl.value?.trim();
    if (!targetValue) return;

    const isId = /^\d+$/.test(targetValue);

    const payload: any = {
      reason: isAdminForce ? (this.transferReasonControl.value?.trim() || '') : 'Transferência solicitada pelo proprietário'
    };

    if (isId) {
      payload.targetUserId = parseInt(targetValue, 10);
    } else {
      payload.targetEmail = targetValue;
    }

    if (isAdminForce) {
      this.pendingTransferPayload = payload;
      this.pendingTransferIsAdmin = true;
      this.showConfirmTransferDialog = true;
    } else {
      this.pendingTransferPayload = payload;
      this.pendingTransferIsAdmin = false;
      this.showConfirmTransferDialog = true;
    }
  }

  fecharConfirmTransferDialog(): void {
    this.showConfirmTransferDialog = false;
    this.pendingTransferPayload = null;
  }

  confirmarTransferencia(): void {
    if (!this.evento || !this.pendingTransferPayload) return;

    this.isTransferring = true;
    this.eventService.transferEventOwnership(this.evento.id, this.pendingTransferPayload).subscribe({
      next: () => {
        this.isTransferring = false;
        this.fecharConfirmTransferDialog();
        this.fecharDialogTransferencia();
        this.fecharDialogVerTitularidade();
        if (this.evento) {
          this.loadEvent(this.evento.id);
        }
      },
      error: () => {
        this.isTransferring = false;
        // error handling could be added here
      }
    });
  }

  private userIsEventStaff(event: Event): boolean {
    const loggedUserId = this.userService.getUser()?.id;

    if (!loggedUserId) {
      return false;
    }

    return event.staffs?.some((staff) => staff.userId === loggedUserId) ?? false;
  }


  private buildSchedulePayload(): EventSchedulePayload {
    const startDateVal = this.scheduleForm.get('startDate')?.value as Date | null;
    const isSingleDay = this.scheduleForm.get('isSingleDay')?.value;
    const endDateVal = isSingleDay
      ? startDateVal
      : (this.scheduleForm.get('endDate')?.value as Date | null);

    const startTime = this.scheduleForm.get('startTime')?.value as string;
    const endTime = this.scheduleForm.get('endTime')?.value as string;

    const newStartingDatetime = this.combineDateAndTime(startDateVal, startTime ? `${startTime}:00` : null);
    const newEndingDatetime = this.combineDateAndTime(endDateVal, endTime ? `${endTime}:00` : null);

    return {
      newStartingDatetime: newStartingDatetime || '',
      newEndingDatetime: newEndingDatetime || ''
    };
  }

  private patchScheduleForm(event: Event): void {
    if (!event.startingDatetime || !event.endingDatetime) return;

    const [startDate, startTime] = event.startingDatetime.split('T');
    const [endDate, endTime] = event.endingDatetime.split('T');
    const isSingleDay = startDate === endDate;

    this.scheduleForm.patchValue({
      startDate: new Date(startDate + 'T00:00:00'),
      startTime: startTime.substring(0, 5),
      endDate: new Date(endDate + 'T00:00:00'),
      endTime: endTime.substring(0, 5),
      isSingleDay: isSingleDay
    });
  }

  private updateEventSeo(event: Event): void {
    this.seoService.updateMetaTags(
      `${event.eventName} - BraFurries`,
      event.description || `Veja detalhes de ${event.eventName}, evento cadastrado na BraFurries.`,
      event.eventLogoUrl || undefined
    );
  }

  private hasScheduleChanged(schedulePayload: EventSchedulePayload): boolean {
    return this.evento?.startingDatetime !== schedulePayload.newStartingDatetime
      || this.evento?.endingDatetime !== schedulePayload.newEndingDatetime;
  }

  private combineDateAndTime(date: Date | null, time: string | null): string | null {
    if (!date || !time) {
      return null;
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}T${time}`;
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

  private buildTimeOptions(): { label: string; value: string }[] {
    const options: { label: string; value: string }[] = [];

    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 30) {
        const value = `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
        options.push({ label: value, value });
      }
    }

    return options;
  }
}
