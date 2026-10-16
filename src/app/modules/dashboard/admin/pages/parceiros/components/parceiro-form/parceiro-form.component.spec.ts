import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AdminService } from '../../../../../../../core/services/admin.service';
import { AdminPartnerItem, PartnerLinkCandidate } from '../../../../../../../shared/models/api/admin/admin';
import { ParceiroFormComponent, PARTNER_CATEGORIES } from './parceiro-form.component';

describe('ParceiroFormComponent', () => {
  let component: ParceiroFormComponent;
  let fixture: ComponentFixture<ParceiroFormComponent>;
  let adminService: jasmine.SpyObj<AdminService>;

  beforeEach(async () => {
    adminService = jasmine.createSpyObj<AdminService>('AdminService', ['getPartnerLinkableResources', 'getUsers']);
    adminService.getPartnerLinkableResources.and.returnValue(of([]));
    adminService.getUsers.and.returnValue(of({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }));
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule],
      declarations: [ParceiroFormComponent],
      providers: [{ provide: AdminService, useValue: adminService }]
    }).compileComponents();
    fixture = TestBed.createComponent(ParceiroFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts pending and exposes exactly the official categories including artist', () => {
    expect(component.form.controls.status.value).toBe('pending');
    expect(PARTNER_CATEGORIES.map(item => `${item.value}:${item.label}`)).toEqual([
      'community:Comunidade', 'creator:Criador', 'artist:Artista', 'event:Evento', 'meet:Meet',
      'discord_server:Servidor Discord', 'brand:Marca', 'other:Outro'
    ]);
  });

  it('rejects a blank name and invalid URLs', () => {
    component.form.patchValue({ name: '   ', category: 'community', websiteUrl: 'ftp://example.com' });
    expect(component.form.invalid).toBeTrue();
  });

  it('builds a clean create payload without slug or internal fields and skips empty links', () => {
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.form.patchValue({ name: '  Parceiro  ', category: 'brand', contactEmail: 'oi@example.com' });
    component.addLink({ type: 'instagram', label: 'Perfil', url: 'https://example.com/perfil' });
    component.addLink();
    component.submit();
    const payload = emitted.calls.mostRecent().args[0].payload;
    expect(payload).toEqual(jasmine.objectContaining({ name: 'Parceiro', category: 'brand', status: 'pending' }));
    expect(payload.links.length).toBe(1);
    expect(payload.slug).toBeUndefined();
    expect(payload.linkedResource).toBeUndefined();
    expect(payload.representativeUserId).toBeUndefined();
  });

  it('loads an existing linked partner without resending the unchanged linked resource', () => {
    component.partner = partner();
    component.ngOnChanges({ partner: { currentValue: component.partner, previousValue: null, firstChange: false, isFirstChange: () => false } });
    expect(component.originMode).toBe('existing');
    expect(component.selectedResourceLabel()).toBe('Teste');
    expect(component.links.length).toBe(1);
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.submit();
    const payload = emitted.calls.mostRecent().args[0].payload;
    expect(payload.status).toBeUndefined();
    expect(payload.linkedResource).toBeUndefined();
    expect(payload.clearLinkedResource).toBeUndefined();
  });

  it('sends clearLinkedResource when an existing linked partner becomes manual', () => {
    component.partner = partner();
    component.ngOnChanges({ partner: { currentValue: component.partner, previousValue: null, firstChange: false, isFirstChange: () => false } });
    component.setOriginMode('manual');
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.submit();
    const payload = emitted.calls.mostRecent().args[0].payload;
    expect(payload.clearLinkedResource).toBeTrue();
    expect(payload.linkedResource).toBeUndefined();
  });

  it('sends only the replacement linkedResource when an edit selects another internal resource', () => {
    component.partner = partner();
    component.ngOnChanges({ partner: { currentValue: component.partner, previousValue: null, firstChange: false, isFirstChange: () => false } });
    component.selectCandidate(candidate('user', 15, 'Novo criador'));
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.submit();
    const payload = emitted.calls.mostRecent().args[0].payload;
    expect(payload.linkedResource).toEqual(jasmine.objectContaining({ type: 'user', id: 15, label: 'Novo criador' }));
    expect(payload.clearLinkedResource).toBeUndefined();
  });

  it('creates an event partner with the selected normalized event resource', () => {
    component.form.patchValue({ category: 'event' });
    component.originMode = 'existing';
    component.selectCandidate(candidate('event', 22, 'Patas 2026'));
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.submit();
    const payload = emitted.calls.mostRecent().args[0].payload;
    expect(payload.linkedResource).toEqual(jasmine.objectContaining({ type: 'event', id: 22, label: 'Patas 2026' }));
  });

  it('replaces prior candidate autofill when another candidate is selected while preserving user edits', () => {
    component.form.patchValue({ category: 'event' });
    component.originMode = 'existing';
    component.selectCandidate({
      resourceType: 'event', id: 10, externalRef: null, name: 'Evento A', subtitle: null, imageUrl: null,
      prefill: {
        name: 'Evento A', description: 'Descrição A', imageUrl: null, websiteUrl: 'https://a.example',
        contactName: 'Host A', contactEmail: null,
        links: [{ type: 'tickets', label: 'Ingressos A', url: 'https://a.example/tickets' }]
      }
    });
    component.form.controls.name.setValue('Nome customizado');

    component.selectCandidate({
      resourceType: 'event', id: 11, externalRef: null, name: 'Evento B', subtitle: null, imageUrl: null,
      prefill: {
        name: 'Evento B', description: 'Descrição B', imageUrl: null, websiteUrl: 'https://b.example',
        contactName: 'Host B', contactEmail: null,
        links: [{ type: 'tickets', label: 'Ingressos B', url: 'https://b.example/tickets' }]
      }
    });

    expect(component.form.controls.name.value).toBe('Nome customizado');
    expect(component.form.controls.description.value).toBe('Descrição B');
    expect(component.form.controls.websiteUrl.value).toBe('https://b.example');
    expect(component.form.controls.contactName.value).toBe('Host B');
    expect(component.links.length).toBe(1);
    expect(component.links.at(0).get('url')?.value).toBe('https://b.example/tickets');
  });

  it('keeps a Discord guild snowflake as a string in manual mode', () => {
    component.form.patchValue({ name: 'Servidor parceiro', category: 'discord_server' });
    component.originMode = 'manual';
    component.discordGuildIdControl.setValue('123456789012345678');
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.submit();
    const resource = emitted.calls.mostRecent().args[0].payload.linkedResource;
    expect(resource).toEqual({ type: 'discord_guild', externalRef: '123456789012345678', label: 'Servidor parceiro' });
    expect(typeof resource.externalRef).toBe('string');
  });

  it('rejects zero and leading-zero Discord guild ids to match the API positive snowflake contract', () => {
    component.form.patchValue({ name: 'Servidor parceiro', category: 'discord_server' });
    component.originMode = 'manual';
    component.discordGuildIdControl.setValue('0');
    expect(component.discordGuildIdControl.invalid).toBeTrue();
    component.discordGuildIdControl.setValue('0123456789');
    expect(component.discordGuildIdControl.invalid).toBeTrue();
    component.discordGuildIdControl.setValue('1234567890');
    expect(component.discordGuildIdControl.valid).toBeTrue();
  });

  it('keeps a manual Discord partner unlinked when no guild id is provided', () => {
    component.form.patchValue({ name: 'Servidor externo', category: 'discord_server' });
    component.originMode = 'manual';
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.submit();
    expect(emitted.calls.mostRecent().args[0].payload.linkedResource).toBeUndefined();
  });

  it('refreshes the external Discord link label when the partner name changes', () => {
    component.partner = {
      id: 8, name: 'Servidor antigo', status: 'active', category: 'discord_server',
      links: [], clicks: 0, invites: 0,
      linkedResource: { type: 'discord_guild', externalRef: '123456789012345678', label: 'Servidor antigo' }
    };
    component.ngOnChanges({ partner: { currentValue: component.partner, previousValue: null, firstChange: false, isFirstChange: () => false } });
    component.form.controls.name.setValue('Servidor novo');

    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.submit();

    expect(emitted.calls.mostRecent().args[0].payload.linkedResource).toEqual({
      type: 'discord_guild',
      externalRef: '123456789012345678',
      label: 'Servidor novo'
    });
  });

  it('autofills only empty fields and does not duplicate suggested links', () => {
    component.form.patchValue({ category: 'event', name: 'Nome customizado', description: '', websiteUrl: '' });
    component.addLink({ type: 'website', label: 'Site', url: 'https://example.com' });
    component.selectCandidate({
      resourceType: 'event', id: 20, externalRef: null, name: 'Evento original', subtitle: 'Evento', imageUrl: null,
      prefill: {
        name: 'Evento original', description: 'Descrição sugerida', imageUrl: 'https://example.com/logo.png',
        websiteUrl: 'https://example.com', contactName: 'Host', contactEmail: null,
        links: [{ type: 'website', label: 'Site', url: 'https://example.com' }, { type: 'tickets', label: null, url: 'https://example.com/ingressos' }]
      }
    });
    expect(component.form.controls.name.value).toBe('Nome customizado');
    expect(component.form.controls.description.value).toBe('Descrição sugerida');
    expect(component.form.controls.imageUrl.value).toBe('https://example.com/logo.png');
    expect(component.form.controls.websiteUrl.value).toBe('https://example.com');
    expect(component.form.controls.contactName.value).toBe('Host');
    expect(component.links.length).toBe(2);
  });

  it('debounces candidate searches and uses the selected category', fakeAsync(() => {
    component.form.controls.category.setValue('artist');
    component.setOriginMode('existing');
    component.searchControl.setValue('Nick');
    tick(299);
    expect(adminService.getPartnerLinkableResources).not.toHaveBeenCalled();
    tick(1);
    expect(adminService.getPartnerLinkableResources).toHaveBeenCalledWith('artist', 'Nick', 20);
  }));

  it('sends empty strings when editable fields are cleared during editing', () => {
    component.partner = partner();
    component.ngOnChanges({ partner: { currentValue: component.partner, previousValue: null, firstChange: false, isFirstChange: () => false } });
    component.form.patchValue({ description: ' ', imageUrl: '', websiteUrl: '', contactName: '', contactEmail: '' });
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.submit();
    expect(emitted.calls.mostRecent().args[0].payload).toEqual(jasmine.objectContaining({
      description: '', imageUrl: '', websiteUrl: '', contactName: '', contactEmail: ''
    }));
  });

  it('does not use representativeName as the contactName fallback', () => {
    component.partner = partner();
    component.ngOnChanges({ partner: { currentValue: component.partner, previousValue: null, firstChange: false, isFirstChange: () => false } });
    expect(component.form.controls.contactName.value).toBe('');
  });

  it('uses the administrative users endpoint for representative selection without touching contact fields', fakeAsync(() => {
    component.form.patchValue({ name: 'Parceiro', category: 'brand', contactEmail: 'contato@example.com' });
    component.representativeSearchControl.setValue('Nick'); tick(300);
    expect(adminService.getUsers).toHaveBeenCalledWith({ search: 'Nick', page: 1, pageSize: 20 });
    component.selectRepresentative({ id: 22, name: 'Nick', email: 'nick@example.com', status: 'active', role: 'member' });
    const emitted = jasmine.createSpy('submitted'); component.submitted.subscribe(emitted); component.submit();
    expect(emitted.calls.mostRecent().args[0].payload.representativeUserId).toBe(22);
    expect(emitted.calls.mostRecent().args[0].payload.contactEmail).toBe('contato@example.com');
  }));

  it('cancels pending image removal when a new manual URL is entered', () => {
    component.partner = { id: 3, name: 'Teste', status: 'active', category: 'brand', imageUrl: 'https://example.com/old.png', links: [], clicks: 0, invites: 0 };
    component.ngOnChanges({ partner: { currentValue: component.partner, previousValue: null, firstChange: false, isFirstChange: () => false } });
    component.markImageForRemoval();
    component.form.controls.imageUrl.setValue('https://example.com/nova.png');
    const emitted = jasmine.createSpy('submitted'); component.submitted.subscribe(emitted); component.submit();
    expect(emitted.calls.mostRecent().args[0].removeImage).toBeFalse();
    expect(emitted.calls.mostRecent().args[0].payload.imageUrl).toBe('https://example.com/nova.png');
  });
  it('emits the representative transition matrix without ambiguous payloads', () => {
    const emit = () => { const spy = jasmine.createSpy(); component.submitted.subscribe(spy); component.submit(); return spy.calls.mostRecent().args[0].payload; };
    component.form.patchValue({ name: 'Parceiro', category: 'brand' }); component.selectRepresentative({ id: 22, name: 'Novo', status: 'active', role: 'member' });
    let payload = emit(); expect(payload.representativeUserId).toBe(22); expect(payload.clearRepresentativeUser).toBeUndefined();
    component.partner = { id: 3, name: 'Parceiro', status: 'active', category: 'brand', representativeUserId: 10, representative: { id: 10, name: 'A' }, links: [], clicks: 0, invites: 0 }; component.ngOnChanges({ partner: { currentValue: component.partner, previousValue: null, firstChange: false, isFirstChange: () => false } });
    payload = emit(); expect(payload.representativeUserId).toBeUndefined(); expect(payload.clearRepresentativeUser).toBeUndefined();
    component.selectRepresentative({ id: 20, name: 'B', status: 'active', role: 'member' }); payload = emit(); expect(payload.representativeUserId).toBe(20); expect(payload.clearRepresentativeUser).toBeUndefined();
    component.unlinkRepresentative(); payload = emit(); expect(payload.clearRepresentativeUser).toBeTrue(); expect(payload.representativeUserId).toBeUndefined();
  });
  it('cancels stale representative searches and completes only the latest search', fakeAsync(() => {
    const nick = new Subject<any>(); const nina = new Subject<any>(); adminService.getUsers.and.callFake((f: any) => f.search === 'Nick' ? nick : nina);
    component.representativeSearchControl.setValue('Nick'); tick(300); component.representativeSearchControl.setValue('N'); nick.next({ items: [{ id: 1, name: 'Nick', status: 'active', role: 'member' }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    expect(component.representativeCandidates).toEqual([]); expect(component.representativeSearchCompleted).toBeFalse();
    component.representativeSearchControl.setValue('Nick'); tick(300); component.representativeSearchControl.setValue('Nina'); tick(300); nick.next({ items: [{ id: 1, name: 'Old', status: 'active', role: 'member' }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }); nina.next({ items: [{ id: 2, name: 'Nina', status: 'active', role: 'member' }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    expect(component.representativeCandidates[0].name).toBe('Nina'); expect(component.representativeSearchCompleted).toBeTrue();
  }));
  it('handles short, empty and failed representative searches', fakeAsync(() => {
    component.representativeSearchControl.setValue('N'); expect(adminService.getUsers).not.toHaveBeenCalled(); expect(component.representativeSearchCompleted).toBeFalse();
    adminService.getUsers.and.returnValue(of({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } })); component.representativeSearchControl.setValue('Nick'); tick(300); expect(component.representativeSearchCompleted).toBeTrue(); expect(component.representativeCandidates).toEqual([]);
    adminService.getUsers.and.returnValue(throwError(() => new Error())); component.representativeSearchControl.setValue('Nina'); tick(300); expect(component.representativeSearchCompleted).toBeFalse(); expect(component.representativeSearchError).toContain('Não foi possível');
  }));
  it('accepts image formats, revokes previews and rejects invalid replacements', () => {
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:a'); const revoke = spyOn(URL, 'revokeObjectURL');
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) { const file = new File(['x'], 'a', { type }); component.onImageFileSelected({ target: { files: [file], value: 'x' } } as any); expect(component.imageFile).toBe(file); expect(component.removeImage).toBeFalse(); }
    component.onImageFileSelected({ target: { files: [new File(['x'], 'bad', { type: 'text/plain' })], value: 'x' } } as any); expect(revoke).toHaveBeenCalledWith('blob:a'); expect(component.imageFile).toBeNull(); expect(component.imageFileError).toContain('JPEG'); expect(create).toHaveBeenCalled();
  });
  it('rejects an image larger than 5 MB without creating a preview', () => {
    const create = spyOn(URL, 'createObjectURL'); const oversized = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: (5 * 1024 * 1024) + 1 }); const input: any = { files: [oversized], value: 'large.png' };
    component.onImageFileSelected({ target: input } as any);
    expect(component.imageFile).toBeNull(); expect(component.imageFileError).toContain('5 MB'); expect(create).not.toHaveBeenCalled(); expect(input.value).toBe('');
  });
  it('omits manual URL for files and revokes the active preview on destroy', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:image'); const revoke = spyOn(URL, 'revokeObjectURL'); const file = new File(['x'], 'a.png', { type: 'image/png' }); component.form.patchValue({ name: 'P', category: 'brand', imageUrl: 'https://example.com/x.png' }); component.onImageFileSelected({ target: { files: [file] } } as any); const emitted = jasmine.createSpy(); component.submitted.subscribe(emitted); component.submit(); expect(emitted.calls.mostRecent().args[0].payload.imageUrl).toBeUndefined(); component.ngOnDestroy(); expect(revoke).toHaveBeenCalledWith('blob:image');
  });

  it('exposes the expanded friendly link type options', () => {
    const values = component.linkTypeOptions.map(option => option.value);
    expect(values).toContain('furaffinity');
    expect(values).toContain('vgen');
    expect(values).toContain('kofi');
    expect(values).toContain('tickets');
    expect(values).toContain('chat');
    expect(component.linkTypeOptions.find(option => option.value === 'twitter')?.label).toBe('X / Twitter');
  });

  it('enforces the API maximum lengths for partner fields and links', () => {
    component.form.patchValue({ name: 'n'.repeat(65), description: 'd'.repeat(2049), imageUrl: 'h'.repeat(1025), websiteUrl: 'h'.repeat(1025), contactName: 'c'.repeat(129), contactEmail: `${'e'.repeat(244)}@example.com` });
    component.addLink({ type: 't'.repeat(33), label: 'l'.repeat(129), url: 'u'.repeat(1025) });
    expect(component.form.controls.name.hasError('maxlength')).toBeTrue();
    expect(component.form.controls.description.hasError('maxlength')).toBeTrue();
    expect(component.form.controls.imageUrl.hasError('maxlength')).toBeTrue();
    expect(component.form.controls.websiteUrl.hasError('maxlength')).toBeTrue();
    expect(component.form.controls.contactName.hasError('maxlength')).toBeTrue();
    expect(component.form.controls.contactEmail.hasError('maxlength')).toBeTrue();
    expect(component.links.at(0).get('type')?.hasError('maxlength')).toBeTrue();
    expect(component.links.at(0).get('label')?.hasError('maxlength')).toBeTrue();
    expect(component.links.at(0).get('url')?.hasError('maxlength')).toBeTrue();
  });

  function candidate(resourceType: PartnerLinkCandidate['resourceType'], id: number, name: string): PartnerLinkCandidate {
    return { resourceType, id, externalRef: null, name, subtitle: null, imageUrl: null, prefill: { name, links: [] } };
  }

  function partner(): AdminPartnerItem {
    return {
      id: 3, name: 'Teste', representativeName: 'Representante legado', status: 'active', category: 'creator',
      description: 'Descrição', imageUrl: 'https://example.com/logo.png', websiteUrl: 'https://example.com',
      contactEmail: 'oi@example.com', links: [{ type: 'website', url: 'https://example.com' }], clicks: 12, invites: 4,
      representativeUserId: 9, linkedResource: { type: 'user', id: 9, label: 'Teste' }
    };
  }
});
