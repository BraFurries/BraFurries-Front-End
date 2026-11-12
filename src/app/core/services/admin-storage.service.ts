import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type StorageBucket = 'PRIVATE' | 'PUBLIC';
export type StorageCategory = 'CONTRACT_DOCUMENT' | 'ARTWORK_FILE' | 'OTHER_PRIVATE' | 'PUBLIC_MEDIA';
export type StorageReferenceStatus = 'LINKED' | 'ORPHAN' | 'RECENT' | 'UNVERIFIED';

export interface StoredObject {
  key: string;
  sizeBytes: number;
  lastModified: string | null;
  contentType: string | null;
  etag: string | null;
  category: StorageCategory;
  referenceStatus: StorageReferenceStatus;
  referenceLabel: string;
  deletable: boolean;
}
export interface StorageObjectPage {
  bucket: StorageBucket;
  prefix: string;
  objects: StoredObject[];
  nextCursor: string | null;
  truncated: boolean;
  pageBytes: number;
}

/** Private R2 credentials and physical bucket names remain exclusively in the API. */
@Injectable({ providedIn: 'root' })
export class AdminStorageService {
  private readonly base = `${environment.apiBaseUrl}/user/me/administration/storage`;

  constructor(private readonly http: HttpClient) {}

  list(bucket: StorageBucket, prefix: string, cursor: string | null = null,
       limit = 50): Observable<StorageObjectPage> {
    let params = new HttpParams().set('bucket', bucket).set('prefix', prefix)
      .set('limit', limit.toString());
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<StorageObjectPage>(`${this.base}/objects`, { params });
  }

  inspect(bucket: StorageBucket, key: string): Observable<StoredObject> {
    return this.http.post<StoredObject>(`${this.base}/objects/inspect`, { bucket, key });
  }

  deleteOrphan(bucket: StorageBucket, key: string, etag: string): Observable<void> {
    return this.http.post<void>(`${this.base}/objects/delete-orphan`,
      { bucket, key, etag });
  }
}
