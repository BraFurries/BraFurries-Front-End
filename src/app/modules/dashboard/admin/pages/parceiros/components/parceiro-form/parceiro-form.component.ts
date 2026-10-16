import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Subject, Subscription, of, timer } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { AdminService } from '../../../../../../../core/services/admin.service';
import {
  AdminPartnerCategory,
  AdminPartnerItem,
  AdminPartnerStatus,
  AdminUserItem,
  CreatePartnerRequest,
  PartnerExternalLinkItem,
  PartnerLinkCandidate,
  PartnerLinkedResource,
  PartnerPrefill,
  PartnerRepresentative,
  UpdatePartnerRequest
} from '../../../../../../../shared/models/api/admin/admin';

export interface PartnerFormSubmission {
  payload: CreatePartnerRequest | UpdatePartnerRequest;
  imageFile?: File | null;
  removeImage?: boolean;
}

export const PARTNER_CATEGORIES: { value: AdminPartnerCategory; label: string }[] = [
  { value: 'community', label: 'Comunidade' }, { value: 'creator', label: 'Criador' },
  { value: 'artist', label: 'Artista' }, { value: 'event', label: 'Evento' }, { value: 'meet', label: 'Meet' },
  { value: 'discord_server', label: 'Servidor Discord' }, { value: 'brand', label: 'Marca' },
  { value: 'other', label: 'Outro' }
];

const LINKABLE_CATEGORIES: AdminPartnerCategory[] = ['community', 'creator', 'artist', 'event', 'meet', 'discord_server'];

type PartnerOriginMode = 'existing' | 'manual';
type AutofillField = 'name' | 'description' | 'imageUrl' | 'websiteUrl' | 'contactName' | 'contactEmail';

interface TrackedAutofillLink {
  type: string;
  label: string;
  url: string;
}

const httpUrlValidator = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  try { return ['http:', 'https:'].includes(new URL(value).protocol) ? null : { url: true }; }
  catch { return { url: true }; }
};

@Component({
  selector: 'app-parceiro-form', standalone: false,
  templateUrl: './parceiro-form.component.html', styleUrls: ['./parceiro-form.component.scss']
})
export class ParceiroFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input() partner: AdminPartnerItem | null = null;
  @Input() submitting = false;
  @Input() submitLabel = 'Salvar parceria';
  @Output() submitted = new EventEmitter<PartnerFormSubmission>();
  @Output() cancelled = new EventEmitter<void>();

  readonly categories = PARTNER_CATEGORIES;
  readonly statuses: { value: AdminPartnerStatus; label: string }[] = [
    { value: 'pending', label: 'Pendente' }, { value: 'active', label: 'Ativo' }, { value: 'suspended', label: 'Suspenso' }
  ];
  readonly linkTypeOptions: { value: string; label: string }[] = [
    { value: 'website', label: 'Site' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'twitter', label: 'X / Twitter' },
    { value: 'bluesky', label: 'Bluesky' },
    { value: 'threads', label: 'Threads' },
    { value: 'mastodon', label: 'Mastodon' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'discord', label: 'Discord' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'twitch', label: 'Twitch' },
    { value: 'furaffinity', label: 'Fur Affinity' },
    { value: 'vgen', label: 'VGen' },
    { value: 'kofi', label: 'Ko-fi' },
    { value: 'patreon', label: 'Patreon' },
    { value: 'deviantart', label: 'DeviantArt' },
    { value: 'artstation', label: 'ArtStation' },
    { value: 'inkbunny', label: 'Inkbunny' },
    { value: 'sofurry', label: 'SoFurry' },
    { value: 'weasyl', label: 'Weasyl' },
    { value: 'carrd', label: 'Carrd' },
    { value: 'linktree', label: 'Linktree' },
    { value: 'store', label: 'Loja' },
    { value: 'tickets', label: 'Ingressos' },
    { value: 'chat', label: 'Grupo / Chat' },
    { value: 'other', label: 'Outro' }
  ];

  originMode: PartnerOriginMode = 'manual';
  candidateResults: PartnerLinkCandidate[] = [];
  selectedCandidate: PartnerLinkCandidate | null = null;
  candidateLoading = false;
  candidateError = '';
  representativeCandidates: AdminUserItem[] = [];
  selectedRepresentative: PartnerRepresentative | null = null;
  representativeSearchLoading = false;
  representativeSearchError = '';
  representativeSearchCompleted = false;
  readonly representativeSearchControl = new FormControl('', { nonNullable: true });
  imageFile: File | null = null;
  imageFileError = '';
  removeImage = false;
  private imageObjectUrl: string | null = null;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly discordGuildIdControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(32), Validators.pattern(/^[1-9]\d*$/)]
  });

  form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(64), this.trimmedRequired] }),
    category: new FormControl<AdminPartnerCategory | null>(null, [Validators.required]),
    status: new FormControl<AdminPartnerStatus>('pending', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2048)] }),
    imageUrl: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1024), httpUrlValidator] }),
    websiteUrl: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1024), httpUrlValidator] }),
    contactName: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(128)] }),
    contactEmail: new FormControl('', { nonNullable: true, validators: [Validators.email, Validators.maxLength(255)] }),
    links: new FormArray<FormGroup>([])
  });

  private readonly subscriptions = new Subscription();
  private readonly candidateSearch = new Subject<{ category: AdminPartnerCategory; search: string }>();
  private readonly representativeSearch = new Subject<string>();
  private readonly autofilledValues = new Map<AutofillField, string>();
  private autofilledLinks: TrackedAutofillLink[] = [];
  private originalLinkedResource: PartnerLinkedResource | null = null;
  private originalCategory: AdminPartnerCategory | null = null;
  private linkIntentChanged = false;
  private originalRepresentativeUserId: number | null = null;

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.bindCandidateSearch();
    this.bindRepresentativeSearch();
    this.bindLinkControls();
    this.applyPartner();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['partner'] && !changes['partner'].firstChange) {
      this.applyPartner();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.candidateSearch.complete();
    this.representativeSearch.complete();
    this.clearImageFile();
  }

  get links(): FormArray<FormGroup> { return this.form.controls.links; }

  supportsExisting(category: AdminPartnerCategory | null = this.form.controls.category.value): boolean {
    return category !== null && LINKABLE_CATEGORIES.includes(category);
  }

  setOriginMode(mode: PartnerOriginMode): void {
    const category = this.form.controls.category.value;
    if (mode === 'existing' && !this.supportsExisting(category)) return;
    if (this.originMode !== mode) this.linkIntentChanged = true;
    this.originMode = mode;
    this.candidateError = '';
    this.candidateResults = [];
    this.searchControl.setValue('', { emitEvent: false });

    if (mode === 'manual') {
      this.selectedCandidate = null;
      if (category !== 'discord_server') this.discordGuildIdControl.setValue('', { emitEvent: false });
      return;
    }

    this.discordGuildIdControl.setValue('', { emitEvent: false });
    this.restoreOriginalCandidateIfPossible();
    this.triggerCandidateSearch();
  }

  selectCandidate(candidate: PartnerLinkCandidate): void {
    this.clearTrackedAutofill();
    this.selectedCandidate = candidate;
    this.linkIntentChanged = true;
    this.candidateError = '';
    this.candidateResults = [];
    this.searchControl.setValue(candidate.name, { emitEvent: false });
    this.applyPrefill(candidate.prefill);
  }

  applySelectedPrefill(): void {
    if (this.selectedCandidate) this.applyPrefill(this.selectedCandidate.prefill);
  }

  retryCandidateSearch(): void { this.triggerCandidateSearch(); }

  candidateSearchPlaceholder(): string {
    return {
      community: 'Buscar comunidade', creator: 'Buscar criador', artist: 'Buscar artista',
      event: 'Buscar evento', meet: 'Buscar meet', discord_server: 'Buscar servidor',
      brand: 'Buscar', other: 'Buscar'
    }[this.form.controls.category.value ?? 'other'];
  }

  selectedResourceLabel(): string {
    return this.selectedCandidate?.name
      ?? this.originalLinkedResource?.label
      ?? this.partner?.name
      ?? '';
  }

  addLink(link: PartnerExternalLinkItem = { type: 'website', label: '', url: '' }): void {
    this.links.push(new FormGroup({
      type: new FormControl(link.type || 'website', { nonNullable: true, validators: [Validators.maxLength(32)] }),
      label: new FormControl(link.label ?? '', { nonNullable: true, validators: [Validators.maxLength(128)] }),
      url: new FormControl(link.url ?? '', { nonNullable: true, validators: [Validators.maxLength(1024), httpUrlValidator] })
    }));
  }

  removeLink(index: number): void { this.links.removeAt(index); }

  isKnownLinkType(value: unknown): boolean {
    return typeof value === 'string' && this.linkTypeOptions.some(option => option.value === value);
  }

  submit(): void {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }

    const category = this.form.controls.category.value;
    if (!category) return;
    if (this.originMode === 'existing' && this.supportsExisting(category) && !this.selectedCandidate) {
      this.candidateError = 'Selecione um registro da BraFurries para vincular.';
      return;
    }
    if (this.originMode === 'manual' && category === 'discord_server' && this.discordGuildIdControl.invalid) {
      this.discordGuildIdControl.markAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const clean = (input: string): string | undefined => input.trim() || undefined;
    const editableValue = (input: string): string | undefined => this.partner ? input.trim() : clean(input);
    const links = value.links
      .filter(link => clean(String(link['url'] ?? '')))
      .map(link => ({
        type: clean(String(link['type'] ?? '')) || 'other',
        label: clean(String(link['label'] ?? '')),
        url: String(link['url'] ?? '').trim()
      }));
    const payload: CreatePartnerRequest | UpdatePartnerRequest = {
      name: value.name.trim(), category,
      description: editableValue(value.description), imageUrl: editableValue(value.imageUrl), websiteUrl: editableValue(value.websiteUrl),
      contactName: editableValue(value.contactName), contactEmail: editableValue(value.contactEmail), links
    };
    if (!this.partner) payload.status = value.status;

    const desiredResource = this.buildDesiredResource(value.name.trim(), category);
    if (desiredResource) {
      if (!this.partner || !this.resourcesEqual(desiredResource, this.originalLinkedResource)) {
        payload.linkedResource = desiredResource;
      }
    } else if (this.partner && this.originalLinkedResource && this.linkIntentChanged) {
      (payload as UpdatePartnerRequest).clearLinkedResource = true;
    }

    const originalRepresentative = this.originalRepresentativeUserId;
    const selectedRepresentative = this.selectedRepresentative?.id ?? null;
    if (selectedRepresentative !== originalRepresentative) {
      if (selectedRepresentative != null) payload.representativeUserId = selectedRepresentative;
      else if (this.partner && originalRepresentative != null) (payload as UpdatePartnerRequest).clearRepresentativeUser = true;
    }
    if (this.imageFile) delete payload.imageUrl;
    this.submitted.emit({ payload, imageFile: this.imageFile, removeImage: !this.imageFile && this.removeImage });
  }

  hasError(name: string, error: string): boolean {
    const control = this.form.get(name); return !!control && control.touched && control.hasError(error);
  }

  linkHasError(index: number): boolean {
    const control = this.links.at(index).get('url');
    return !!control?.touched && control.hasError('url');
  }

  imagePreview(): string | null {
    if (this.imageObjectUrl) return this.imageObjectUrl;
    if (this.removeImage) return null;
    return this.form.controls.imageUrl.valid ? this.form.controls.imageUrl.value.trim() || null : null;
  }

  onImageFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.clearImageFile(); this.imageFileError = 'Escolha uma imagem JPEG, PNG ou WebP de até 5 MB.';
      (event.target as HTMLInputElement).value = '';
      return;
    }
    this.clearImageFile(); this.imageFileError = ''; this.imageFile = file; this.imageObjectUrl = URL.createObjectURL(file); this.removeImage = false;
  }

  markImageForRemoval(): void { this.clearImageFile(); this.imageFileError = ''; this.removeImage = true; }
  clearImageFile(): void { if (this.imageObjectUrl) URL.revokeObjectURL(this.imageObjectUrl); this.imageObjectUrl = null; this.imageFile = null; }
  selectRepresentative(user: AdminUserItem): void {
    this.selectedRepresentative = { id: user.id, name: user.name, avatarUrl: user.avatarUrl, email: user.email, discordUsername: user.discordUsername, telegramUsername: user.telegramUsername };
    this.representativeCandidates = []; this.representativeSearchCompleted = false; this.representativeSearchControl.setValue(user.name, { emitEvent: false });
  }
  unlinkRepresentative(): void { this.selectedRepresentative = null; this.representativeSearchCompleted = false; this.representativeSearchControl.setValue('', { emitEvent: false }); }

  private bindCandidateSearch(): void {
    this.subscriptions.add(this.searchControl.valueChanges.subscribe(value => {
      if (this.selectedCandidate && value.trim() !== this.selectedCandidate.name) {
        this.selectedCandidate = null;
        this.linkIntentChanged = true;
      }
      this.triggerCandidateSearch(value);
    }));

    this.subscriptions.add(this.candidateSearch.pipe(
      debounceTime(300),
      tap(() => { this.candidateLoading = true; this.candidateError = ''; }),
      switchMap(request => this.adminService.getPartnerLinkableResources(
        request.category, request.search || undefined, 20
      ).pipe(
        map(items => ({ items, error: '' })),
        catchError(() => of({ items: [] as PartnerLinkCandidate[], error: 'Não foi possível carregar os registros. Tente novamente.' }))
      ))
    ).subscribe(result => {
      this.candidateLoading = false;
      this.candidateResults = result.items;
      this.candidateError = result.error;
    }));
  }

  private bindRepresentativeSearch(): void {
    this.subscriptions.add(this.representativeSearchControl.valueChanges.pipe(
      map(value => value.trim()), distinctUntilChanged(), switchMap(search => {
        this.representativeSearchCompleted = false;
        if (search.length < 2) { this.representativeCandidates = []; this.representativeSearchLoading = false; this.representativeSearchError = ''; return of(null); }
        this.representativeSearchLoading = true; this.representativeSearchError = '';
        return timer(300).pipe(switchMap(() => this.adminService.getUsers({ search, page: 1, pageSize: 20 }).pipe(
          map(value => ({ items: value.items, error: '' })), catchError(() => of({ items: [] as AdminUserItem[], error: 'Não foi possível carregar usuários.' }))
        )));
      })
    ).subscribe(result => { if (!result) return; this.representativeSearchLoading = false; this.representativeCandidates = result.items; this.representativeSearchError = result.error; this.representativeSearchCompleted = !result.error; }));
  }

  private bindLinkControls(): void {
    this.subscriptions.add(this.form.controls.imageUrl.valueChanges.subscribe(value => {
      if (this.removeImage && value.trim()) this.removeImage = false;
    }));
    this.subscriptions.add(this.form.controls.category.valueChanges.subscribe(category => {
      this.clearTrackedAutofill();
      this.linkIntentChanged = true;
      this.selectedCandidate = null;
      this.candidateResults = [];
      this.candidateError = '';
      this.searchControl.setValue('', { emitEvent: false });
      this.discordGuildIdControl.setValue('', { emitEvent: false });
      if (!this.supportsExisting(category)) this.originMode = 'manual';
      if (this.originMode === 'existing') this.triggerCandidateSearch();
    }));

    this.subscriptions.add(this.discordGuildIdControl.valueChanges.subscribe(() => {
      this.linkIntentChanged = true;
    }));
  }

  private triggerCandidateSearch(search = this.searchControl.value): void {
    const category = this.form.controls.category.value;
    if (this.originMode !== 'existing' || !this.supportsExisting(category) || !category) return;
    this.candidateSearch.next({ category, search: search.trim() });
  }

  private applyPartner(): void {
    this.resetAutofillTracking();
    this.links.clear();
    const partner = this.partner;
    this.form.patchValue({
      name: partner?.name ?? '', category: partner?.category ?? null, status: partner?.status ?? 'pending', description: partner?.description ?? '',
      imageUrl: partner?.imageUrl ?? '', websiteUrl: partner?.websiteUrl ?? '', contactName: partner?.contactName ?? '',
      contactEmail: partner?.contactEmail ?? ''
    }, { emitEvent: false });
    if (partner) this.form.controls.status.disable({ emitEvent: false });
    else this.form.controls.status.enable({ emitEvent: false });
    (partner?.links ?? []).forEach(link => this.addLink(link));

    this.originalCategory = partner?.category ?? null;
    this.originalLinkedResource = partner?.linkedResource ? { ...partner.linkedResource } : null;
    this.linkIntentChanged = false;
    this.candidateResults = [];
    this.candidateError = '';
    this.candidateLoading = false;
    this.searchControl.setValue('', { emitEvent: false });
    this.discordGuildIdControl.setValue('', { emitEvent: false });
    this.selectedCandidate = null;
    this.clearImageFile(); this.removeImage = false; this.imageFileError = '';
    this.originalRepresentativeUserId = partner?.representativeUserId ?? null;
    this.selectedRepresentative = partner?.representative ?? (partner?.representativeUserId ? { id: partner.representativeUserId, name: partner.representativeName ?? `Usuário ${partner.representativeUserId}` } : null);
    this.representativeSearchCompleted = false;
    this.representativeSearchControl.setValue(this.selectedRepresentative?.name ?? '', { emitEvent: false });

    if (partner && this.isInternalResourceForCategory(this.originalLinkedResource, partner.category)) {
      this.originMode = 'existing';
      this.selectedCandidate = this.candidateFromPartner(partner);
      this.searchControl.setValue(this.selectedCandidate.name, { emitEvent: false });
    } else {
      this.originMode = 'manual';
      if (partner?.category === 'discord_server' && this.originalLinkedResource?.type === 'discord_guild' && !this.originalLinkedResource.id) {
        this.discordGuildIdControl.setValue(this.originalLinkedResource.externalRef ?? '', { emitEvent: false });
      }
    }
  }

  private restoreOriginalCandidateIfPossible(): void {
    const category = this.form.controls.category.value;
    if (!this.partner || !category || category !== this.originalCategory) {
      this.selectedCandidate = null;
      return;
    }
    if (!this.isInternalResourceForCategory(this.originalLinkedResource, category)) {
      this.selectedCandidate = null;
      return;
    }
    this.selectedCandidate = this.candidateFromPartner(this.partner);
    this.searchControl.setValue(this.selectedCandidate.name, { emitEvent: false });
  }

  private candidateFromPartner(partner: AdminPartnerItem): PartnerLinkCandidate {
    const resource = partner.linkedResource!;
    return {
      resourceType: resource.type,
      id: resource.id ?? null,
      externalRef: resource.externalRef ?? null,
      name: resource.label || partner.name,
      subtitle: 'Vínculo atual',
      imageUrl: partner.imageUrl ?? null,
      prefill: {
        name: partner.name,
        description: partner.description ?? null,
        imageUrl: partner.imageUrl ?? null,
        websiteUrl: partner.websiteUrl ?? null,
        contactName: partner.contactName ?? null,
        contactEmail: partner.contactEmail ?? null,
        links: partner.links ?? []
      }
    };
  }

  private applyPrefill(prefill: PartnerPrefill): void {
    this.fillEmptyControl('name', prefill.name);
    this.fillEmptyControl('description', prefill.description);
    this.fillEmptyControl('imageUrl', prefill.imageUrl);
    this.fillEmptyControl('websiteUrl', prefill.websiteUrl);
    this.fillEmptyControl('contactName', prefill.contactName);
    this.fillEmptyControl('contactEmail', prefill.contactEmail);

    (prefill.links ?? []).forEach(link => {
      const url = link.url?.trim();
      if (!url) return;
      const type = link.type?.trim() || 'other';
      const label = link.label?.trim() ?? '';
      const duplicated = this.links.controls.some(group =>
        String(group.get('type')?.value ?? '').trim() === type
        && String(group.get('url')?.value ?? '').trim() === url
      );
      if (!duplicated) {
        this.addLink({ type, label, url });
        this.autofilledLinks.push({ type, label, url });
      }
    });
  }

  private fillEmptyControl(field: AutofillField, suggested?: string | null): void {
    const value = suggested?.trim();
    if (!value) return;
    const control = this.form.controls[field];
    if (!control.value.trim()) {
      control.setValue(value);
      this.autofilledValues.set(field, value);
    }
  }

  private clearTrackedAutofill(): void {
    this.autofilledValues.forEach((value, field) => {
      const control = this.form.controls[field];
      if (control.value.trim() === value) control.setValue('');
    });
    this.autofilledValues.clear();

    this.autofilledLinks.forEach(tracked => {
      for (let index = this.links.length - 1; index >= 0; index--) {
        const group = this.links.at(index);
        const type = String(group.get('type')?.value ?? '').trim();
        const label = String(group.get('label')?.value ?? '').trim();
        const url = String(group.get('url')?.value ?? '').trim();
        if (type === tracked.type && label === tracked.label && url === tracked.url) {
          this.links.removeAt(index);
          break;
        }
      }
    });
    this.autofilledLinks = [];
  }

  private resetAutofillTracking(): void {
    this.autofilledValues.clear();
    this.autofilledLinks = [];
  }

  private buildDesiredResource(name: string, category: AdminPartnerCategory): PartnerLinkedResource | undefined {
    if (this.originMode === 'existing' && this.selectedCandidate) {
      const candidate = this.selectedCandidate;
      return this.compactResource({
        type: candidate.resourceType,
        id: candidate.id,
        externalRef: candidate.externalRef,
        label: candidate.name
      });
    }
    if (this.originMode === 'manual' && category === 'discord_server') {
      const guildId = this.discordGuildIdControl.value.trim();
      if (guildId) return { type: 'discord_guild', externalRef: guildId, label: name };
    }
    return undefined;
  }

  private compactResource(resource: PartnerLinkedResource): PartnerLinkedResource {
    const compact: PartnerLinkedResource = { type: resource.type };
    if (resource.id != null) compact.id = resource.id;
    if (resource.externalRef?.trim()) compact.externalRef = resource.externalRef.trim();
    if (resource.label?.trim()) compact.label = resource.label.trim();
    return compact;
  }

  private resourcesEqual(left?: PartnerLinkedResource | null, right?: PartnerLinkedResource | null): boolean {
    if (!left || !right) return !left && !right;
    const sameTarget = left.type === right.type
      && (left.id ?? null) === (right.id ?? null)
      && (left.externalRef?.trim() || null) === (right.externalRef?.trim() || null);
    if (!sameTarget) return false;

    const manualDiscord = left.type === 'discord_guild' && left.id == null && right.id == null;
    if (!manualDiscord) return true;
    return (left.label?.trim() || null) === (right.label?.trim() || null);
  }

  private isInternalResourceForCategory(resource: PartnerLinkedResource | null, category: AdminPartnerCategory): boolean {
    if (!resource || resource.id == null) return false;
    return {
      community: resource.type === 'community',
      creator: resource.type === 'user',
      artist: resource.type === 'user',
      event: resource.type === 'event',
      meet: resource.type === 'event',
      discord_server: resource.type === 'discord_guild',
      brand: false,
      other: false
    }[category];
  }

  private trimmedRequired(control: AbstractControl): ValidationErrors | null {
    return String(control.value ?? '').trim() ? null : { whitespace: true };
  }
}
