import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminUserItem, AdminUserRole, AdminUserStatus, Pagination } from '../../../../../shared/models/api/admin/admin';
import { AdminUsersListStateService, AdminUsersListStatus } from './admin-users-list-state.service';

@Component({
  selector: 'app-admin-usuarios',
  standalone: false,
  templateUrl: './usuarios.component.html',
  styleUrls: []
})
export class AdminUsersComponent implements OnInit {
  users: AdminUserItem[] = [];
  pagination: Pagination | null = null;
  search = '';
  status: AdminUsersListStatus = '';
  role: AdminUserRole | '' = '';
  pageInput = 1;
  loading = true;
  errorMessage = '';

  constructor(
    private adminService: AdminService,
    private listState: AdminUsersListStateService
  ) { }

  ngOnInit(): void {
    const savedState = this.listState.restore();
    if (savedState) {
      this.search = savedState.search;
      this.status = savedState.status;
      this.role = savedState.role;
      this.loadUsers(savedState.page, savedState.pageSize);
      return;
    }

    this.loadUsers(1);
  }

  loadUsers(page = this.pagination?.page ?? 1, pageSize = this.pagination?.pageSize ?? 20): void {
    const normalizedPage = Math.max(1, Math.trunc(page || 1));
    const normalizedPageSize = Math.min(100, Math.max(1, Math.trunc(pageSize || 20)));
    this.search = this.search.trim();

    this.listState.save({
      search: this.search,
      status: this.status,
      role: this.role,
      page: normalizedPage,
      pageSize: normalizedPageSize
    });

    this.loading = true;
    this.errorMessage = '';

    this.adminService.getUsers({
      page: normalizedPage,
      pageSize: normalizedPageSize,
      search: this.search,
      status: this.status,
      role: this.role
    }).subscribe({
      next: (response) => {
        if (response.pagination.totalPages > 0 && normalizedPage > response.pagination.totalPages) {
          this.loadUsers(response.pagination.totalPages, normalizedPageSize);
          return;
        }

        this.users = response.items;
        this.pagination = response.pagination;
        this.pageInput = response.pagination.page;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar os usuários.';
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    this.loadUsers(1);
  }

  firstPage(): void {
    if (this.pagination && this.pagination.page > 1) {
      this.loadUsers(1);
    }
  }

  previousPage(): void {
    if (this.pagination && this.pagination.page > 1) {
      this.loadUsers(this.pagination.page - 1);
    }
  }

  goToPage(page: number): void {
    if (!this.pagination) return;

    const totalPages = Math.max(this.pagination.totalPages, 1);
    const numericPage = Number(page);
    const target = Number.isFinite(numericPage)
      ? Math.min(totalPages, Math.max(1, Math.trunc(numericPage)))
      : this.pagination.page;

    this.pageInput = target;
    if (target !== this.pagination.page) {
      this.loadUsers(target);
    }
  }

  nextPage(): void {
    if (this.pagination && this.pagination.page < this.pagination.totalPages) {
      this.loadUsers(this.pagination.page + 1);
    }
  }

  lastPage(): void {
    if (this.pagination && this.pagination.totalPages > 0 && this.pagination.page < this.pagination.totalPages) {
      this.loadUsers(this.pagination.totalPages);
    }
  }

  getStatusLabel(status: AdminUserStatus): string {
    return {
      active: 'Ativo',
      muted: 'Mutado',
      banned: 'Banido'
    }[status];
  }

  getRoleLabel(role: AdminUserRole): string {
    return {
      member: 'Membro',
      supporter: 'Apoiador',
      moderator: 'Moderador',
      admin: 'Administrador'
    }[role];
  }

  getUserAvatar(user: AdminUserItem): string {
    return user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  }
}
