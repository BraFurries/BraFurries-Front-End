import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PlatformAccessService } from '../../../../../core/services/platform-access.service';
import { AdminStorageService, StorageObjectPage, StoredObject } from '../../../../../core/services/admin-storage.service';
import { AdminStorageComponent } from './admin-storage.component';

describe('AdminStorageComponent', () => {
  const key='commerce/contracts/12/12345678-1234-1234-1234-123456789abc.pdf';
  const orphan: StoredObject = {
    key, sizeBytes:100, lastModified:'2025-01-01T00:00:00Z',
    contentType:'application/pdf', etag:'"etag"', category:'CONTRACT_DOCUMENT',
    referenceStatus:'ORPHAN', referenceLabel:'Contrato assinado ou minuta', deletable:true
  };
  const page: StorageObjectPage = {
    bucket:'PRIVATE', prefix:'commerce/', objects:[orphan],
    nextCursor:'next-token', truncated:true, pageBytes:100
  };
  let access: jasmine.SpyObj<PlatformAccessService>;
  let service: jasmine.SpyObj<AdminStorageService>;

  beforeEach(async () => {
    access=jasmine.createSpyObj('PlatformAccessService',['myAccess']);
    service=jasmine.createSpyObj('AdminStorageService',['list','inspect','deleteOrphan']);
    service.list.and.returnValue(of(page));
    service.inspect.and.returnValue(of(orphan));
    service.deleteOrphan.and.returnValue(of(void 0));
    access.myAccess.and.returnValue(of({enabled:true,owner:true,permissions:[]}));
    await TestBed.configureTestingModule({
      imports:[CommonModule,FormsModule],
      declarations:[AdminStorageComponent],
      providers:[
        {provide:PlatformAccessService,useValue:access},
        {provide:AdminStorageService,useValue:service}
      ]
    }).compileComponents();
  });

  it('does not load R2 objects for non-owner with administrative permissions', () => {
    access.myAccess.and.returnValue(of({enabled:true,owner:false,permissions:['PARTNERS_MANAGE']}));
    const fixture=TestBed.createComponent(AdminStorageComponent);
    fixture.detectChanges();
    expect(service.list).not.toHaveBeenCalled();
    expect(service.inspect).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('exclusiva do responsável');
    fixture.destroy();
  });

  it('loads private objects as owner and exposes next-page cursor', () => {
    const fixture=TestBed.createComponent(AdminStorageComponent);
    fixture.detectChanges();
    const component=fixture.componentInstance;
    expect(service.list).toHaveBeenCalledWith('PRIVATE','commerce/',null,50);
    expect(fixture.nativeElement.textContent).toContain(key);
    component.nextPage();
    expect(service.list).toHaveBeenCalledWith('PRIVATE','commerce/','next-token',50);
    fixture.destroy();
  });

  it('can inspect the old orphan by exact R2 key and confirm its deletion', () => {
    const fixture=TestBed.createComponent(AdminStorageComponent);
    fixture.detectChanges();
    const component=fixture.componentInstance;
    component.exactKey=key;
    component.inspectExact();
    expect(service.inspect).toHaveBeenCalledWith('PRIVATE',key);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Excluir órfão definitivamente do R2');
    spyOn(window,'confirm').and.returnValue(true);
    component.removeOrphan();
    expect(service.deleteOrphan).toHaveBeenCalledOnceWith('PRIVATE',key,'"etag"');
    expect(component.selected).toBeNull();
    expect(component.successMessage).toContain('excluído');
    fixture.destroy();
  });

  it('does not allow deletion of an unverified public media object', () => {
    const fixture=TestBed.createComponent(AdminStorageComponent);
    fixture.detectChanges();
    const component=fixture.componentInstance;
    component.changeBucket('PUBLIC');
    component.selected={...orphan,category:'PUBLIC_MEDIA',
      referenceStatus:'UNVERIFIED',deletable:false};
    component.removeOrphan();
    expect(service.deleteOrphan).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('does not access R2 when owner validation fails', () => {
    access.myAccess.and.returnValue(throwError(() => new Error('unavailable')));
    const fixture=TestBed.createComponent(AdminStorageComponent);
    fixture.detectChanges();
    expect(service.list).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Não foi possível validar');
    fixture.destroy();
  });
});
