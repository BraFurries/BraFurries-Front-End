import { of } from 'rxjs';
import { AdminUsersComponent } from './usuarios.component';

function response() {
  return {
    items: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }
  };
}

function component(getUsers = jasmine.createSpy().and.returnValue(of(response()))): AdminUsersComponent {
  return new AdminUsersComponent(
    { getUsers } as any,
    { restore: () => null, save: jasmine.createSpy() } as any
  );
}

describe('AdminUsersComponent search', () => {
  it('sends a Discord User ID unchanged while preserving filters and pagination', () => {
    const getUsers = jasmine.createSpy().and.returnValue(of(response()));
    const page = component(getUsers);
    page.search = '123456789012345678';
    page.status = 'active';
    page.role = 'moderator';

    page.loadUsers(3, 50);

    expect(getUsers).toHaveBeenCalledWith({
      page: 3,
      pageSize: 50,
      search: '123456789012345678',
      status: 'active',
      role: 'moderator'
    });
  });

  it('keeps the existing textual search behavior', () => {
    const getUsers = jasmine.createSpy().and.returnValue(of(response()));
    const page = component(getUsers);
    page.search = '  Furry  ';

    page.applyFilters();

    expect(getUsers).toHaveBeenCalledWith(jasmine.objectContaining({
      page: 1,
      search: 'Furry',
      status: '',
      role: ''
    }));
  });
});
