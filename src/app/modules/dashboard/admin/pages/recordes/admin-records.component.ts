import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  AdminRecordBlacklist, AdminRecordGuild, AdminService
} from '../../../../../core/services/admin.service';

@Component({
  selector: 'app-admin-records',
  standalone: false,
  templateUrl: './admin-records.component.html'
})
export class AdminRecordsComponent implements OnInit, OnDestroy {
  guilds: AdminRecordGuild[] = [];
  selectedGuild: AdminRecordGuild | null = null;
  selectedKey = '';
  games: AdminRecordBlacklist['games'] = [];
  nameInput = '';
  removingId: number | null = null;
  loadingGuilds = true;
  loadingGames = false;
  saving = false;
  error = '';
  success = '';
  private generation = 0;
  private readonly destroyed$ = new Subject<void>();

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.admin.getRecordGuilds().pipe(takeUntil(this.destroyed$)).subscribe({
      next: guilds => {
        this.guilds = guilds;
        this.loadingGuilds = false;
        if (guilds.length === 1) {
          this.selectedKey = this.toKey(guilds[0]);
          this.selectGuild();
        }
      },
      error: () => {
        this.error = 'Não foi possível carregar as redes Discord disponíveis.';
        this.loadingGuilds = false;
      }
    });
  }

  toKey(guild: AdminRecordGuild): string {
    return guild.communityId + ':' + guild.guildId;
  }

  selectGuild(): void {
    const generation = ++this.generation;
    this.selectedGuild = this.guilds.find(g => this.toKey(g) === this.selectedKey) ?? null;
    this.games = [];
    this.nameInput = '';
    this.removingId = null;
    this.error = '';
    this.success = '';
    this.saving = false;
    if (!this.selectedGuild) return;
    const selected = this.selectedGuild;
    this.loadingGames = true;
    this.admin.getRecordBlacklist(selected.communityId, selected.guildId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: data => {
          if (generation !== this.generation) return;
          this.games = data.games;
          this.loadingGames = false;
        },
        error: () => {
          if (generation !== this.generation) return;
          this.error = 'Não foi possível consultar a blacklist desta rede.';
          this.loadingGames = false;
        }
      });
  }

  add(): void {
    const guild = this.selectedGuild;
    const name = this.nameInput.trim();
    if (!guild || this.saving || this.loadingGames || !name || name.length > 50) return;
    this.error = '';
    this.success = '';
    this.saving = true;
    const generation = this.generation;
    this.admin.addRecordBlacklist(guild.communityId, guild.guildId, name)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: data => {
          if (generation !== this.generation) return;
          this.games = data.games;
          this.nameInput = '';
          this.saving = false;
          this.success = 'Jogo adicionado. O Coddy atualiza a blacklist automaticamente em até 10 segundos.';
        },
        error: error => {
          if (generation !== this.generation) return;
          this.saving = false;
          this.error = error?.status === 409 ? 'Este jogo já está na blacklist.'
            : 'Não foi possível adicionar o jogo.';
        }
      });
  }

  remove(gameId: number): void {
    const guild = this.selectedGuild;
    if (!guild || this.saving || this.loadingGames || this.removingId !== gameId) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    const generation = this.generation;
    this.admin.removeRecordBlacklist(guild.communityId, guild.guildId, gameId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: data => {
          if (generation !== this.generation) return;
          this.games = data.games;
          this.removingId = null;
          this.saving = false;
          this.success = 'Jogo removido. O Coddy atualiza a blacklist automaticamente em até 10 segundos.';
        },
        error: () => {
          if (generation !== this.generation) return;
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
