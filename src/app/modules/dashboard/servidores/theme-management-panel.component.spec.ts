import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';

import {
  ManagedServerThemesService,
  Theme,
  ThemeApplication,
  ThemeOperation,
  ThemeResources,
  ThemesResponse
} from '../../../core/services/managed-server-themes.service';
import { ThemeManagementPanelComponent } from './theme-management-panel.component';

describe('ThemeManagementPanelComponent', () => {
  let fixture: ComponentFixture<ThemeManagementPanelComponent>;
  let component: ThemeManagementPanelComponent;
  let service: jasmine.SpyObj<ManagedServerThemesService>;

  const theme: Theme = {
    id: 7,
    guildId: '10',
    name: 'Halloween',
    description: 'Evento',
    icon: { action: 'UNCHANGED', url: null, contentType: null, sha256: null, sizeBytes: null },
    banner: { action: 'UNCHANGED', url: null, contentType: null, sha256: null, sizeBytes: null },
    resources: [{ id: 1, resourceType: 'CHANNEL', resourceId: '101', targetName: '🎃・geral' }],
    createdAt: null,
    updatedAt: null
  };

  const operation: ThemeOperation = {
    id: 80,
    applicationId: 70,
    operationType: 'APPLY',
    status: 'PENDING',
    progressCurrent: 0,
    progressTotal: 0,
    currentStep: null,
    result: null,
    errorCode: null,
    startedAt: null,
    finishedAt: null,
    createdAt: null,
    steps: []
  };

  const active: ThemeApplication = {
    id: 70,
    themeId: 7,
    themeName: 'Halloween',
    guildId: '10',
    actorDiscordUserId: '123',
    status: 'ACTIVE',
    appliedAt: null,
    restoredAt: null,
    errorSummary: null,
    latestOperation: { ...operation, status: 'SUCCEEDED' }
  };

  const resources: ThemeResources = {
    channels: [{ id: '101', name: 'geral', type: 'text', categoryId: null }],
    categories: [{ id: '201', name: 'Comunidade' }],
    roles: [
      { id: '301', name: 'Staff', position: 10, eligible: true, unavailableReason: null },
      { id: '302', name: 'VIP custom', position: 9, eligible: false, unavailableReason: 'CODDY_VIP_CUSTOM_ROLE' }
    ]
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<ManagedServerThemesService>('ManagedServerThemesService', [
      'listThemes',
      'getResources',
      'createTheme',
      'updateTheme',
      'deleteTheme',
      'uploadAsset',
      'previewTheme',
      'applyTheme',
      'getApplication',
      'restoreApplication'
    ]);
    service.listThemes.and.returnValue(of({ themes: [theme], activeApplication: null }));
    service.getResources.and.returnValue(of(resources));

    await TestBed.configureTestingModule({
      declarations: [ThemeManagementPanelComponent],
      imports: [FormsModule],
      providers: [{ provide: ManagedServerThemesService, useValue: service }]
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeManagementPanelComponent);
    component = fixture.componentInstance;
    component.guildId = '10';
    component.ngOnChanges({ guildId: {
      currentValue: '10',
      previousValue: '',
      firstChange: true,
      isFirstChange: () => true
    } });
    fixture.detectChanges();
  });

  it('loads the guild-scoped catalog and live editable resources', () => {
    expect(service.listThemes).toHaveBeenCalledWith('10');
    expect(service.getResources).toHaveBeenCalledWith('10');
    expect(component.draft.id).toBe(7);
    expect(component.resourceOptions('ROLE').find(role => role.id === '302')?.eligible).toBeFalse();
  });

  it('tracks editor dirtiness and rejects unavailable roles locally', () => {
    const dirtyEvents: boolean[] = [];
    component.dirtyChange.subscribe(value => dirtyEvents.push(value));

    component.draft.name = 'Halloween 2';
    component.onDraftChanged();
    expect(component.dirty).toBeTrue();

    component.discardChanges();
    expect(component.dirty).toBeFalse();

    component.newResourceType = 'ROLE';
    component.newResourceId = '302';
    component.addResource();
    expect(component.draft.resources.some(item => item.resourceId === '302')).toBeFalse();
    expect(dirtyEvents.length).toBeGreaterThan(0);
  });

  it('creates a theme and uploads managed image bytes when SET is selected', () => {
    component.startNewTheme();
    component.draft.name = 'Natal';
    component.draft.iconAction = 'SET';
    const file = new File(['image'], 'icon.png', { type: 'image/png' });
    component.onAssetFile('icon', file);

    const created: Theme = {
      ...theme,
      id: 8,
      name: 'Natal',
      icon: { action: 'SET', url: null, contentType: null, sha256: null, sizeBytes: null }
    };
    const uploaded: Theme = {
      ...created,
      icon: { action: 'SET', url: 'https://cdn.invalid/icon.png', contentType: 'image/png', sha256: 'a'.repeat(64), sizeBytes: 5 }
    };
    service.createTheme.and.returnValue(of(created));
    service.uploadAsset.and.returnValue(of(uploaded));
    service.listThemes.and.returnValue(of({ themes: [theme, uploaded], activeApplication: null }));

    component.saveTheme();

    expect(service.createTheme).toHaveBeenCalled();
    expect(service.uploadAsset).toHaveBeenCalledWith('10', 8, 'ICON', file);
    expect(component.draft.id).toBe(8);
    expect(component.dirty).toBeFalse();
  });

  it('uploads a new asset before setting SET on an existing theme', () => {
    component.draft.iconAction = 'SET';
    const file = new File(['image'], 'updated.png', { type: 'image/png' });
    component.onAssetFile('icon', file);

    const uploaded: Theme = {
      ...theme,
      icon: { action: 'UNCHANGED', url: 'https://cdn.invalid/updated.png', contentType: 'image/png', sha256: 'b'.repeat(64), sizeBytes: 5 }
    };
    const updated: Theme = {
      ...uploaded,
      icon: { ...uploaded.icon, action: 'SET' }
    };
    const calls: string[] = [];
    service.uploadAsset.and.callFake(() => {
      calls.push('upload');
      return of(uploaded);
    });
    service.updateTheme.and.callFake(() => {
      calls.push('update');
      return of(updated);
    });
    service.listThemes.and.returnValue(of({ themes: [updated], activeApplication: null }));

    component.saveTheme();

    expect(service.uploadAsset).toHaveBeenCalledWith('10', 7, 'ICON', file);
    expect(service.updateTheme).toHaveBeenCalledWith(
      '10',
      7,
      jasmine.objectContaining({ iconAction: 'SET' })
    );
    expect(calls).toEqual(['upload', 'update']);
  });

  it('requires a ready preview and explicit confirmation before applying', fakeAsync(() => {
    service.previewTheme.and.returnValue(of({
      guildId: '10',
      themeId: 7,
      changes: [{ resourceType: 'CHANNEL', resourceId: '101', beforeValue: 'geral', targetValue: '🎃・geral', action: 'SET' }],
      warnings: [],
      blockers: [],
      ready: true
    }));
    service.applyTheme.and.returnValue(of(operation));
    service.getApplication.and.returnValue(of({
      ...active,
      latestOperation: { ...operation, status: 'SUCCEEDED' }
    }));
    service.listThemes.and.returnValue(of({ themes: [theme], activeApplication: active }));

    component.previewTheme();
    component.applyConfirmed = true;
    component.applyTheme();
    tick(1);

    expect(service.applyTheme).toHaveBeenCalled();
    expect(service.getApplication).toHaveBeenCalledWith('10', 70);
  }));

  it('clears restore consent and force flag when the guild changes', () => {
    component.restoreConfirmed = true;
    component.forceRestore = true;
    component.guildId = '11';
    service.listThemes.and.returnValue(of({ themes: [], activeApplication: null }));
    service.getResources.and.returnValue(of({ channels: [], categories: [], roles: [] }));

    component.ngOnChanges({ guildId: {
      currentValue: '11',
      previousValue: '10',
      firstChange: false,
      isFirstChange: () => false
    } });

    expect(component.restoreConfirmed).toBeFalse();
    expect(component.forceRestore).toBeFalse();
  });

  it('reuses the apply idempotency key after a transport failure', () => {
    service.previewTheme.and.returnValue(of({
      guildId: '10',
      themeId: 7,
      changes: [{ resourceType: 'CHANNEL', resourceId: '101', beforeValue: 'geral', targetValue: '🎃・geral', action: 'SET' }],
      warnings: [],
      blockers: [],
      ready: true
    }));
    service.applyTheme.and.returnValues(
      throwError(() => new Error('network lost')),
      throwError(() => new Error('network lost again'))
    );

    component.previewTheme();
    component.applyConfirmed = true;
    component.applyTheme();
    component.applyTheme();

    const firstKey = service.applyTheme.calls.argsFor(0)[2];
    const secondKey = service.applyTheme.calls.argsFor(1)[2];
    expect(secondKey).toBe(firstKey);
  });

  it('reuses the restore idempotency key after a transport failure', () => {
    service.listThemes.and.returnValue(of({ themes: [theme], activeApplication: active } as ThemesResponse));
    component.load();
    component.forceRestore = true;
    component.restoreConfirmed = true;
    service.restoreApplication.and.returnValues(
      throwError(() => new Error('network lost')),
      throwError(() => new Error('network lost again'))
    );

    component.restoreTheme();
    component.restoreTheme();

    const firstKey = service.restoreApplication.calls.argsFor(0)[3];
    const secondKey = service.restoreApplication.calls.argsFor(1)[3];
    expect(secondKey).toBe(firstKey);
  });

  it('does not cancel an in-flight slow polling request', fakeAsync(() => {
    const slowResponse = new Subject<ThemeApplication>();
    service.getApplication.and.returnValue(slowResponse.asObservable());

    (component as any).startApplicationPolling(70);
    tick(0);
    expect(service.getApplication).toHaveBeenCalledTimes(1);

    tick(5000);
    expect(service.getApplication).toHaveBeenCalledTimes(1);

    slowResponse.next({ ...active, latestOperation: { ...operation, status: 'RUNNING' } });
    slowResponse.complete();
    tick(1500);
    expect(service.getApplication).toHaveBeenCalledTimes(2);
  }));

  it('passes force restore only after explicit confirmation', fakeAsync(() => {
    service.listThemes.and.returnValue(of({ themes: [theme], activeApplication: active } as ThemesResponse));
    component.load();
    component.forceRestore = true;
    component.restoreConfirmed = true;
    const restoreOperation: ThemeOperation = { ...operation, operationType: 'RESTORE', status: 'PENDING' };
    service.restoreApplication.and.returnValue(of(restoreOperation));
    service.getApplication.and.returnValue(of({
      ...active,
      status: 'RESTORED',
      restoredAt: '2026-10-07T19:00:00Z',
      latestOperation: { ...restoreOperation, status: 'SUCCEEDED' }
    }));
    service.listThemes.and.returnValue(of({ themes: [theme], activeApplication: null }));

    component.restoreTheme();
    tick(1);

    expect(service.restoreApplication).toHaveBeenCalled();
    expect(service.restoreApplication.calls.mostRecent().args[2]).toBeTrue();
  }));
});
