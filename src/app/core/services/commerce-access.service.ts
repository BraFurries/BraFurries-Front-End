import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CommerceAccess {
  enabled: boolean;
  owner: boolean;
  permissions: string[];
}

export interface CommerceApprovedPerson {
  userId: number;
  name: string;
  permissions: string[];
}

export interface CommerceEligiblePerson {
  userId: number;
  name: string;
}

export interface CommerceTeamRole {
  roleId: number;
  name: string;
  active: boolean;
  permissions: string[];
}

/** Not a CommunityCapability; these grants are specific to the BraFurries company. */
export const COMMERCE_PERMISSIONS = [
  { code: 'ARTWORKS_MANAGE', label: 'Gerenciar artes', description: 'Cadastrar obras, artistas e valores de criação.' },
  { code: 'CONTRACTS_MANAGE', label: 'Gerenciar contratos', description: 'Cadastrar modelos e consultar contratos privados.' },
  { code: 'SUPPLIERS_MANAGE', label: 'Gerenciar fornecedores', description: 'Cadastrar fornecedores e lotes de produção.' },
  { code: 'PRODUCTS_MANAGE', label: 'Gerenciar produtos', description: 'Cadastrar produtos, custos e preços.' },
  { code: 'SALES_MANAGE', label: 'Gerenciar vendas', description: 'Registrar vendas, cancelamentos e estornos.' },
  { code: 'FINANCE_VIEW', label: 'Visualizar financeiro', description: 'Consultar receitas, custos, repasses e saldos.' },
  { code: 'SETTLEMENTS_MANAGE', label: 'Realizar fechamentos', description: 'Apurar e aprovar fechamentos mensais.' },
  { code: 'PAYMENTS_RECORD', label: 'Registrar pagamentos', description: 'Registrar baixas e comprovantes, sem transferir dinheiro.' }
] as const;

export type CommercePermissionCode = typeof COMMERCE_PERMISSIONS[number]['code'];

@Injectable({ providedIn: 'root' })
export class CommerceAccessService {
  private readonly baseUrl = `${environment.apiBaseUrl}/user/me/brafurries-commerce/access`;

  constructor(private readonly http: HttpClient) {}

  myAccess(): Observable<CommerceAccess> {
    return this.http.get<CommerceAccess>(`${this.baseUrl}/me`);
  }

  approvedPeople(): Observable<CommerceApprovedPerson[]> {
    return this.http.get<CommerceApprovedPerson[]>(`${this.baseUrl}/people`);
  }

  eligiblePeople(search: string): Observable<CommerceEligiblePerson[]> {
    return this.http.get<CommerceEligiblePerson[]>(`${this.baseUrl}/people/search`, {
      params: { search }
    });
  }

  teamRoles(): Observable<CommerceTeamRole[]> {
    return this.http.get<CommerceTeamRole[]>(`${this.baseUrl}/team-roles`);
  }

  approve(userId: number): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/people/${userId}`, {});
  }

  revoke(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/people/${userId}`);
  }

  personPermission(userId: number, code: CommercePermissionCode, granted: boolean): Observable<void> {
    const url = `${this.baseUrl}/people/${userId}/permissions/${code}`;
    return granted ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }

  rolePermission(roleId: number, code: CommercePermissionCode, granted: boolean): Observable<void> {
    const url = `${this.baseUrl}/team-roles/${roleId}/permissions/${code}`;
    return granted ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }
}
