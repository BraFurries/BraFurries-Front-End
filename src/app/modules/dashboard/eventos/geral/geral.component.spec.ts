import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { EventService } from '../../../../core/services/event.service';
import { UserPermissionsService } from '../../../../core/services/user-permissions.service';

import { GeralComponent } from './geral.component';

describe('GeralComponent', () => {
  let component: GeralComponent;
  let fixture: ComponentFixture<GeralComponent>;
  let eventService: jasmine.SpyObj<EventService>;
  let userPermissionsService: jasmine.SpyObj<UserPermissionsService>;

  beforeEach(async () => {
    eventService = jasmine.createSpyObj<EventService>('EventService', {
      getEventsMinidash: of({
        activeOwnerEvents: 2,
        activeStaffEvents: 3,
        pendingReviewEvents: 4
      }),
      getAdminEventsMinidash: of({
        activeEvents: 5,
        partnerEvents: 6,
        pendingApprovalEvents: 7
      })
    });
    userPermissionsService = jasmine.createSpyObj<UserPermissionsService>('UserPermissionsService', ['isAdmin']);
    userPermissionsService.isAdmin.and.returnValue(false);

    await TestBed.configureTestingModule({
      declarations: [GeralComponent],
      providers: [
        {
          provide: EventService,
          useValue: eventService
        },
        {
          provide: UserPermissionsService,
          useValue: userPermissionsService
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GeralComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load user event minidash when user is not admin', () => {
    expect(eventService.getEventsMinidash).toHaveBeenCalled();
    expect(eventService.getAdminEventsMinidash).not.toHaveBeenCalled();
    expect(component.minidashItems.map((item) => item.value)).toEqual([2, 3, 4]);
  });

  it('should load admin event minidash when user is admin', () => {
    userPermissionsService.isAdmin.and.returnValue(true);
    eventService.getEventsMinidash.calls.reset();
    eventService.getAdminEventsMinidash.calls.reset();

    const adminFixture = TestBed.createComponent(GeralComponent);
    const adminComponent = adminFixture.componentInstance;
    adminFixture.detectChanges();

    expect(eventService.getAdminEventsMinidash).toHaveBeenCalled();
    expect(eventService.getEventsMinidash).not.toHaveBeenCalled();
    expect(adminComponent.minidashItems.map((item) => item.value)).toEqual([5, 6, 7]);
  });
});
