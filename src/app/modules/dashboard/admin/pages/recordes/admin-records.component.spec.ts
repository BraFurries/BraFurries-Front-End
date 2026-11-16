import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminRecordsComponent } from './admin-records.component';

describe('AdminRecordsComponent: global Coddy record policy', () => {
  let api: jasmine.SpyObj<AdminService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj('AdminService', [
      'getRecordBlacklist', 'addRecordBlacklist', 'removeRecordBlacklist'
    ]);
    api.getRecordBlacklist.and.returnValue(of({games: [{id:5,name:'Antigo'}]}));
    api.addRecordBlacklist.and.returnValue(of({games:[{id:5,name:'Antigo'},{id:6,name:'Novo'}]}));
    api.removeRecordBlacklist.and.returnValue(of({games:[]}));
    await TestBed.configureTestingModule({
      imports:[CommonModule,FormsModule],
      declarations:[AdminRecordsComponent],
      providers:[{provide:AdminService,useValue:api}]
    }).compileComponents();
  });

  it('shows one global list without a guild selector', () => {
    const fixture = TestBed.createComponent(AdminRecordsComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('todos os servidores');
    expect(el.textContent).toContain('Antigo');
    expect(el.querySelector('select')).toBeNull();
    expect(api.getRecordBlacklist).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('adds and removes globally with a confirmation', () => {
    const fixture = TestBed.createComponent(AdminRecordsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.nameInput = ' Novo ';
    component.add();
    expect(api.addRecordBlacklist).toHaveBeenCalledOnceWith('Novo');
    expect(component.games.some(g => g.name === 'Novo')).toBeTrue();
    component.remove(6);
    expect(api.removeRecordBlacklist).not.toHaveBeenCalled();
    component.removingId = 6;
    component.remove(6);
    expect(api.removeRecordBlacklist).toHaveBeenCalledOnceWith(6);
    fixture.destroy();
  });

  it('does not mutate when loading or pending', () => {
    const pending = new Subject<{games:{id:number;name:string}[]}>();
    api.getRecordBlacklist.and.returnValue(pending);
    const fixture = TestBed.createComponent(AdminRecordsComponent);
    fixture.detectChanges();
    fixture.componentInstance.nameInput='Teste';
    fixture.componentInstance.add();
    expect(api.addRecordBlacklist).not.toHaveBeenCalled();
    pending.next({games:[]});
    fixture.componentInstance.add();
    expect(api.addRecordBlacklist).toHaveBeenCalledOnceWith('Teste');
    fixture.destroy();
  });
});
