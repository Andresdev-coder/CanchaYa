import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Api } from '../core/api';
import type { PageResult } from '../core/models';

/** Carga el establecimiento antes de mostrar la página, para que el servidor ya entregue su nombre. */
export const pageResolver: ResolveFn<PageResult> = (route) => {
  const slug = route.paramMap.get('slug') ?? '';
  return inject(Api)
    .page(slug)
    .pipe(
      map((page): PageResult => ({ page })),
      catchError((err: unknown) =>
        of<PageResult>({
          error: err instanceof HttpErrorResponse && (err.status === 404 || err.status === 400) ? 'not-found' : 'unavailable',
        }),
      ),
    );
};
