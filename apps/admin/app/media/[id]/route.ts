import { MediaIdParamsSchema } from '@vega/contracts';
import { sessionToken } from '../../account/session';
import { adminApiOrigin } from '../../admin/data';
import { boundedMediaBody } from '../../admin/media-io';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = MediaIdParamsSchema.safeParse(await params);
  if (!parsed.success || new URL(request.url).search)
    return new Response(null, { status: 404, headers });
  try {
    const token = await sessionToken();
    const response = await fetch(
      new URL(`/api/v1/media/${parsed.data.id}`, adminApiOrigin()),
      {
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: 'image/webp',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if ([401, 403, 404].includes(response.status)) {
      await response.body?.cancel();
      return new Response(null, { status: 404, headers });
    }
    if (
      !response.ok ||
      response.headers.get('content-type')?.split(';')[0]?.trim() !==
        'image/webp'
    ) {
      await response.body?.cancel();
      return new Response(null, { status: 503, headers });
    }
    const declared = response.headers.get('content-length');
    if (
      declared &&
      (!/^[0-9]+$/.test(declared) || Number(declared) > 1024 * 1024)
    ) {
      await response.body?.cancel();
      return new Response(null, { status: 503, headers });
    }
    const bytes = await boundedMediaBody(response.body, 1024 * 1024, 5000);
    if (!bytes.byteLength) return new Response(null, { status: 503, headers });
    return new Response(bytes, {
      headers: {
        ...headers,
        'Content-Type': 'image/webp',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': 'inline; filename="photo.webp"',
      },
    });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
