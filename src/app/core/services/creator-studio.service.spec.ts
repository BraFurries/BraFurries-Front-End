import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CreatorStudioService } from './creator-studio.service';

describe('CreatorStudioService', () => {
  let studio: CreatorStudioService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/user/me/creator-studio`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CreatorStudioService]
    });
    studio = TestBed.inject(CreatorStudioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks the API for the entitlement of the authenticated account, never an artist ID', () => {
    studio.myAccess().subscribe();
    const req = http.expectOne(`${base}/access`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ allowed: false, tier: null, status: 'NOT_AUTHORIZED',
      sourceKind: null, expiresAtUtc: null });
  });

  it('fetches only the active commission queue by default', () => {
    studio.commissions(null).subscribe();
    const req = http.expectOne(r => r.url === `${base}/commissions`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.has('status')).toBeFalse();
    expect(req.request.params.has('userId')).toBeFalse();
    expect(req.request.params.has('communityId')).toBeFalse();
    req.flush({ items: [], page: 1, pageSize: 25, total: 0 });
  });

  it('queries completed history only on explicit status filter', () => {
    studio.commissions('COMPLETED', 2, 10).subscribe();
    const req = http.expectOne(r => r.url === `${base}/commissions`);
    expect(req.request.params.get('status')).toBe('COMPLETED');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [], page: 2, pageSize: 10, total: 0 });
  });

  it('creates a commission without any owner or subscription fields', () => {
    const input = {
      title: 'Ref Sheet', clientName: 'Luna', description: 'Pelo cinza',
      privateNotes: null, requestedOn: '2026-11-12', dueOn: null, artTypeId: null
    };
    studio.create(input).subscribe();
    const req = http.expectOne(`${base}/commissions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    expect(req.request.body.ownerUserId).toBeUndefined();
    expect(req.request.body.tier).toBeUndefined();
    req.flush({ ...input, id: 10, status: 'QUEUED', createdAtUtc: '2026-11-17T20:00:00',
      updatedAtUtc: '2026-11-17T20:00:00', completedAtUtc: null });
  });

  it('loads only the signed-in artist’s reusable production catalog', () => {
    studio.workflows().subscribe();
    const req = http.expectOne(`${base}/workflows`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('ownerUserId')).toBeFalse();
    req.flush([]);
  });

  it('sends step references and order without persisting any Community IDs', () => {
    studio.createWorkflow({
      name:'Ref Sheet',isDefault:true,
      steps:[{name:'Sketch',stageDefinitionId:7},{name:'Correção',stageDefinitionId:null}]
    }).subscribe();
    const req = http.expectOne(`${base}/workflows`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.steps.map((s: {name:string}) => s.name))
      .toEqual(['Sketch','Correção']);
    expect(req.request.body.ownerUserId).toBeUndefined();
    expect(req.request.body.communityId).toBeUndefined();
    req.flush({id:12,name:'Ref Sheet',isDefault:true,steps:[]});
  });

  it('loads and modifies only the stages of the current commission', () => {
    studio.commissionSteps(11).subscribe();
    const read = http.expectOne(`${base}/commissions/11/steps`);
    expect(read.request.method).toBe('GET');
    read.flush([]);
    studio.updateCommissionStep(11, 17, {
      name:'Sketch',stageDefinitionId:7,status:'IN_PROGRESS',notes:'revisar olhos'
    }).subscribe();
    const update = http.expectOne(`${base}/commissions/11/steps/17`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.stageDefinitionId).toBe(7);
    expect(update.request.body.ownerUserId).toBeUndefined();
    update.flush({});
  });

  it('sends reference URLs for only the selected commission, no owner ID', () => {
    studio.createReference(11, {
      label: 'Pose', url: 'https://example.com/pose'
    }).subscribe();
    const req = http.expectOne(`${base}/commissions/11/references`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({label:'Pose',url:'https://example.com/pose'});
    expect(req.request.body.ownerUserId).toBeUndefined();
    req.flush({id:15,commissionId:11,label:'Pose',url:'https://example.com/pose',position:0});
  });

  it('loads paginated manual activity without exposing Community information', () => {
    studio.activity(11, 2, 20).subscribe();
    const req = http.expectOne(r => r.url === `${base}/commissions/11/activity`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.has('communityId')).toBeFalse();
    req.flush({items:[],page:2,pageSize:20,total:40});
  });

  it('creates an artist-reported revision without claiming client authentication', () => {
    studio.createActivity(11, {
      eventKind:'REVISION_REQUEST',
      description:'Trocar cor dos olhos',occurredOn:'2026-11-17'
    }).subscribe();
    const req = http.expectOne(`${base}/commissions/11/activity`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.eventKind).toBe('REVISION_REQUEST');
    expect(req.request.body.ownerUserId).toBeUndefined();
    expect(req.request.body.clientApproved).toBeUndefined();
    req.flush({id:91,commissionId:11,...req.request.body,createdAtUtc:'2026-11-17T23:00:00'});
  });

  it('gets 30-day and 7-day retention windows without a plan or owner parameter', () => {
    studio.retention().subscribe();
    const req = http.expectOne(`${base}/retention`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({
      policy:'12_MONTHS_AFTER_LAST_COMPLETION',retentionMonths:12,
      advanceNoticeDays:30,finalNoticeDays:7,automaticDeletionEnabled:false,
      commissions:[]
    });
  });

  it('downloads a private archive as a blob even when the plan is revoked', () => {
    studio.exportMyData().subscribe(blob => {
      expect(blob.type).toBe('application/json');
    });
    const req = http.expectOne(`${base}/export`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['{"schemaVersion":1}'],{type:'application/json'}));
  });

  it('uses an isolated status endpoint rather than duplicating a card', () => {
    studio.changeStatus(10, 'COMPLETED').subscribe();
    const req = http.expectOne(`${base}/commissions/10/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'COMPLETED' });
    req.flush({ id: 10, status: 'COMPLETED' });
  });
});
