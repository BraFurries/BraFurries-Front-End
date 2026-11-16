import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { AdminRecordBlacklist, AdminService } from '../../../../../core/services/admin.service';

@Component({
  selector: 'app-admin-records',
  standalone: false,
  templateUrl: './admin-records.component.html'
})
export class AdminRecordsComponent implements OnInit, OnDestroy {
  games: AdminRecordBlacklist['games'] = [];
  nameInput = '';
  removingId: number | null = null;
  loading = true;
  saving = false;
  error = '';
  success = '';
  private readonly destroyed$ = new Subject<void>();

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.admin.getRecordBlacklist().pipe(takeUntil(this.destroyed$)).subscribe({
      next: data => {
        this.games = data.games;
        this.loading = false;
      },
      error: () => {
        this.error = 'Não foi possível consultar a blacklist global.';
        this.loading = false;
      }
    });
  }

  add(): void {
    const name = this.nameInput.trim();
    if (this.loading || this.saving || !name || name.length > 50) return;
    this.error = '';
    this.success = '';
    this.saving = true;
    this.admin.addRecordBlacklist(name).pipe(takeUntil(this.destroyed$)).subscribe({
      next: data => {
        this.games = data.games;
        this.nameInput = '';
        this.saving = false;
        this.success = 'Jogo adicionado à blacklist global. O Coddy atualiza a lista em até 10 segundos.';
      },
      error: error => {
        this.saving = false;
        this.error = error?.status === 409 ? 'Este jogo já está bloqueado globalmente.'
          : 'Não foi possível adicionar o jogo.';
      }
    });
  }

  remove(gameId: number): void {
    if (this.loading || this.saving || this.removingId !== gameId) return;
    this.error = '';
    this.success = '';
    this.saving = true;
    this.admin.removeRecordBlacklist(gameId).pipe(takeUntil(this.destroyed$)).subscribe({
      next: data => {
        this.games = data.games;
        this.removingId = null;
        this.saving = false;
        this.success = 'Jogo removido da blacklist global. O Coddy atualiza a lista em até 10 segundos.';
      },
      error: () => {
        this.saving = false;
        this.error = 'Não foi possível remover o jogo.';
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}
