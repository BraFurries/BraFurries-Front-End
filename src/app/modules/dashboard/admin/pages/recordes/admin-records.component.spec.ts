import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminRecordsComponent } from './admin-records.component';

describe('AdminRecordsComponent', () => {
  let api: jasmine.SpyObj<AdminService>;
  const guilds = [
    { communityId: 7, communityName: 'Comunidade A', guildId: '123456789012345678', guildName: 'Servidor A' },
    { communityId: 8, communityName: 'Comunidade B', guildId: '987654321012345678', guildName: 'Servidor B' }
  ];
  beforeEach(async () => {
    api = jasmine.createSpyObj('AdminService', [
      'getRecordGuilds', 'getRecordBlacklist', 'addRecordBlacklist', 'removeRecordBlacklist'
    ]);
    api.getRecordGuilds.and.returnValue(of(guilds));
    api.getRecordBlacklist.and.returnValue(of({games: [{id: 5,name:'Antigo'}]}));
    api.addRecordBlacklist.and.returnValue(of({games: [{id: 5,name:'Antigo'}, {id: 6,name:'Novo'}]}));
    api.removeRecordBlacklist.and.returnValue(of({games: []}));
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule],
      declarations: [AdminRecordsComponent],
      providers: [{provide: AdminService, useValue: api}]
    }).compileComponents();
  });

  it('requires explicit tenant and guild selection and scopes all operations', () => {
    const fixture = TestBed.createComponent(AdminRecordsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.selectedGuild).toBeNull();
    expect(api.getRecordBlacklist).not.toHaveBeenCalled();
    component.selectedKey = '8:987654321012345678';
    component.selectGuild();
    fixture.detectChanges();
    expect(api.getRecordBlacklist).toHaveBeenCalledOnceWith(8, '987654321012345678');
    component.nameInput = ' Novo ';
    component.add();
    expect(api.addRecordBlacklist).toHaveBeenCalledOnceWith(8, '987654321012345678', 'Novo');
    expect(component.games.map(g => g.name)).toContain('Novo');
    component.removingId = 6;
    component.remove(6);
    expect(api.removeRecordBlacklist).toHaveBeenCalledOnceWith(8, '987654321012345678', 6);
    fixture.destroy();
  });

  it('discards an outdated response when switching Communities', () => {
    const pending = new Subject<{games:{id:number;name:string}[]}>();
    api.getRecordBlacklist.and.returnValues(pending.asObservable(), of({games:[{id:2,name:'B'}]}));
    const fixture = TestBed.createComponent(AdminRecordsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectedKey = '7:123456789012345678';
    component.selectGuild();
    component.selectedKey = '8:987654321012345678';
    component.selectGuild();
    pending.next({games:[{id:1,name:'A'}]});
    expect(component.games).toEqual([{id:2,name:'B'}]);
    fixture.destroy();
  });

  it('requires a second explicit click before removing an entry', () => {
    const fixture = TestBed.createComponent(AdminRecordsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectedKey = '7:123456789012345678';
    component.selectGuild();
    fixture.detectChanges();
    expect(api.removeRecordBlacklist).not.toHaveBeenCalled();
    const remove = (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    expect(component.games.length).toBe(1);
    component.removingId = 5;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Confirmar exclusão?');
    component.removingId = null;
    fixture.detectChanges();
    expect(api.removeRecordBlacklist).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
