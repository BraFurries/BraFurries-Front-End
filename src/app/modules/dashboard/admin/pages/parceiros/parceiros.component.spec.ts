import { of, Subject, throwError } from 'rxjs';
import { AdminPartnersComponent } from './parceiros.component';

describe('AdminPartnersComponent', () => {
  const partner: any = { id: 4, name: 'Exemplo', status: 'active', category: 'community' };
  const router = { navigate: jasmine.createSpy('navigate'), getCurrentNavigation: () => null } as any;

  it('navigates to create and edit pages', () => {
    const component = new AdminPartnersComponent({} as any, router);
    component.createPartner();
    component.editPartner(partner);
    expect(router.navigate).toHaveBeenCalledWith(['/painel/admin/parceiros/novo']);
    expect(router.navigate).toHaveBeenCalledWith(['/painel/admin/parceiros', 4, 'editar']);
  });

  it('groups partners in active, pending, suspended order and sorts names in pt-BR', () => {
    const component = new AdminPartnersComponent({} as any, router);
    component.partners = [
      { id: 1, name: 'Zebra', status: 'pending' },
      { id: 2, name: 'Úrsula', status: 'active' },
      { id: 3, name: 'Águia', status: 'active' },
      { id: 4, name: 'Bicho', status: 'suspended' },
      { id: 5, name: 'Alfa', status: 'pending' }
    ] as any;
    component.groupByStatus = true;
    expect(component.groupedPartners.map(group => group.status)).toEqual(['active', 'pending', 'suspended']);
    expect(component.groupedPartners.map(group => group.items.map(item => item.name)))
      .toEqual([['Águia', 'Úrsula'], ['Alfa', 'Zebra'], ['Bicho']]);
    expect(component.partners.map(item => item.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('starts ungrouped and keeps the status-then-name order in a single grid', () => {
    const component = new AdminPartnersComponent({} as any, router);
    component.partners = [
      { id: 1, name: 'Zebra', status: 'pending' },
      { id: 2, name: 'Úrsula', status: 'active' },
      { id: 3, name: 'Águia', status: 'active' },
      { id: 4, name: 'Bicho', status: 'suspended' },
      { id: 5, name: 'Alfa', status: 'pending' }
    ] as any;

    expect(component.groupByStatus).toBeFalse();
    expect(component.groupedPartners.length).toBe(1);
    expect(component.groupedPartners[0].status).toBeNull();
    expect(component.groupedPartners[0].items.map(item => item.id)).toEqual([3, 2, 5, 1, 4]);
    component.groupByStatus = true;
    expect(component.groupedPartners.map(group => group.status)).toEqual(['active', 'pending', 'suspended']);
    expect(component.groupedPartners.flatMap(group => group.items).map(item => item.id)).toEqual([3, 2, 5, 1, 4]);
    component.groupByStatus = false;
    expect(component.groupedPartners[0].items.map(item => item.id)).toEqual([3, 2, 5, 1, 4]);
  });

  it('does not display empty sections in either mode', () => {
    const component = new AdminPartnersComponent({} as any, router);
    expect(component.groupedPartners).toEqual([]);
    component.groupByStatus = true;
    expect(component.groupedPartners).toEqual([]);
  });

  it('offers an appropriate action for each status', () => {
    const component = new AdminPartnersComponent({} as any, router);
    expect(component.getStatusActionLabel('pending')).toBe('Ativar');
    expect(component.getStatusActionLabel('active')).toBe('Suspender');
    expect(component.getStatusActionLabel('suspended')).toBe('Reativar');
    expect(component.getNextStatus('pending')).toBe('active');
    expect(component.getNextStatus('active')).toBe('suspended');
    expect(component.getNextStatus('suspended')).toBe('active');
  });

  it('keeps the quick suspend action functional and moves the card to its new group', () => {
    const service = {
      updatePartnerStatus: jasmine.createSpy('update').and.returnValue(
        of({ ...partner, status: 'suspended' })
      )
    } as any;
    const component = new AdminPartnersComponent(service, router);
    component.partners = [partner];
    component.togglePartnerStatus(partner);
    expect(service.updatePartnerStatus).toHaveBeenCalledWith(4, 'suspended');
    expect(component.groupedPartners[0].status).toBe('suspended');
    expect(component.updatingPartnerId).toBeNull();
  });

  it('activates a pending partner and removes the card from a pending-only filter', () => {
    const pending = { ...partner, status: 'pending' };
    const service = {
      updatePartnerStatus: jasmine.createSpy('update').and.returnValue(
        of({ ...partner, status: 'active' })
      )
    } as any;
    const component = new AdminPartnersComponent(service, router);
    component.partners = [pending];
    component.status = 'pending';
    component.togglePartnerStatus(pending);
    expect(service.updatePartnerStatus).toHaveBeenCalledWith(4, 'active');
    expect(component.groupedPartners).toEqual([]);
  });

  it('prevents duplicate status requests until the first one returns', () => {
    const pending = { ...partner, status: 'pending' };
    const response = new Subject<any>();
    const service = {
      updatePartnerStatus: jasmine.createSpy('update').and.returnValue(response)
    } as any;
    const component = new AdminPartnersComponent(service, router);
    component.partners = [pending];
    component.togglePartnerStatus(pending);
    component.togglePartnerStatus(pending);
    expect(service.updatePartnerStatus).toHaveBeenCalledTimes(1);
    expect(component.updatingPartnerId).toBe(4);
    response.next({ ...partner, status: 'active' });
    response.complete();
    expect(component.updatingPartnerId).toBeNull();
    expect(component.groupedPartners[0].status).toBe('active');
  });

  it('preserves the previous state when the API rejects the update', () => {
    const service = {
      updatePartnerStatus: jasmine.createSpy('update').and.returnValue(throwError(() => new Error('403')))
    } as any;
    const component = new AdminPartnersComponent(service, router);
    component.partners = [partner];
    component.togglePartnerStatus(partner);
    expect(component.partners[0].status).toBe('active');
    expect(component.errorMessage).toContain('Não foi possível');
    expect(component.updatingPartnerId).toBeNull();
  });

  it('labels the artist category', () => {
    const component = new AdminPartnersComponent({} as any, router);
    expect(component.getCategoryLabel('artist')).toBe('Artista');
  });
});
