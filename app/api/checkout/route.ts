import { getStripe } from '@/lib/stripe'
import { SCAN_PRODUCT } from '@/lib/products'

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'payments_not_configured' }, { status: 503 })
  }

  const origin = request.headers.get('origin') ?? process.env.VERCEL_URL
  const baseUrl = origin?.startsWith('http') ? origin : `https://${origin}`

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: SCAN_PRODUCT.name, description: SCAN_PRODUCT.description },
          unit_amount: SCAN_PRODUCT.priceInCents,
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/pulse/index.html?payment=success`,
      cancel_url: `${baseUrl}/pulse/index.html?payment=cancelled`,
      metadata: { productId: SCAN_PRODUCT.id },
    })

    return Response.json({ url: session.url })
  } catch (error) {
    console.error('[v0] Stripe checkout creation failed', error)
    return Response.json({ error: 'checkout_unavailable' }, { status: 502 })
  }
}
