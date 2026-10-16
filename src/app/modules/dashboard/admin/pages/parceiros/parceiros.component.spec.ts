import { of } from 'rxjs';
import { AdminPartnersComponent } from './parceiros.component';

describe('AdminPartnersComponent', () => {
  const partner: any = { id: 4, status: 'active' };
  it('navigates to create and edit pages', () => {
    const router = { navigate: jasmine.createSpy('navigate'), getCurrentNavigation: () => null } as any;
    const component = new AdminPartnersComponent({} as any, router);
    component.createPartner(); component.editPartner(partner);
    expect(router.navigate).toHaveBeenCalledWith(['/painel/admin/parceiros/novo']);
    expect(router.navigate).toHaveBeenCalledWith(['/painel/admin/parceiros', 4, 'editar']);
  });
  it('keeps the quick suspend action functional', () => {
    const service = { updatePartnerStatus: jasmine.createSpy('update').and.returnValue(of({ ...partner, status: 'suspended' })) } as any;
    const component = new AdminPartnersComponent(service, { getCurrentNavigation: () => null } as any); component.partners = [partner]; component.togglePartnerStatus(partner);
    expect(service.updatePartnerStatus).toHaveBeenCalledWith(4, 'suspended'); expect(component.partners[0].status).toBe('suspended');
  });
  it('labels the artist category', () => {
    const component = new AdminPartnersComponent({} as any, { getCurrentNavigation: () => null } as any);
    expect(component.getCategoryLabel('artist')).toBe('Artista');
  });
});
