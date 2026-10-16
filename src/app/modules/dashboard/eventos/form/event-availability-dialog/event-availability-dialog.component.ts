import { Component, Inject, ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EventAvailabilityResponse } from '../../../../../core/services/event.service';

export interface EventAvailabilityDialogData {
  isEvent: boolean;
  type: 'critical' | 'strong' | 'warning';
  title: string;
  message: string;
  availability: EventAvailabilityResponse;
  localeAbbrev?: string;
  formCity?: string;
}

@Component({
  selector: 'app-event-availability-dialog',
  standalone: false,
  templateUrl: './event-availability-dialog.component.html',
  styleUrls: ['./event-availability-dialog.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class EventAvailabilityDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<EventAvailabilityDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EventAvailabilityDialogData
  ) {}

  formatAvailabilityEventDate(value: string, endingValue?: string): string {
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    const startDateStr = parsedDate.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    if (!endingValue) {
      return startDateStr;
    }

    const parsedEndingDate = new Date(endingValue);
    if (Number.isNaN(parsedEndingDate.getTime())) {
      return startDateStr;
    }

    const isSameDay = parsedDate.toDateString() === parsedEndingDate.toDateString();

    if (isSameDay) {
      const endTimeStr = parsedEndingDate.toLocaleString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${startDateStr} - ${endTimeStr}`;
    }

    const isSameYear = parsedDate.getFullYear() === parsedEndingDate.getFullYear();
    const isSameMonth = parsedDate.getMonth() === parsedEndingDate.getMonth() && isSameYear;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    const startDay = pad(parsedDate.getDate());
    const startMonth = pad(parsedDate.getMonth() + 1);
    const startYear = parsedDate.getFullYear();
    
    const endDay = pad(parsedEndingDate.getDate());
    const endMonth = pad(parsedEndingDate.getMonth() + 1);
    const endYear = parsedEndingDate.getFullYear();

    if (isSameMonth) {
      return `${startDay} - ${endDay}/${startMonth}/${startYear}`;
    }
    
    if (isSameYear) {
      return `${startDay}/${startMonth} - ${endDay}/${endMonth}/${startYear}`;
    }
    
    return `${startDay}/${startMonth}/${startYear} - ${endDay}/${endMonth}/${endYear}`;
  }

  get isSameDayConflict(): boolean {
    if (!this.data.availability.nearbyEvents?.length) return false;
    const reqDate = this.data.availability.date;
    return this.data.availability.nearbyEvents.some(e => e.date.startsWith(reqDate));
  }

  isNearbyEventOfficial(type: string): boolean {
    const normalized = type
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return normalized.includes('evento');
  }
}
