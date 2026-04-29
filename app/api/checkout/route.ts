import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { readFileSync } from 'fs'
import { join } from 'path'

interface CartItem {
  id: string
  qty: number
  variant?: string
}

interface Product {
  id: string
  name: string
  artist?: string
  price: number
  image: string
  stock: number
}

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });
  return _stripe;
}

export async function POST(req: NextRequest) {
  try {
    const { items }: { items: CartItem[] } = await req.json()
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items in cart' }, { status: 400 })
    }

    const filePath = join(process.cwd(), 'app', 'shop', 'products.json')
    const products: Product[] = JSON.parse(readFileSync(filePath, 'utf-8'))
    const productMap = new Map(products.map(p => [p.id, p]))

    const lineItems: NonNullable<Stripe.Checkout.SessionCreateParams['line_items']> = []

    for (const item of items) {
      const product = productMap.get(item.id)
      if (!product) continue
      if (product.price === 0) continue // skip TBD priced items

      const productName = item.variant
        ? `${product.name}${(product as any).artist ? ` — ${(product as any).artist}` : ''} (${item.variant})`
        : `${product.name}${(product as any).artist ? ` — ${(product as any).artist}` : ''}`

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: productName,
            images: product.image.startsWith('http') ? [product.image] : [],
          },
          unit_amount: product.price,
        },
        quantity: item.qty,
      })
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'No valid items for checkout' }, { status: 400 })
    }

    const origin = req.headers.get('origin') || 'http://localhost:3000'
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/shop?success=1`,
      cancel_url: `${origin}/shop`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
