import { CommonModule } from '@angular/common';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, Subject, throwError } from 'rxjs';

import {
  BackupRestoreOperation,
  BackupRestorePreview,
  BackupSnapshotOperation,
  BackupSettings,
  BackupsResponse,
  ManagedServersService
} from '../../../core/services/managed-servers.service';
import { BackupManagementPanelComponent } from './backup-management-panel.component';

describe('BackupManagementPanelComponent', () => {
  let fixture: ComponentFixture<BackupManagementPanelComponent>;
  let component: BackupManagementPanelComponent;
  let service: jasmine.SpyObj<ManagedServersService>;

  const settings: BackupSettings = {
    periodicEnabled: false,
    frequency: 'weekly'
  };

  const snapshotOperation = (
    overrides: Partial<BackupSnapshotOperation> = {}
  ): BackupSnapshotOperation => ({
    id: 70,
    backupType: 'MANUAL',
    requestedName: 'Snapshot',
    backupId: null,
    status: 'PENDING',
    progressCurrent: 0,
    progressTotal: 4,
    currentStep: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-10-07T05:00:00Z',
    errorCode: null,
    result: null,
    steps: [],
    ...overrides
  });

  const catalog: BackupsResponse = {
    canRestore: true,
    backups: [{
      id: 9,
      name: 'Antes da reforma',
      type: 'MANUAL',
      createdAt: '2026-10-07T04:43:00Z',
      creatorDiscordUserId: '42',
      summary: { roles: 35, channels: 82, permissionOverwrites: 417 }
    }]
  };

  const preview: BackupRestorePreview = {
    backup: catalog.backups[0],
    scope: 'full',
    bot: {
      available: true,
      botTopRole: { id: '999', name: 'Coddy', position: 100 },
      rolesAboveBot: [],
      missingPermissions: []
    },
    plan: {
      roles: { create: 1, update: 34, reuse: 0, ambiguous: 0 },
      channels: { create: 2, update: 80, reuse: 0, unsupported: 0 },
      permissions: { apply: 417 }
    },
    ambiguousRoles: [],
    warnings: [{
      code: 'ROLE_OVERWRITES_ONLY',
      message: 'Somente overwrites de cargos são preservados.'
    }],
    blockers: [],
    ready: true
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<ManagedServersService>('ManagedServersService', [
      'getBackups',
      'getBackupSettings',
      'updateBackupSettings',
      'createBackup',
      'previewBackupRestore',
      'startBackupRestore',
      'getBackupRestoreOperations',
      'getBackupRestoreOperation',
      'watchBackupOperation',
      'getBackupSnapshotOperations',
      'getBackupSnapshotOperation',
      'deleteBackup'
    ]);
    service.getBackups.and.returnValue(of(structuredClone(catalog)));
    service.getBackupSettings.and.returnValue(of(structuredClone(settings)));
    service.getBackupRestoreOperations.and.returnValue(of({ operations: [] }));
    service.getBackupSnapshotOperations.and.returnValue(of({ operations: [] }));
    service.updateBackupSettings.and.returnValue(of(structuredClone(settings)));
    service.previewBackupRestore.and.returnValue(of(structuredClone(preview)));
    service.watchBackupOperation.and.returnValue(of());

    await TestBed.configureTestingModule({
      declarations: [BackupManagementPanelComponent],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: ManagedServersService, useValue: service }]
    }).compileComponents();

    fixture = TestBed.createComponent(BackupManagementPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('guildId', '123');
    fixture.detectChanges();
  });

  it('loads settings, guild-scoped catalog and restore history', () => {
    expect(service.getBackups).toHaveBeenCalledWith('123');
    expect(service.getBackupSettings).toHaveBeenCalledWith('123');
    expect(service.getBackupRestoreOperations).toHaveBeenCalledWith('123');
    expect(service.getBackupSnapshotOperations).toHaveBeenCalledWith('123');
    expect(component.catalog?.backups[0].summary.permissionOverwrites).toBe(417);
    expect(component.settingsDraft?.frequency).toBe('weekly');
  });

  it('keeps recent terminal snapshot and restore compact for three hours', () => {
    const finishedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const completedSnapshot = snapshotOperation({
      id: 91,
      requestedName: 'Automático da semana',
      backupType: 'PERIODIC',
      backupId: 12,
      status: 'SUCCEEDED',
      progressCurrent: 6,
      progressTotal: 6,
      currentStep: 'COMPLETED',
      finishedAt,
      steps: [{
        id: 1,
        code: 'COMPLETED',
        status: 'SUCCEEDED',
        message: 'Snapshot concluído.',
        progressCurrent: 6,
        progressTotal: 6,
        detail: null,
        createdAt: finishedAt
      }]
    });
    const completedRestore: BackupRestoreOperation = {
      id: 92,
      backupId: 12,
      scope: 'full',
      status: 'SUCCEEDED',
      progressCurrent: 10,
      progressTotal: 10,
      currentStep: 'COMPLETED',
      startedAt: finishedAt,
      finishedAt,
      createdAt: finishedAt,
      errorCode: null,
      result: { status: 'SUCCEEDED' },
      steps: [{
        id: 2,
        code: 'COMPLETED',
        status: 'SUCCEEDED',
        message: 'Restauração concluída.',
        progressCurrent: 10,
        progressTotal: 10,
        detail: null,
        createdAt: finishedAt
      }]
    };
    service.getBackupSnapshotOperations.and.returnValue(
      of({ operations: [completedSnapshot] })
    );
    service.getBackupRestoreOperations.and.returnValue(
      of({ operations: [completedRestore] })
    );

    component.load();

    expect(component.selectedSnapshotOperation?.id).toBe(91);
    expect(component.snapshotDetailsExpanded).toBeFalse();
    expect(component.selectedOperation?.id).toBe(92);
    expect(component.restoreDetailsExpanded).toBeFalse();

    component.toggleSnapshotDetails();
    component.toggleRestoreDetails();

    expect(component.snapshotDetailsExpanded).toBeTrue();
    expect(component.restoreDetailsExpanded).toBeTrue();

    component.dismissSnapshotOperation();
    component.dismissRestoreOperation();

    expect(component.selectedSnapshotOperation).toBeUndefined();
    expect(component.selectedOperation).toBeUndefined();

    (component as any).refreshHistory();

    expect(component.selectedSnapshotOperation).toBeUndefined();
    expect(component.selectedOperation).toBeUndefined();
  });

  it('does not surface terminal operation cards after three hours', () => {
    const finishedAt = new Date(
      Date.now() - (3 * 60 * 60 * 1000 + 1)
    ).toISOString();
    const oldSnapshot = snapshotOperation({
      status: 'FAILED',
      finishedAt,
      errorCode: 'old_failure'
    });
    const oldRestore: BackupRestoreOperation = {
      id: 95,
      backupId: 9,
      scope: 'full',
      status: 'SUCCEEDED',
      progressCurrent: 10,
      progressTotal: 10,
      currentStep: 'COMPLETED',
      startedAt: finishedAt,
      finishedAt,
      createdAt: finishedAt,
      errorCode: null,
      result: { status: 'SUCCEEDED' },
      steps: []
    };
    service.getBackupSnapshotOperations.and.returnValue(
      of({ operations: [oldSnapshot] })
    );
    service.getBackupRestoreOperations.and.returnValue(
      of({ operations: [oldRestore] })
    );

    component.load();

    expect(component.selectedSnapshotOperation).toBeUndefined();
    expect(component.selectedOperation).toBeUndefined();
  });

  it('emits dirty state only for unsaved settings', () => {
    const dirty = spyOn(component.dirtyChange, 'emit');
    component.settingsDraft!.frequency = 'daily';

    component.onSettingsChanged();

    expect(component.dirty).toBeTrue();
    expect(dirty).toHaveBeenCalledWith(true);

    component.createName = 'Rascunho de nome';
    component.onCreateNameChanged();
    expect(component.dirty).toBeTrue();
  });

  it('saves only periodic toggle and canonical frequency', () => {
    component.settingsDraft!.periodicEnabled = true;
    component.settingsDraft!.frequency = 'monthly';
    component.onSettingsChanged();

    service.updateBackupSettings.and.returnValue(of({
      periodicEnabled: true,
      frequency: 'monthly'
    }));

    component.saveSettings();

    expect(service.updateBackupSettings).toHaveBeenCalledWith('123', {
      periodicEnabled: true,
      frequency: 'monthly'
    });
    expect(component.dirty).toBeFalse();
  });

  it('reuses the same idempotency key when manual creation is retried after an error', () => {
    service.createBackup.and.returnValue(
      throwError(() => ({ error: { message: 'Coddy offline' } }))
    );
    component.createName = 'Snapshot';
    component.createBackup();

    const firstKey = service.createBackup.calls.mostRecent().args[2];

    const created = {
      ...catalog.backups[0],
      id: 10,
      name: 'Snapshot'
    };
    const done = snapshotOperation({
      backupId: 10,
      status: 'SUCCEEDED',
      progressCurrent: 4,
      progressTotal: 4,
      currentStep: 'SUCCEEDED',
      finishedAt: new Date(Date.now() - 60 * 1000).toISOString()
    });
    service.createBackup.and.returnValue(of(done));
    service.getBackups.and.returnValue(of({
      canRestore: true,
      backups: [created]
    }));
    service.getBackupSnapshotOperations.and.returnValue(of({ operations: [done] }));

    component.createBackup();

    expect(service.createBackup.calls.mostRecent().args[2]).toBe(firstKey);
    expect(service.getBackups).toHaveBeenCalledWith('123');
    expect(component.catalog?.backups).toEqual([created]);
    expect(component.selectedSnapshotOperation?.status).toBe('SUCCEEDED');
  });

  it('uses a fresh idempotency key after a known terminal snapshot failure', () => {
    const failed = snapshotOperation({
      status: 'FAILED',
      currentStep: 'FAILED',
      errorCode: 'unexpected_snapshot_failure',
      finishedAt: new Date(Date.now() - 60 * 1000).toISOString()
    });
    spyOn<any>(component, 'newIdempotencyKey')
      .and.returnValues('snapshot-attempt-1', 'snapshot-attempt-2');
    service.createBackup.and.returnValue(of(failed));
    component.createName = 'Snapshot';

    component.createBackup();
    component.createBackup();

    expect(service.createBackup.calls.argsFor(0)[2]).toBe('snapshot-attempt-1');
    expect(service.createBackup.calls.argsFor(1)[2]).toBe('snapshot-attempt-2');
  });

  it('reloads the canonical catalog after the previous manual snapshot is replaced', () => {
    const created = {
      ...catalog.backups[0],
      id: 10,
      name: 'Newest'
    };
    const done = snapshotOperation({
      requestedName: 'Newest',
      backupId: 10,
      status: 'SUCCEEDED',
      progressCurrent: 4,
      progressTotal: 4,
      currentStep: 'SUCCEEDED',
      finishedAt: new Date(Date.now() - 60 * 1000).toISOString()
    });
    const canonical: BackupsResponse = {
      canRestore: true,
      backups: [created]
    };
    service.createBackup.and.returnValue(of(done));
    service.getBackups.and.returnValue(of(canonical));
    service.getBackupSnapshotOperations.and.returnValue(of({ operations: [done] }));
    component.createName = 'Newest';

    component.createBackup();

    expect(component.catalog?.backups).toEqual([created]);
    expect(component.catalog?.backups.some(item => item.id === 9)).toBeFalse();
  });

  it('does not expose restore interaction to a non-owner', () => {
    component.catalog = { ...structuredClone(catalog), canRestore: false };

    component.openRestore(component.catalog.backups[0]);

    expect(component.selectedBackup).toBeUndefined();
    expect(service.previewBackupRestore).not.toHaveBeenCalled();
  });

  it('explains role creation cooldown and requires acknowledgment before restore', () => {
    component.catalog = structuredClone(catalog);
    component.openRestore(component.catalog.backups[0]);
    component.restoreConfirmed = true;

    fixture.detectChanges();
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('250');
    expect(content).toContain('48 horas');
    expect(content).toContain('1 nova(s) criação(ões) de cargo');
    expect(component.estimatedRoleCreations).toBe(1);
    expect(component.canStartRestore).toBeFalse();

    component.roleLimitAcknowledged = true;
    expect(component.canStartRestore).toBeTrue();

    component.onRestoreScopeChanged();
    expect(component.roleLimitAcknowledged).toBeFalse();
    expect(component.restoreConfirmed).toBeFalse();
  });

  it('does not require role quota acknowledgment for channels-only restore', () => {
    component.catalog = structuredClone(catalog);
    component.openRestore(component.catalog.backups[0]);
    component.restoreScope = 'channels';
    component.onRestoreScopeChanged();
    component.restoreConfirmed = true;

    expect(component.estimatedRoleCreations).toBe(0);
    expect(component.canStartRestore).toBeTrue();
  });

  it('counts explicit CREATE_NEW decisions in the estimated role quota', () => {
    component.catalog = structuredClone(catalog);
    component.openRestore(component.catalog.backups[0]);
    component.restorePreview = {
      ...structuredClone(preview),
      plan: {
        ...structuredClone(preview.plan),
        roles: { create: 2, update: 31, reuse: 0, ambiguous: 1 }
      },
      ambiguousRoles: [{
        backupRoleId: 70,
        backupDiscordId: '700',
        name: 'Staff',
        candidates: [{ id: '701', name: 'Staff', position: 20 }],
        canCreateNew: true
      }]
    };

    component.setDuplicateStrategy('explicit');
    component.setRoleResolution(70, 'CREATE_NEW');
    expect(component.estimatedRoleCreations).toBe(3);

    component.restoreConfirmed = true;
    component.roleLimitAcknowledged = true;
    expect(component.canStartRestore).toBeTrue();

    component.setRoleResolution(70, '701');
    expect(component.estimatedRoleCreations).toBe(2);
    expect(component.roleLimitAcknowledged).toBeFalse();
    expect(component.canStartRestore).toBeFalse();
  });

  it('does not expose Backup deletion to a non-owner', () => {
    component.catalog = { ...structuredClone(catalog), canRestore: false };

    component.requestDelete(component.catalog.backups[0]);

    expect(component.deleteCandidate).toBeUndefined();
    expect(service.deleteBackup).not.toHaveBeenCalled();
  });

  it('blocks restore while the same Backup is being deleted', () => {
    component.catalog = structuredClone(catalog);
    component.openRestore(component.catalog.backups[0]);
    component.restorePreview = structuredClone(preview);
    component.restoreConfirmed = true;
    component.roleLimitAcknowledged = true;

    expect(component.canStartRestore).toBeTrue();

    component.deleteBusyId = 9;

    expect(component.canStartRestore).toBeFalse();
  });

  it('deletes a Backup as owner and reloads the canonical catalog', () => {
    component.catalog = structuredClone(catalog);
    const emptyCatalog: BackupsResponse = {
      canRestore: true,
      backups: []
    };
    service.deleteBackup.and.returnValue(of(void 0));
    service.getBackups.and.returnValue(of(emptyCatalog));

    component.requestDelete(component.catalog.backups[0]);
    component.confirmDelete();

    expect(service.deleteBackup).toHaveBeenCalledWith('123', 9);
    expect(component.catalog?.backups).toEqual([]);
    expect(component.deleteCandidate).toBeUndefined();
    expect(component.deleteMessage).toContain('excluído');
  });

  it('keeps delete success when only catalog refresh fails', () => {
    component.catalog = structuredClone(catalog);
    service.deleteBackup.and.returnValue(of(void 0));
    service.getBackups.and.returnValue(
      throwError(() => ({ error: { message: 'refresh failed' } }))
    );

    component.requestDelete(component.catalog.backups[0]);
    component.confirmDelete();

    expect(service.deleteBackup).toHaveBeenCalledWith('123', 9);
    expect(component.catalog?.backups).toEqual([]);
    expect(component.deleteCandidate).toBeUndefined();
    expect(component.deleteMessage).toContain('excluído');
    expect(component.deleteError).toContain('foi excluído');
  });

  it('requires explicit duplicate resolution before destructive confirmation', () => {
    component.catalog = structuredClone(catalog);
    component.openRestore(component.catalog.backups[0]);

    component.restorePreview = {
      ...structuredClone(preview),
      ready: false,
      plan: {
        ...structuredClone(preview.plan),
        roles: { create: 0, update: 34, reuse: 0, ambiguous: 1 }
      },
      blockers: [{
        code: 'ROLE_RESOLUTION_REQUIRED',
        message: 'Resolva cargos duplicados',
        count: 1
      }],
      ambiguousRoles: [{
        backupRoleId: 70,
        backupDiscordId: '700',
        name: 'Staff',
        candidates: [
          { id: '701', name: 'Staff', position: 20 },
          { id: '702', name: 'Staff', position: 19 }
        ],
        canCreateNew: true
      }]
    };

    component.restoreConfirmed = true;
    expect(component.canStartRestore).toBeFalse();

    component.setDuplicateStrategy('explicit');
    component.setRoleResolution(70, 'CREATE_NEW');
    component.restoreConfirmed = true;
    component.roleLimitAcknowledged = true;

    expect(component.resolutionComplete).toBeTrue();
    expect(component.canStartRestore).toBeTrue();
  });

  it('does not allow destructive duplicate merge in permissions-only restore', () => {
    component.catalog = structuredClone(catalog);
    component.openRestore(component.catalog.backups[0]);
    component.restoreScope = 'permissions';
    component.restorePreview = {
      ...structuredClone(preview),
      scope: 'permissions',
      ambiguousRoles: [{
        backupRoleId: 70,
        backupDiscordId: '700',
        name: 'Staff',
        candidates: [
          { id: '701', name: 'Staff', position: 20 },
          { id: '702', name: 'Staff', position: 19 }
        ],
        canCreateNew: false
      }],
      blockers: [{
        code: 'ROLE_RESOLUTION_REQUIRED',
        message: 'Resolva cargos duplicados',
        count: 1
      }],
      ready: false
    };

    component.setDuplicateStrategy('merge');
    expect(component.duplicateStrategy).toBe('');

    component.setDuplicateStrategy('explicit');
    component.setRoleResolution(70, 'CREATE_NEW');
    expect(component.roleResolutions['70']).toBeUndefined();

    component.setRoleResolution(70, '701');
    component.restoreConfirmed = true;
    expect(component.resolutionComplete).toBeTrue();
    expect(component.canStartRestore).toBeTrue();
  });

  it('shows partial structured result without treating it as full success', () => {
    component.catalog = structuredClone(catalog);
    component.openRestore(component.catalog.backups[0]);
    component.restorePreview = structuredClone(preview);
    component.restoreConfirmed = true;
    component.roleLimitAcknowledged = true;

    const partial: BackupRestoreOperation = {
      id: 50,
      backupId: 9,
      scope: 'full',
      status: 'PARTIAL',
      progressCurrent: 12,
      progressTotal: 12,
      currentStep: 'PARTIAL',
      steps: [],
      startedAt: '2026-10-07T05:00:00Z',
      finishedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      createdAt: '2026-10-07T05:00:00Z',
      errorCode: null,
      result: {
        status: 'PARTIAL',
        roles: { created: 1, updated: 34, reused: 0, skipped: 0, failed: 0 },
        channels: { created: 2, updated: 78, reused: 0, skipped: 0, failed: 2 },
        permissions: { created: 0, updated: 411, reused: 0, skipped: 0, failed: 6 },
        warnings: [],
        failures: [{ domain: 'channels', item: 'x', code: 'CHANNEL_EDIT_FAILED' }]
      }
    };
    service.startBackupRestore.and.returnValue(of(partial));
    service.getBackups.and.returnValue(of(structuredClone(catalog)));
    service.getBackupRestoreOperations.and.returnValue(of({ operations: [partial] }));

    component.startRestore();

    expect(component.selectedOperation?.status).toBe('PARTIAL');
    expect(component.selectedOperation?.result?.channels?.failed).toBe(2);
  });

  it('uses a fresh idempotency key after a known terminal restore', () => {
    component.catalog = structuredClone(catalog);
    component.openRestore(component.catalog.backups[0]);
    component.restorePreview = structuredClone(preview);
    component.restoreConfirmed = true;
    component.roleLimitAcknowledged = true;

    const failed: BackupRestoreOperation = {
      id: 51,
      backupId: 9,
      scope: 'full',
      status: 'FAILED',
      progressCurrent: 3,
      progressTotal: 12,
      currentStep: 'FAILED',
      steps: [],
      startedAt: '2026-10-07T05:00:00Z',
      finishedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      createdAt: '2026-10-07T05:00:00Z',
      errorCode: 'restore_preflight_blocked',
      result: { status: 'FAILED' }
    };
    spyOn<any>(component, 'newIdempotencyKey')
      .and.returnValues('restore-attempt-1', 'restore-attempt-2');
    service.startBackupRestore.and.returnValue(of(failed));
    service.getBackups.and.returnValue(of(structuredClone(catalog)));
    service.getBackupRestoreOperations.and.returnValue(of({ operations: [failed] }));

    component.startRestore();
    component.startRestore();

    expect(service.startBackupRestore.calls.argsFor(0)[4]).toBe('restore-attempt-1');
    expect(service.startBackupRestore.calls.argsFor(1)[4]).toBe('restore-attempt-2');
  });

  it('surfaces Coddy-offline preview error', () => {
    service.previewBackupRestore.and.returnValue(
      throwError(() => ({ error: { message: 'Coddy indisponível' } }))
    );
    component.catalog = structuredClone(catalog);

    component.openRestore(component.catalog.backups[0]);

    expect(component.previewError).toContain('Coddy indisponível');
    expect(component.restorePreview).toBeUndefined();
  });

  it('ignores a stale guild response after switching guilds', () => {
    const staleCatalog = new Subject<BackupsResponse>();
    service.getBackups.and.callFake(guildId =>
      guildId === '123'
        ? staleCatalog.asObservable()
        : of({ canRestore: false, backups: [] })
    );

    component.guildId = '123';
    component.load();
    component.guildId = '456';
    component.load();

    staleCatalog.next(structuredClone(catalog));
    staleCatalog.complete();

    expect(component.guildId).toBe('456');
    expect(component.catalog?.backups).toEqual([]);
  });

  it('streams a running restore without two-second REST requests', fakeAsync(() => {
    const running: BackupRestoreOperation = {
      id: 80, backupId: 9, scope: 'roles', status: 'RUNNING',
      progressCurrent: 3, progressTotal: 12, currentStep: 'RESTORING_ROLES',
      steps: [], startedAt: '2026-10-07T05:00:00Z', finishedAt: null,
      createdAt: '2026-10-07T05:00:00Z', errorCode: null, result: null
    };
    const done: BackupRestoreOperation = {
      ...running, status: 'PARTIAL', progressCurrent: 6,
      finishedAt: new Date(Date.now()).toISOString(), result: { status: 'PARTIAL' }
    };
    const updates = new Subject<BackupRestoreOperation>();
    service.watchBackupOperation.and.returnValue(updates.asObservable());
    service.getBackups.and.returnValue(of(structuredClone(catalog)));
    service.getBackupRestoreOperations.and.returnValue(of({ operations: [done] }));

    (component as any).startRestorePolling(80);
    expect(service.watchBackupOperation).toHaveBeenCalledWith('123', 'RESTORE', 80);
    updates.next(running);
    tick(5000);
    expect(component.selectedOperation?.status).toBe('RUNNING');
    expect(service.getBackupRestoreOperation).not.toHaveBeenCalled();
    updates.next(done);
    expect(component.selectedOperation?.status).toBe('PARTIAL');
    component.ngOnDestroy();
  }));

  it('makes a fallback request only after two minutes without a terminal state', fakeAsync(() => {
    const running: BackupRestoreOperation = {
      id: 81, backupId: 9, scope: 'roles', status: 'RUNNING',
      progressCurrent: 3, progressTotal: 12, currentStep: 'RESTORING_ROLES',
      steps: [], startedAt: '2026-10-07T05:00:00Z', finishedAt: null,
      createdAt: '2026-10-07T05:00:00Z', errorCode: null, result: null
    };
    const done: BackupRestoreOperation = {
      ...running, status: 'SUCCEEDED', finishedAt: new Date().toISOString(),
      result: { status: 'SUCCEEDED' }
    };
    const updates = new Subject<BackupRestoreOperation>();
    service.watchBackupOperation.and.returnValue(updates.asObservable());
    service.getBackupRestoreOperation.and.returnValue(of(done));
    service.getBackups.and.returnValue(of(structuredClone(catalog)));
    service.getBackupRestoreOperations.and.returnValue(of({ operations: [done] }));

    (component as any).startRestorePolling(81);
    updates.next(running);
    tick(119999);
    expect(service.getBackupRestoreOperation).not.toHaveBeenCalled();
    tick(1);
    expect(service.getBackupRestoreOperation).toHaveBeenCalledTimes(1);
    expect(component.selectedOperation?.status).toBe('SUCCEEDED');
    component.ngOnDestroy();
  }));

  it('keeps the live stream subscribed after a fallback GET fails', fakeAsync(() => {
    const running: BackupRestoreOperation = {
      id: 82, backupId: 9, scope: 'roles', status: 'RUNNING',
      progressCurrent: 3, progressTotal: 12, currentStep: 'ROLE',
      steps: [], startedAt: null, finishedAt: null, createdAt: null,
      errorCode: null, result: null
    };
    const done: BackupRestoreOperation = {
      ...running, status: 'SUCCEEDED', finishedAt: new Date().toISOString()
    };
    const updates = new Subject<BackupRestoreOperation>();
    service.watchBackupOperation.and.returnValue(updates.asObservable());
    service.getBackupRestoreOperation.and.returnValue(
      throwError(() => new Error('Temporary network failure'))
    );
    service.getBackups.and.returnValue(of(structuredClone(catalog)));
    service.getBackupRestoreOperations.and.returnValue(of({ operations: [done] }));

    (component as any).startRestorePolling(82);
    updates.next(running);
    tick(120000);
    expect(service.getBackupRestoreOperation).toHaveBeenCalledTimes(1);
    updates.next(done);
    expect(component.selectedOperation?.status).toBe('SUCCEEDED');
    component.ngOnDestroy();
  }));

  it('clears parent dirty/saving state on destroy', () => {
    const dirty = spyOn(component.dirtyChange, 'emit');
    const saving = spyOn(component.savingChange, 'emit');

    component.ngOnDestroy();

    expect(dirty).toHaveBeenCalledWith(false);
    expect(saving).toHaveBeenCalledWith(false);
  });
});
