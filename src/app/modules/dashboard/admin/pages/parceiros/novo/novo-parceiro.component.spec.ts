import { of, Subject, throwError } from 'rxjs';
import { NovoParceiroComponent } from './novo-parceiro.component';

describe('NovoParceiroComponent', () => {
  it('creates once and navigates to the new edit page', () => {
    const service = { createPartner: jasmine.createSpy('create').and.returnValue(of({ id: 8 })), uploadPartnerImage: jasmine.createSpy('upload') } as any;
    const router = { navigate: jasmine.createSpy('navigate') } as any;
    const component = new NovoParceiroComponent(service, router);
    const payload: any = { name: 'Nova', category: 'community', status: 'pending', links: [] };
    component.create({ payload, imageFile: null, removeImage: false }); component.submitting = true; component.create({ payload, imageFile: null, removeImage: false });
    expect(service.createPartner).toHaveBeenCalledTimes(1);
    expect(service.createPartner.calls.mostRecent().args[0].slug).toBeUndefined();
    expect(router.navigate).toHaveBeenCalledWith(['/painel/admin/parceiros', 8, 'editar']);
  });
  it('shows a friendly create error', () => {
    const service = { createPartner: () => throwError(() => ({ status: 400 })) } as any;
    const component = new NovoParceiroComponent(service, {} as any); component.create({ payload: { name: 'x', category: 'other' }, imageFile: null, removeImage: false });
    expect(component.errorMessage).toBe('Revise os dados informados.'); expect(component.submitting).toBeFalse();
  });
  it('uploads only after create and navigates after upload', () => {
    const upload = new Subject<any>(); const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const service: any = { createPartner: jasmine.createSpy().and.returnValue(of({ id: 8 })), uploadPartnerImage: jasmine.createSpy().and.returnValue(upload) };
    const router: any = { navigate: jasmine.createSpy() }; const component = new NovoParceiroComponent(service, router);
    component.create({ payload: { name: 'Nova', category: 'other' }, imageFile: file, removeImage: false });
    expect(service.uploadPartnerImage).toHaveBeenCalledWith(8, file); expect(router.navigate).not.toHaveBeenCalled();
    upload.next({ imageUrl: 'x' }); upload.complete(); expect(router.navigate).toHaveBeenCalledWith(['/painel/admin/parceiros', 8, 'editar']);
  });
  it('navigates to the created partner after upload failure without retrying create', () => {
    const file = new File(['x'], 'logo.png', { type: 'image/png' }); const service: any = { createPartner: jasmine.createSpy().and.returnValue(of({ id: 8 })), uploadPartnerImage: jasmine.createSpy().and.returnValue(throwError(() => new Error())) }; const router: any = { navigate: jasmine.createSpy() };
    new NovoParceiroComponent(service, router).create({ payload: { name: 'Nova', category: 'other' }, imageFile: file, removeImage: false });
    expect(service.createPartner).toHaveBeenCalledTimes(1); expect(router.navigate).toHaveBeenCalledWith(['/painel/admin/parceiros', 8, 'editar'], jasmine.objectContaining({ state: jasmine.objectContaining({ errorMessage: jasmine.any(String) }) }));
  });
  it('ignores a second create while the create request is pending', () => {
    const pending = new Subject<any>(); const service: any = { createPartner: jasmine.createSpy().and.returnValue(pending), uploadPartnerImage: jasmine.createSpy() }; const component = new NovoParceiroComponent(service, { navigate: jasmine.createSpy() } as any); const submission: any = { payload: { name: 'Nova', category: 'other' }, imageFile: null, removeImage: false };
    component.create(submission); component.create(submission); expect(component.submitting).toBeTrue(); expect(service.createPartner).toHaveBeenCalledTimes(1); pending.next({ id: 8 }); pending.complete(); expect(component.submitting).toBeFalse();
  });
  it('keeps the submission locked while upload is pending', () => {
    const pending = new Subject<any>(); const service: any = { createPartner: jasmine.createSpy().and.returnValue(of({ id: 8 })), uploadPartnerImage: jasmine.createSpy().and.returnValue(pending) }; const component = new NovoParceiroComponent(service, { navigate: jasmine.createSpy() } as any); const submission: any = { payload: { name: 'Nova', category: 'other' }, imageFile: new File(['x'], 'x.png'), removeImage: false };
    component.create(submission); component.create(submission); expect(component.submitting).toBeTrue(); expect(service.createPartner).toHaveBeenCalledTimes(1); expect(service.uploadPartnerImage).toHaveBeenCalledTimes(1); pending.next({}); pending.complete(); expect(component.submitting).toBeFalse();
  });
});
