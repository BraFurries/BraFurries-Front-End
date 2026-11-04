import { Component } from '@angular/core';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import { PlatformAccessComponent } from '../commerce/commerce-access.component';

/** Reuses the audited permission editor without maintaining a second grant UI. */
@Component({
  selector: 'app-admin-permissions',
  standalone: false,
  templateUrl: '../commerce/commerce-access.component.html'
})
export class AdminPermissionsComponent extends PlatformAccessComponent {
  constructor(service: PlatformAccessService) {
    super(service);
    this.isPermissionsManagementPage = true;
  }
}
