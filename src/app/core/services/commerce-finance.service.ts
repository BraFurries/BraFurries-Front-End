import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface FinanceCreated { id: number; }
export interface CommerceBatchForSale {
  batchId: number;
  productId: number;
  productName: string;
  sku: string;
  suggestedPrice: number;
  availableUnits: number;
}
export interface SaleLineInput {
  batchId: number;
  quantity: number;
  unitPrice: number;
}
export interface CreateCommerceSale {
  requestKey: string;
  channel: 'EVENT' | 'DIRECT' | 'ONLINE' | 'OTHER';
  externalReference: string | null;
  buyerLabel: string | null;
  soldOn: string;
  notes: string | null;
  items: SaleLineInput[];
}
export interface CommercePhysicalSale {
  id: number;
  channel: string;
  externalReference: string | null;
  buyerLabel: string | null;
  soldOn: string;
  status: 'CONFIRMED' | 'CANCELLED';
  grossAmount: number;
  cancellationReason: string | null;
  createdAt: string;
}
export interface CommerceSaleItem {
  id: number;
  productId: number;
  productName: string;
  batchId: number;
  quantity: number;
  unitPrice: number;
  lineGross: number;
}
export interface CommerceRoyaltyEvent {
  id: number;
  artistUserId: number;
  artistName: string;
  artworkId: number;
  contractId: number;
  periodYear: number;
  periodMonth: number;
  eventKind: 'SALE' | 'REVERSAL';
  royaltyMethod: string;
  contractRate: number | null;
  fixedUnit: number | null;
  allocation: number;
  basisAmount: number;
  amount: number;
  saleId: number;
  createdAt: string;
}
export interface CommerceStatement {
  id: number;
  artistUserId: number;
  artistName: string;
  periodYear: number;
  periodMonth: number;
  status: 'DRAFT' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID';
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
  approvedAt: string | null;
}
export interface CommerceStatementItem {
  accrualId: number;
  amount: number;
  artworkId: number;
  contractId: number;
  royaltyMethod: string;
  eventKind: string;
  saleId: number;
}
export interface CommercePayment {
  id: number;
  amount: number;
  paidOn: string;
  externalReference: string;
  notes: string | null;
  createdAt: string;
}
export interface CreateCommercePayment {
  requestKey: string;
  amount: number;
  paidOn: string;
  externalReference: string;
  notes: string | null;
}

/**
 * BRL commerce API contracts; no conversion to Discord coins and no financial
 * business calculation in Front-End.
 */
@Injectable({ providedIn: 'root' })
export class CommerceFinanceService {
  private readonly base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/finance`;

  constructor(private readonly http: HttpClient) {}

  availableBatches(): Observable<CommerceBatchForSale[]> {
    return this.http.get<CommerceBatchForSale[]>(`${this.base}/sales/available-batches`);
  }

  sales(): Observable<CommercePhysicalSale[]> {
    return this.http.get<CommercePhysicalSale[]>(`${this.base}/sales`);
  }

  saleItems(id: number): Observable<CommerceSaleItem[]> {
    return this.http.get<CommerceSaleItem[]>(`${this.base}/sales/${id}/items`);
  }

  createSale(sale: CreateCommerceSale): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.base}/sales`, sale);
  }

  cancelSale(id: number, reason: string): Observable<void> {
    return this.http.post<void>(`${this.base}/sales/${id}/cancel`, { reason });
  }

  royalties(year: number, month: number): Observable<CommerceRoyaltyEvent[]> {
    return this.http.get<CommerceRoyaltyEvent[]>(`${this.base}/royalties`,
      { params: { year: String(year), month: String(month) } });
  }

  statements(year: number, month: number): Observable<CommerceStatement[]> {
    return this.http.get<CommerceStatement[]>(`${this.base}/statements`,
      { params: { year: String(year), month: String(month) } });
  }

  createStatement(artistUserId: number, year: number, month: number): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.base}/statements`,
      { artistUserId, year, month });
  }

  statementItems(id: number): Observable<CommerceStatementItem[]> {
    return this.http.get<CommerceStatementItem[]>(`${this.base}/statements/${id}/items`);
  }

  approveStatement(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/statements/${id}/approve`, {});
  }

  discardStatement(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/statements/${id}/discard`, {});
  }

  payments(id: number): Observable<CommercePayment[]> {
    return this.http.get<CommercePayment[]>(`${this.base}/statements/${id}/payments`);
  }

  recordPayment(id: number, payment: CreateCommercePayment): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.base}/statements/${id}/payments`, payment);
  }
}
