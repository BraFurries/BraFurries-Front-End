import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { PlatformAccessService } from '../../../../../core/services/platform-access.service';
import {
  AdminStorageService, StorageBucket, StorageObjectPage, StoredObject,
  StorageReferenceStatus
} from '../../../../../core/services/admin-storage.service';

@Component({
  selector: 'app-admin-storage',
  standalone: false,
  templateUrl: './admin-storage.component.html'
})
export class AdminStorageComponent implements OnInit, OnDestroy {
  owner = false;
  checkingAccess = true;
  loading = false;
  inspecting = false;
  deleting = false;
  bucket: StorageBucket = 'PRIVATE';
  prefix = 'commerce/';
  exactKey = '';
  page: StorageObjectPage | null = null;
  selected: StoredObject | null = null;
  errorMessage = '';
  successMessage = '';
  private cursors: (string | null)[] = [null];
  pageIndex = 0;
  private loadSequence = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly access: PlatformAccessService,
    private readonly storage: AdminStorageService
  ) {}

  ngOnInit(): void {
    this.access.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.owner = result.enabled && result.owner;
        this.checkingAccess = false;
        if (this.owner) this.applyFilters();
      },
      error: () => {
        this.checkingAccess = false;
        this.errorMessage = 'Não foi possível validar o acesso administrativo.';
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  changeBucket(scope: StorageBucket): void {
    if (!this.owner) return;
    this.bucket = scope;
    this.prefix = '';
    this.applyFilters();
  }

  applyFilters(): void {
    if (!this.owner) return;
    this.cursors = [null];
    this.pageIndex = 0;
    this.loadPage();
  }

  nextPage(): void {
    if (!this.owner || !this.page?.nextCursor || this.loading) return;
    this.cursors = [...this.cursors.slice(0, this.pageIndex + 1), this.page.nextCursor];
    this.pageIndex++;
    this.loadPage();
  }

  previousPage(): void {
    if (!this.owner || this.pageIndex === 0 || this.loading) return;
    this.pageIndex--;
    this.loadPage();
  }

  loadPage(): void {
    if (!this.owner) return;
    const seq = ++this.loadSequence;
    this.loading = true;
    this.selected = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.storage.list(this.bucket, this.prefix.trim(), this.cursors[this.pageIndex], 50)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: result => {
          if (seq !== this.loadSequence) return;
          this.loading = false;
          this.page = result;
        },
        error: () => {
          if (seq !== this.loadSequence) return;
          this.loading = false;
          this.page = null;
          this.errorMessage = 'Não foi possível consultar o R2. Confira as credenciais do bucket e o prefixo.';
        }
      });
  }

  inspect(item: StoredObject): void {
    this.inspectKey(item.key);
  }

  inspectExact(): void {
    this.inspectKey(this.exactKey.trim());
  }

  private inspectKey(key: string): void {
    if (!this.owner || this.inspecting || !key) return;
    this.inspecting = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.selected = null;
    this.storage.inspect(this.bucket, key).pipe(takeUntil(this.destroy$)).subscribe({
      next: object => {
        this.inspecting = false;
        this.selected = object;
        this.exactKey = object.key;
      },
      error: () => {
        this.inspecting = false;
        this.errorMessage = 'Objeto não encontrado ou impossível de consultar no R2.';
      }
    });
  }

  removeOrphan(): void {
    const object = this.selected;
    if (!this.owner || this.deleting || !object?.deletable ||
        this.bucket !== 'PRIVATE' || !object.etag) return;
    if (!window.confirm(
      'Excluir DEFINITIVAMENTE este arquivo privado do R2? ' +
      'Somente continue se você conferiu a chave e a ausência de vínculos: ' + object.key
    )) return;
    this.deleting = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.storage.deleteOrphan(this.bucket, object.key, object.etag)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.deleting = false;
          this.selected = null;
          this.exactKey = '';
          this.loadPage();
          this.successMessage = 'Arquivo órfão excluído e ausência confirmada no R2.';
        },
        error: () => {
          this.deleting = false;
          this.errorMessage = 'Exclusão não confirmada. O objeto pode ter mudado, ' +
            'estar vinculado, ser recente ou não estar disponível. Consulte-o novamente.';
        }
      });
  }

  statusLabel(status: StorageReferenceStatus): string {
    switch (status) {
      case 'LINKED': return 'Vinculado';
      case 'ORPHAN': return 'Órfão verificado';
      case 'RECENT': return 'Recente · protegido';
      case 'UNVERIFIED': return 'Vínculos não verificáveis';
    }
  }

  categoryLabel(category: StoredObject['category']): string {
    switch (category) {
      case 'CONTRACT_DOCUMENT': return 'Documento de contrato';
      case 'ARTWORK_FILE': return 'Arquivo de arte';
      case 'OTHER_PRIVATE': return 'Outro arquivo privado';
      case 'PUBLIC_MEDIA': return 'Mídia pública';
    }
  }
}
