import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AdminUserRole } from '../../../../../shared/models/api/admin/admin';

export type AdminUsersListStatus = '' | 'active' | 'banned';

export interface AdminUsersListState {
  search: string;
  status: AdminUsersListStatus;
  role: AdminUserRole | '';
  page: number;
  pageSize: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminUsersListStateService {
  private readonly storageKey = 'brafurries.admin.users.list-state';

  constructor(router: Router) {
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        if (!this.isUsersArea(event.urlAfterRedirects)) {
          this.clear();
        }
      });
  }

  restore(): AdminUsersListState | null {
    const storage = this.storage();
    if (!storage) return null;

    const raw = storage.getItem(this.storageKey);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<AdminUsersListState>;
      const status = parsed.status ?? '';
      const role = parsed.role ?? '';
      const page = Number(parsed.page);
      const pageSize = Number(parsed.pageSize);

      if (
        typeof parsed.search !== 'string' ||
        !['', 'active', 'banned'].includes(status) ||
        !['', 'member', 'supporter', 'moderator', 'admin'].includes(role) ||
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100
      ) {
        this.clear();
        return null;
      }

      return {
        search: parsed.search,
        status: status as AdminUsersListStatus,
        role: role as AdminUserRole | '',
        page,
        pageSize
      };
    } catch {
      this.clear();
      return null;
    }
  }

  save(state: AdminUsersListState): void {
    this.storage()?.setItem(this.storageKey, JSON.stringify(state));
  }

  clear(): void {
    this.storage()?.removeItem(this.storageKey);
  }

  private isUsersArea(url: string): boolean {
    return /\/admin\/usuarios(?:[/?#]|$)/.test(url);
  }

  private storage(): Storage | null {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  }
}
