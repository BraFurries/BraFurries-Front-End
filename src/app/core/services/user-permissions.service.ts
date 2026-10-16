import { Injectable } from '@angular/core';
import { User } from '../../shared/models/user';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class UserPermissionsService {
  constructor(private userService: UserService) {}

  isAdmin(user: User | null = this.userService.getUser()): boolean {
    return this.hasPermissionFragment('admin', user);
  }

  hasPermissionFragment(fragment: string, user: User | null = this.userService.getUser()): boolean {
    if (!fragment || !user) {
      return false;
    }

    const normalizedFragment = this.normalize(fragment);
    const entries = [...(user.roles ?? []), ...(user.permissions ?? [])];

    return entries.some((entry) => this.normalize(entry).includes(normalizedFragment));
  }

  private normalize(value: string | null | undefined): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }
}
