import { Component } from '@angular/core';
import { CommerceAccessService } from '../../../core/services/commerce-access.service';
import { CommerceAccessComponent } from '../commerce/commerce-access.component';

/** Reuses the audited permission editor without maintaining a second grant UI. */
@Component({
  selector: 'app-admin-permissions',
  standalone: false,
  templateUrl: '../commerce/commerce-access.component.html'
})
export class AdminPermissionsComponent extends CommerceAccessComponent {
  constructor(service: CommerceAccessService) {
    super(service);
    this.isPermissionsManagementPage = true;
  }
}
