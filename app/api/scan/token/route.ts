import { tokenScanRequestSchema } from '@/lib/schemas'

export async function POST(request: Request) {
  const parsed = tokenScanRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 })
  return Response.json({ error: 'not_implemented' }, { status: 501 })
}
