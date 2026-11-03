import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreatedCommerceEntity { id: number; }
export interface CommerceContractTemplate {
  id: number; name: string; description: string | null; modality: string;
  royaltyMethod: string; royaltyPercent: number | null; royaltyFixedAmount: number | null; active: boolean;
}
export interface CommerceArtist { id: number; name: string; }
export interface CommerceArtwork {
  id: number; title: string; description: string | null; artistUserId: number;
  artistName: string; creationCost: number; status: string;
}
export interface CommerceSupplier {
  id: number; name: string; contactName: string | null; email: string | null;
  phone: string | null; notes: string | null; active: boolean;
}
export interface CommerceProduct {
  id: number; sku: string; name: string; description: string | null;
  estimatedUnitCost: number; suggestedPrice: number; active: boolean;
}
export interface CommerceBatch {
  id: number; productId: number; productName: string; supplierId: number; supplierName: string;
  quantity: number; unitCost: number; additionalCost: number; totalCost: number;
  producedOn: string; reference: string | null;
}
export interface CommerceProductArtwork {
  artworkId: number; title: string; royaltyAllocationPercent: number | null;
}
export interface CommerceSignedAgreement {
  id: number; artworkId: number; templateId: number; artistUserId: number;
  modality: string; royaltyMethod: string; royaltyPercent: number | null;
  royaltyFixedAmount: number | null; oneTimeAmount: number;
  effectiveFrom: string; effectiveUntil: string | null;
  sha256: string; sizeBytes: number; status: 'ACTIVE' | 'TERMINATED';
}
export interface CreateTemplateInput {
  name: string; description: string | null; modality: string; royaltyMethod: string;
  royaltyPercent: number | null; royaltyFixedAmount: number | null;
}
export interface CreateArtworkInput {
  title: string; description: string | null; artistUserId: number; creationCost: number;
}
export interface CreateSupplierInput {
  name: string; contactName: string | null; email: string | null;
  phone: string | null; notes: string | null;
}
export interface CreateProductInput {
  sku: string; name: string; description: string | null;
  estimatedUnitCost: number; suggestedPrice: number;
}
export interface CreateBatchInput {
  productId: number; supplierId: number; quantity: number; unitCost: number;
  additionalCost: number; producedOn: string; reference: string | null;
}

@Injectable({ providedIn: 'root' })
export class CommerceCatalogService {
  private readonly base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/catalog`;

  constructor(private readonly http: HttpClient) {}

  templates(): Observable<CommerceContractTemplate[]> {
    return this.http.get<CommerceContractTemplate[]>(`${this.base}/contract-templates`);
  }

  createTemplate(input: CreateTemplateInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/contract-templates`,input);
  }

  artworks(): Observable<CommerceArtwork[]> {
    return this.http.get<CommerceArtwork[]>(`${this.base}/artworks`);
  }

  searchArtists(search: string): Observable<CommerceArtist[]> {
    return this.http.get<CommerceArtist[]>(`${this.base}/artists/search`, {
      params: { search }
    });
  }

  createArtwork(input: CreateArtworkInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/artworks`,input);
  }

  suppliers(): Observable<CommerceSupplier[]> {
    return this.http.get<CommerceSupplier[]>(`${this.base}/suppliers`);
  }

  createSupplier(input: CreateSupplierInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/suppliers`,input);
  }

  products(): Observable<CommerceProduct[]> {
    return this.http.get<CommerceProduct[]>(`${this.base}/products`);
  }

  createProduct(input: CreateProductInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/products`,input);
  }

  productArtworks(productId: number): Observable<CommerceProductArtwork[]> {
    return this.http.get<CommerceProductArtwork[]>(`${this.base}/products/${productId}/artworks`);
  }

  linkArtwork(productId: number, artworkId: number, royaltyAllocationPercent: number | null): Observable<void> {
    return this.http.put<void>(`${this.base}/products/${productId}/artworks/${artworkId}`,{
      royaltyAllocationPercent
    });
  }

  productionBatches(): Observable<CommerceBatch[]> {
    return this.http.get<CommerceBatch[]>(`${this.base}/production-batches`);
  }

  createProductionBatch(input: CreateBatchInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/production-batches`,input);
  }

  contracts(artworkId: number): Observable<CommerceSignedAgreement[]> {
    return this.http.get<CommerceSignedAgreement[]>(`${this.base}/artworks/${artworkId}/contracts`);
  }

  signContract(artworkId: number, input: {
    templateId: number; effectiveFrom: string; effectiveUntil: string | null;
    oneTimeAmount: number; file: File;
  }): Observable<CreatedCommerceEntity> {
    const body = new FormData();
    body.append('templateId',String(input.templateId));
    body.append('effectiveFrom',input.effectiveFrom);
    if (input.effectiveUntil) body.append('effectiveUntil',input.effectiveUntil);
    body.append('oneTimeAmount',input.oneTimeAmount.toFixed(2));
    body.append('file',input.file,input.file.name);
    // Browser defines multipart boundary. Never force Content-Type manually.
    return this.http.post<CreatedCommerceEntity>(
      `${this.base}/artworks/${artworkId}/contracts`,body
    );
  }

  downloadContract(artworkId: number, contractId: number): Observable<Blob> {
    return this.http.get(
      `${this.base}/artworks/${artworkId}/contracts/${contractId}/download`,
      { responseType: 'blob' }
    );
  }

  terminateContract(artworkId: number, contractId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/artworks/${artworkId}/contracts/${contractId}/terminate`,{}
    );
  }
}
