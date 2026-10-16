import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { of } from 'rxjs';
import { EventService, ManagedEventSummary, PaginatedResponse, PendingApprovalEvent } from '../../../../core/services/event.service';
import { UserPermissionsService } from '../../../../core/services/user-permissions.service';
import { UserService } from '../../../../core/services/user.service';
import { SeoService } from '../../../../core/services/seo-service.service';

import { GerenciamentoComponent } from './gerenciamento.component';

describe('GerenciamentoComponent', () => {
  let component: GerenciamentoComponent;
  let fixture: ComponentFixture<GerenciamentoComponent>;
  let eventService: jasmine.SpyObj<EventService>;
  let userPermissionsService: jasmine.SpyObj<UserPermissionsService>;
  let userService: jasmine.SpyObj<UserService>;
  let seoService: jasmine.SpyObj<SeoService>;

  beforeEach(async () => {
    eventService = jasmine.createSpyObj<EventService>('EventService', [
      'getPendingApprovalEvents', 'getPartnerEvents', 'getCommonEvents', 'approveEvent',
      'rejectEvent', 'addEventPartner', 'removeEventPartner', 'deleteEvent'
    ]);
    const pendingResponse: PaginatedResponse<PendingApprovalEvent> = { items: [], page: 0, size: 10, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false };
    const managedResponse: PaginatedResponse<ManagedEventSummary> = { items: [], page: 0, size: 10, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false };
    eventService.getPendingApprovalEvents.and.returnValue(of(pendingResponse));
    eventService.getPartnerEvents.and.returnValue(of(managedResponse));
    eventService.getCommonEvents.and.returnValue(of(managedResponse));
    eventService.approveEvent.and.returnValue(of({}));
    eventService.rejectEvent.and.returnValue(of({}));
    eventService.addEventPartner.and.returnValue(of({}));
    eventService.removeEventPartner.and.returnValue(of({}));
    eventService.deleteEvent.and.returnValue(of({}));
    userPermissionsService = jasmine.createSpyObj<UserPermissionsService>('UserPermissionsService', ['isAdmin']);
    userPermissionsService.isAdmin.and.returnValue(false);
    userService = jasmine.createSpyObj<UserService>('UserService', ['getUser']);
    userService.getUser.and.returnValue({ id: 1, name: 'Test', email: 'test@example.com', roles: [], permissions: [] });
    seoService = jasmine.createSpyObj<SeoService>('SeoService', ['updateMetaTags']);

    await TestBed.configureTestingModule({
      declarations: [GerenciamentoComponent],
      imports: [CommonModule],
      providers: [
        {
          provide: UserPermissionsService,
          useValue: userPermissionsService
        },
        {
          provide: EventService,
          useValue: eventService
        },
        {
          provide: UserService,
          useValue: userService
        },
        {
          provide: SeoService,
          useValue: seoService
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GerenciamentoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load pending, partner and common events scoped by logged user when not admin', () => {
    const filters = { userId: 1, page: 0, size: 10 };
    expect(eventService.getPendingApprovalEvents).toHaveBeenCalledWith(filters);
    expect(eventService.getPartnerEvents).toHaveBeenCalledWith(filters);
    expect(eventService.getCommonEvents).toHaveBeenCalledWith(filters);
  });
});
