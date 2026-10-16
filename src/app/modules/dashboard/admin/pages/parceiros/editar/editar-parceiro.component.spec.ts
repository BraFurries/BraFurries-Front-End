import { of, Subject, throwError } from 'rxjs';
import { EditarParceiroComponent } from './editar-parceiro.component';

describe('EditarParceiroComponent', () => {
  const partner: any = { id: 7, name: 'Parceiro', status: 'active', category: 'community', links: [], clicks: 12, invites: 4, createdAt: '2026-09-15' };
  function setup(overrides: any = {}) {
    const service: any = { getPartner: jasmine.createSpy().and.returnValue(of(partner)), updatePartner: jasmine.createSpy().and.returnValue(of(partner)), uploadPartnerImage: jasmine.createSpy().and.returnValue(of({ imageUrl: 'x' })), deletePartnerImage: jasmine.createSpy().and.returnValue(of({ imageUrl: null })), updatePartnerStatus: jasmine.createSpy().and.returnValue(of({ ...partner, status: 'suspended' })), deletePartner: jasmine.createSpy().and.returnValue(of(void 0)), ...overrides };
    const router: any = { navigate: jasmine.createSpy() };
    const dialog: any = { open: jasmine.createSpy().and.returnValue({ afterClosed: () => of(true) }) };
    const route: any = { snapshot: { paramMap: { get: () => '7' } } };
    return { component: new EditarParceiroComponent(route, router, service, dialog), service, router, dialog };
  }
  it('loads the detail endpoint and exposes read-only metrics', () => {
    const { component, service } = setup(); component.ngOnInit();
    expect(service.getPartner).toHaveBeenCalledWith(7); expect(component.partner?.clicks).toBe(12); expect(component.partner?.invites).toBe(4);
  });
  it('handles a detail 404', () => {
    const { component } = setup({ getPartner: () => throwError(() => ({ status: 404 })) }); component.ngOnInit();
    expect(component.notFound).toBeTrue();
  });
  it('keeps a generic load error visible when the detail request fails', () => {
    const { component } = setup({ getPartner: () => throwError(() => ({ status: 500 })) }); component.ngOnInit();
    expect(component.loading).toBeFalse(); expect(component.notFound).toBeFalse(); expect(component.partner).toBeNull();
    expect(component.errorMessage).toBe('Não foi possível concluir a operação. Tente novamente.');
  });
  it('patches only the supplied screen payload', () => {
    const { component, service } = setup(); component.ngOnInit();
    const payload: any = { name: 'Editado', category: 'brand', links: [] }; component.save({ payload, imageFile: null, removeImage: false });
    expect(service.updatePartner).toHaveBeenCalledWith(7, payload); expect(payload.linkedResource).toBeUndefined(); expect(payload.representativeUserId).toBeUndefined();
  });
  it('consumes navigation error state once and lets a GET error replace it', () => {
    const original = history.state;
    history.replaceState({ navigationId: 123, foo: 'bar', errorMessage: 'Parceria criada, mas não foi possível enviar a imagem.' }, document.title);
    const replace = spyOn(history, 'replaceState').and.callThrough();
    try {
      const { component } = setup(); component.ngOnInit(); expect(component.errorMessage).toContain('Parceria criada');
      const cleaned = replace.calls.allArgs().map(args => args[0]).find(state => state?.foo === 'bar' && !('errorMessage' in state));
      expect(cleaned).toEqual(jasmine.objectContaining({ navigationId: 123, foo: 'bar' }));
      history.replaceState({ navigationId: 123, errorMessage: 'Parceria criada, mas não foi possível enviar a imagem.' }, document.title);
      const failed = setup({ getPartner: () => throwError(() => ({ status: 500 })) }).component; failed.ngOnInit(); expect(failed.errorMessage).toBe('Não foi possível concluir a operação. Tente novamente.');
    } finally { history.replaceState(original, document.title); }
  });
  it('uploads after PATCH and updates the local image', () => {
    const { component, service } = setup(); component.ngOnInit(); const file = new File(['x'], 'logo.png', { type: 'image/png' });
    component.save({ payload: { name: 'Editado', category: 'brand' }, imageFile: file, removeImage: false });
    expect(service.uploadPartnerImage).toHaveBeenCalledWith(7, file); expect(service.deletePartnerImage).not.toHaveBeenCalled(); expect(component.partner?.imageUrl).toBe('x');
  });
  it('deletes image after PATCH when removal is requested', () => {
    const { component, service } = setup(); component.ngOnInit(); component.save({ payload: { name: 'Editado', category: 'brand' }, imageFile: null, removeImage: true });
    expect(service.deletePartnerImage).toHaveBeenCalledWith(7); expect(service.uploadPartnerImage).not.toHaveBeenCalled(); expect(component.partner?.imageUrl).toBeNull();
  });
  it('does only PATCH for a normal save', () => {
    const { component, service } = setup(); component.ngOnInit(); component.save({ payload: { name: 'Editado', category: 'brand' }, imageFile: null, removeImage: false });
    expect(service.uploadPartnerImage).not.toHaveBeenCalled(); expect(service.deletePartnerImage).not.toHaveBeenCalled(); expect(component.submitting).toBeFalse();
  });
  it('does not run image actions if PATCH fails', () => {
    const { component, service } = setup({ updatePartner: jasmine.createSpy().and.returnValue(throwError(() => ({ status: 500 }))) }); component.ngOnInit(); component.save({ payload: { name: 'Editado', category: 'brand' }, imageFile: new File(['x'], 'x.png'), removeImage: true });
    expect(service.uploadPartnerImage).not.toHaveBeenCalled(); expect(service.deletePartnerImage).not.toHaveBeenCalled(); expect(component.submitting).toBeFalse();
  });
  it('prefers upload over removal and reports a partial upload failure', () => {
    const { component, service } = setup({ uploadPartnerImage: jasmine.createSpy().and.returnValue(throwError(() => new Error())) }); component.ngOnInit();
    component.save({ payload: { name: 'Editado', category: 'brand' }, imageFile: new File(['x'], 'x.png'), removeImage: true });
    expect(service.uploadPartnerImage).toHaveBeenCalled(); expect(service.deletePartnerImage).not.toHaveBeenCalled(); expect(component.errorMessage).toBe('Os dados da parceria foram salvos, mas não foi possível atualizar a imagem.'); expect(component.submitting).toBeFalse();
  });
  it('reports a partial delete failure', () => {
    const { component, service } = setup({ deletePartnerImage: jasmine.createSpy().and.returnValue(throwError(() => new Error())) }); component.ngOnInit();
    component.save({ payload: { name: 'Editado', category: 'brand' }, imageFile: null, removeImage: true });
    expect(service.deletePartnerImage).toHaveBeenCalled(); expect(component.errorMessage).toBe('Os dados da parceria foram salvos, mas não foi possível atualizar a imagem.'); expect(component.submitting).toBeFalse();
  });
  it('requires confirmation before suspension and updates local state', () => {
    const { component, service, dialog } = setup(); component.ngOnInit(); component.confirmStatus();
    expect(dialog.open).toHaveBeenCalled(); expect(service.updatePartnerStatus).toHaveBeenCalledWith(7, 'suspended'); expect(component.partner?.status).toBe('suspended');
  });
  it('reactivates a suspended partner', () => {
    const updated = { ...partner, status: 'active' };
    const { component, service } = setup({ getPartner: () => of({ ...partner, status: 'suspended' }), updatePartnerStatus: jasmine.createSpy().and.returnValue(of(updated)) });
    component.ngOnInit(); component.confirmStatus(); expect(service.updatePartnerStatus).toHaveBeenCalledWith(7, 'active');
  });
  it('does not delete when confirmation is cancelled', () => {
    const { component, service, dialog } = setup(); dialog.open.and.returnValue({ afterClosed: () => of(false) }); component.ngOnInit(); component.confirmDelete();
    expect(service.deletePartner).not.toHaveBeenCalled();
  });
  it('deletes and navigates on success, but not on error', () => {
    const success = setup(); success.component.ngOnInit(); success.component.confirmDelete(); expect(success.router.navigate).toHaveBeenCalled();
    const failure = setup({ deletePartner: () => throwError(() => ({ status: 500 })) }); failure.component.ngOnInit(); failure.component.confirmDelete();
    expect(failure.router.navigate).not.toHaveBeenCalled(); expect(failure.component.errorMessage).toContain('Não foi possível');
  });
  it('blocks a second delete while the first request is pending', () => {
    const pending = new Subject<void>(); const ctx = setup({ deletePartner: jasmine.createSpy().and.returnValue(pending) }); ctx.component.ngOnInit(); ctx.component.confirmDelete(); ctx.component.confirmDelete();
    expect(ctx.service.deletePartner).toHaveBeenCalledTimes(1); pending.complete();
  });
});
