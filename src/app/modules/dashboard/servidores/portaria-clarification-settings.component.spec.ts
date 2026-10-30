import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ManagedServersService } from '../../../core/services/managed-servers.service';
import { PortariaClarificationSettingsComponent } from './portaria-clarification-settings.component';

describe('PortariaClarificationSettingsComponent', () => {
  let component: PortariaClarificationSettingsComponent;
  let fixture: ComponentFixture<PortariaClarificationSettingsComponent>;
  let service: jasmine.SpyObj<ManagedServersService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<ManagedServersService>('ManagedServersService', [
      'getPortariaClarificationSettings', 'updatePortariaClarificationSettings'
    ]);
    service.getPortariaClarificationSettings.and.returnValue(of({enabled: false, categoryId: null}));
    service.updatePortariaClarificationSettings.and.callFake((_id, value) => of(value));
    await TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [PortariaClarificationSettingsComponent],
      providers: [{provide: ManagedServersService, useValue: service}]
    }).compileComponents();
    fixture = TestBed.createComponent(PortariaClarificationSettingsComponent);
    component = fixture.componentInstance;
    component.guildId = '123';
    component.categories = [{id: '987654321098765432', name: 'Atendimento'}];
    component.canManageChannels = true;
    component.ngOnChanges({guildId: new SimpleChange('', '123', true)});
    fixture.detectChanges();
  });

  it('uses the shared Portaria subsection and form control styling', () => {
    const root = fixture.nativeElement.querySelector('section.rounded-xl') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.querySelector('h4')?.textContent).toContain('Tickets de esclarecimento');
    expect(root.querySelector('label.toggle-row')).not.toBeNull();
    expect(root.querySelector('select.field-control')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('article.card')).toBeNull();
  });

  it('starts disabled and does not create tickets in the website', () => {
    expect(component.enabled).toBeFalse();
    expect(component.categoryId).toBeNull();
    expect(service.updatePortariaClarificationSettings).not.toHaveBeenCalled();
  });

  it('requires a category before enabling', () => {
    component.enabled = true;
    component.save();
    expect(service.updatePortariaClarificationSettings).not.toHaveBeenCalled();
    component.categoryId = '987654321098765432';
    component.save();
    expect(service.updatePortariaClarificationSettings).toHaveBeenCalledWith('123', {
      enabled: true, categoryId: '987654321098765432'
    });
  });

  it('refuses enablement when Coddy lacks Manage Channels', () => {
    component.enabled = true;
    component.categoryId = '987654321098765432';
    component.canManageChannels = false;
    component.save();
    expect(service.updatePortariaClarificationSettings).not.toHaveBeenCalled();
  });

  it('does not reuse previous server configuration after guild change', () => {
    service.getPortariaClarificationSettings.and.returnValue(throwError(() => new Error('forbidden')));
    component.guildId = '456';
    component.ngOnChanges({guildId: new SimpleChange('123', '456', false)});
    expect(component.error).toContain('carregar');
    expect(component.enabled).toBeFalse();
    expect(component.categoryId).toBeNull();
  });
});
