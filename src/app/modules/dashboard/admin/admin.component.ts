import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import { UserPermissionsService } from '../../../core/services/user-permissions.service';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-admin',
  standalone: false,
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit, OnDestroy {
  isGlobalAdmin = false;
  isPermissionsOwner = false;
  canManagePartners = false;

  private readonly destroyed$ = new Subject<void>();
  private lastCheckedUserId: number | null = null;

  constructor(
    private readonly userService: UserService,
    private readonly permissions: UserPermissionsService,
    private readonly access: PlatformAccessService
  ) {}

  ngOnInit(): void {
    this.userService.user$.pipe(takeUntil(this.destroyed$)).subscribe(user => {
      this.isGlobalAdmin = this.permissions.isAdmin(user);
      this.canManagePartners = this.isGlobalAdmin;
      if ((user?.id ?? null) === this.lastCheckedUserId) return;
      this.lastCheckedUserId = user?.id ?? null;
      this.isPermissionsOwner = false;
      if (!user) return;

      const requestedFor = user.id;
      this.access.myAccess().pipe(takeUntil(this.destroyed$)).subscribe({
        next: result => {
          if (requestedFor !== this.lastCheckedUserId) return;
          this.isPermissionsOwner = result.enabled && result.owner;
          this.canManagePartners = this.isGlobalAdmin || this.isPermissionsOwner ||
            (result.enabled && result.permissions.includes('PARTNERS_MANAGE'));
        },
        error: () => {
          if (requestedFor === this.lastCheckedUserId) {
            this.isPermissionsOwner = false;
            this.canManagePartners = this.isGlobalAdmin;
          }
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}
