import { HttpClient, HttpDownloadProgressEvent, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { defer, Observable, repeat, retry, switchMap, throwError, timer } from 'rxjs';
import { UserService } from './user.service';

class StreamSessionExpiredError extends Error {
  constructor() {
    super('A sessão administrativa expirou. Faça login novamente.');
  }
}

export interface LiveHttpEvent<T> {
  type: string;
  data: T;
}

/**
 * Authenticated SSE over HttpClient. Interceptors supply Bearer headers, unlike
 * native EventSource. The connection stays open until transport failure,
 * unsubscribe, or the signed JWT expires; reconnects first refresh the token.
 */
@Injectable({ providedIn: 'root' })
export class HttpEventStreamService {
  constructor(private readonly http: HttpClient, private readonly userService: UserService) {}

  watch<T>(url: string | (() => string)): Observable<LiveHttpEvent<T>> {
    return defer(() => this.userService.ensureValidSession().pipe(
      switchMap(valid => valid
        ? new Observable<LiveHttpEvent<T>>(observer => {
              let offset = 0;
              let buffered = '';
              const request = this.http.get(typeof url === 'function' ? url() : url, {
                observe: 'events',
                reportProgress: true,
                responseType: 'text'
              }).subscribe({
                next: event => {
                  if (event.type !== HttpEventType.DownloadProgress) return;
                  const current = (event as HttpDownloadProgressEvent).partialText;
                  if (current === undefined) return;
                  buffered += current.slice(offset);
                  offset = current.length;
                  if (buffered.length > 1_048_576) {
                    observer.error(new Error('SSE event too large'));
                    return;
                  }
                  const frames = buffered.split(/\r?\n\r?\n/);
                  buffered = frames.pop() ?? '';
                  for (const frame of frames) {
                    const lines = frame.split(/\r?\n/);
                    const type = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
                    const data = lines.filter(line => line.startsWith('data:'))
                      .map(line => line.slice(5).trimStart()).join('\n');
                    if (!type || !data) continue;
                    try {
                      observer.next({ type, data: JSON.parse(data) as T });
                    } catch {
                      observer.error(new Error('Invalid SSE event'));
                      return;
                    }
                  }
                },
                complete: () => observer.complete(),
                error: error => observer.error(error)
              });
              return () => request.unsubscribe();
        })
        : throwError(() => this.userService.getAccessToken()
          ? new Error('Renovação temporariamente indisponível')
          : new StreamSessionExpiredError()
        )
      )
    )).pipe(
      retry({
        delay: (error, attempt) => error instanceof StreamSessionExpiredError
          ? throwError(() => error)
          : timer(Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)))
      }),
      repeat({ delay: () => timer(1500) })
    );
  }
}
