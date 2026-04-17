'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  artist?: string
  catno?: string
  price: number
  category: 'lp' | '7inch' | 'merch' | 'experience'
  image: string
  description: string
  bookingInfo?: string
  variants?: string[]
  stock: number
}

interface CartItem {
  product: Product
  qty: number
  variant?: string
}

type Category = 'all' | 'lp' | '7inch' | 'merch' | 'experience'

const categoryLabels: Record<Category, string> = {
  all: 'All',
  lp: 'Vinyl (LPs)',
  '7inch': 'Singles (7")',
  merch: 'Merch',
  experience: 'Experiences',
}

function formatPrice(cents: number) {
  if (cents === 0) return 'TBD'
  return `$${(cents / 100).toFixed(2)}`
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<Category>('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    fetch('/api/shop/products')
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = category === 'all' ? products : products.filter(p => p.category === category)

  function addToCart(product: Product) {
    if (product.category === 'experience') {
      window.location.href = `mailto:info@neworleansrecordpress.com?subject=Book: ${product.name}&body=${encodeURIComponent(`Hi,\n\nI'd like to book the "${product.name}" experience ($${(product.price / 100).toFixed(0)}/person).\n\n${product.bookingInfo ?? ''}\n\nPlease let me know available dates and next steps.\n\nThank you!`)}`
      return
    }
    if (product.stock === 0) return
    const variant = selectedVariants[product.id]
    setCart(prev => {
      const key = product.id + (variant ?? '')
      const existing = prev.find(i => i.product.id === product.id && i.variant === variant)
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id && i.variant === variant
            ? { ...i, qty: i.qty + 1 }
            : i
        )
      }
      return [...prev, { product, qty: 1, variant }]
    })
    setCartOpen(true)
  }

  function removeFromCart(productId: string, variant?: string) {
    setCart(prev => prev.filter(i => !(i.product.id === productId && i.variant === variant)))
  }

  function cartTotal() {
    return cart.reduce((sum, i) => sum + i.product.price * i.qty, 0)
  }

  function cartCount() {
    return cart.reduce((sum, i) => sum + i.qty, 0)
  }

  async function handleCheckout() {
    if (cart.length === 0) return
    setCheckingOut(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.map(i => ({ id: i.product.id, qty: i.qty, variant: i.variant })) }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Checkout error. Please try again.')
      }
    } catch {
      alert('Checkout error. Please try again.')
    } finally {
      setCheckingOut(false)
    }
  }

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', color: '#F0ECE2', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{ background: '#0a0c0f', borderBottom: '1px solid #2a2c33', padding: '16px 32px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'center', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap' }}>
        <Link href="/">
          <Image src="/staff/norp-logo.png" alt="NORP" width={90} height={90} style={{ height: 90, width: 'auto', marginRight: 12 }} unoptimized />
        </Link>
        <Link href="/" style={{ color: '#6a6858', textDecoration: 'none', fontSize: 18, fontWeight: 600, padding: '10px 20px', borderRadius: 8 }}>Home</Link>
        <Link href="/staff" style={{ color: '#6a6858', textDecoration: 'none', fontSize: 18, fontWeight: 600, padding: '10px 20px', borderRadius: 8 }}>Staff</Link>
        <span style={{ color: '#00E86A', fontSize: 18, fontWeight: 600, padding: '10px 20px', borderRadius: 8, background: '#0a1a10', border: '1px solid #1a4a2a' }}>Shop</span>
        <button
          onClick={() => setCartOpen(true)}
          style={{ marginLeft: 'auto', background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#F0ECE2', borderRadius: 8, padding: '10px 20px', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          Cart {cartCount() > 0 && <span style={{ background: '#00E86A', color: '#0a0a0a', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{cartCount()}</span>}
        </button>
      </nav>

      {/* Header */}
      <div style={{ padding: '48px 32px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-1px', marginBottom: 8 }}>NORP Shop</h1>
        <p style={{ color: '#888', fontSize: 16 }}>Records & merch from New Orleans Record Press</p>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '0 32px 32px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {(Object.keys(categoryLabels) as Category[]).map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: category === cat ? '1px solid #00E86A' : '1px solid #2a2a2a',
              background: category === cat ? '#0a1a10' : '#141414',
              color: category === cat ? '#00E86A' : '#888',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {categoryLabels[cat]}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div style={{ padding: '0 24px 64px', maxWidth: 1200, margin: '0 auto' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#555', padding: 64 }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#555', padding: 64 }}>No products found.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 24 }}>
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                selectedVariant={selectedVariants[product.id]}
                onSelectVariant={v => setSelectedVariants(prev => ({ ...prev, [product.id]: v }))}
                onAddToCart={() => addToCart(product)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cart Drawer */}
      {cartOpen && (
        <>
          <div
            onClick={() => setCartOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, maxWidth: '95vw',
            background: '#141414', borderLeft: '1px solid #2a2a2a', zIndex: 201,
            display: 'flex', flexDirection: 'column', padding: 0,
          }}>
            <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Cart ({cartCount()})</h2>
              <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {cart.length === 0 ? (
                <p style={{ color: '#555', textAlign: 'center', marginTop: 32 }}>Your cart is empty.</p>
              ) : (
                cart.map(item => (
                  <div key={item.product.id + (item.variant ?? '')} style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
                    <div style={{ width: 56, height: 56, background: '#1a1a1a', borderRadius: 4, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                      <img src={item.product.image} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#F0ECE2' }}>{item.product.name}</div>
                      {item.product.artist && <div style={{ fontSize: 12, color: '#888' }}>{item.product.artist}</div>}
                      {item.variant && <div style={{ fontSize: 12, color: '#888' }}>Size: {item.variant}</div>}
                      <div style={{ fontSize: 13, color: '#00E86A', marginTop: 2 }}>{formatPrice(item.product.price)} × {item.qty}</div>
                    </div>
                    <button onClick={() => removeFromCart(item.product.id, item.variant)} style={{ background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>×</button>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ padding: 24, borderTop: '1px solid #2a2a2a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 16 }}>
                  <span style={{ color: '#888' }}>Total</span>
                  <span style={{ fontWeight: 700, color: '#F0ECE2' }}>{formatPrice(cartTotal())}</span>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 8, border: 'none',
                    background: checkingOut ? '#1a1a1a' : '#00E86A',
                    color: checkingOut ? '#555' : '#0a0a0a',
                    fontSize: 16, fontWeight: 700, cursor: checkingOut ? 'not-allowed' : 'pointer',
                    transition: 'all .15s',
                  }}
                >
                  {checkingOut ? 'Redirecting...' : 'Checkout with Stripe →'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ProductCard({
  product,
  selectedVariant,
  onSelectVariant,
  onAddToCart,
}: {
  product: Product
  selectedVariant?: string
  onSelectVariant: (v: string) => void
  onAddToCart: () => void
}) {
  const isExperience = product.category === 'experience'
  const outOfStock = product.stock === 0 && !isExperience
  const needsVariant = product.variants && product.variants.length > 0 && !outOfStock

  return (
    <div style={{
      background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      transition: 'border-color .15s',
    }}>
      {/* Image */}
      <div style={{ position: 'relative', aspectRatio: '1', background: '#1a1a1a', overflow: 'hidden' }}>
        <img
          src={product.image}
          alt={product.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            const parent = target.parentElement
            if (parent) {
              parent.style.display = 'flex'
              parent.style.alignItems = 'center'
              parent.style.justifyContent = 'center'
              parent.innerHTML = '<span style="font-size:48px;opacity:0.2">♪</span>'
            }
          }}
        />
        {outOfStock && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.85)', border: '1px solid #3a3a3a',
            color: '#888', fontSize: 11, fontWeight: 700, padding: '3px 8px',
            borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Out of Stock
          </div>
        )}
        {isExperience && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,232,106,0.15)', border: '1px solid #00E86A',
            color: '#00E86A', fontSize: 11, fontWeight: 700, padding: '3px 8px',
            borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Experience
          </div>
        )}
        {product.catno && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: 'rgba(0,0,0,0.75)', color: '#888', fontSize: 10,
            fontFamily: 'monospace', padding: '2px 6px', borderRadius: 3,
          }}>
            {product.catno}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#F0ECE2', lineHeight: 1.3 }}>{product.name}</div>
        {product.artist && product.artist !== product.name && (
          <div style={{ fontSize: 13, color: '#888' }}>{product.artist}</div>
        )}
        <div style={{ fontSize: 16, fontWeight: 700, color: '#00E86A', marginTop: 4 }}>{formatPrice(product.price)}{isExperience ? ' / person' : ''}</div>
        {product.bookingInfo && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{product.bookingInfo}</div>
        )}

        {/* Size selector (clothing only, when in stock) */}
        {needsVariant && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {product.variants!.map(v => (
              <button
                key={v}
                onClick={() => onSelectVariant(v)}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  border: selectedVariant === v ? '1px solid #00E86A' : '1px solid #2a2a2a',
                  background: selectedVariant === v ? '#0a1a10' : '#1a1a1a',
                  color: selectedVariant === v ? '#00E86A' : '#888',
                  cursor: 'pointer',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Add to cart */}
        <button
          onClick={onAddToCart}
          disabled={outOfStock || (needsVariant ? !selectedVariant : false)}
          style={{
            marginTop: 12, padding: '10px', borderRadius: 8, border: 'none',
            background: outOfStock ? '#1a1a1a' : (needsVariant && !selectedVariant ? '#1a1a1a' : '#00E86A'),
            color: outOfStock ? '#444' : (needsVariant && !selectedVariant ? '#555' : '#0a0a0a'),
            fontSize: 14, fontWeight: 700, cursor: outOfStock ? 'not-allowed' : 'pointer',
            transition: 'all .15s',
          }}
        >
          {outOfStock ? 'Out of Stock' : isExperience ? 'Book Now →' : (needsVariant && !selectedVariant ? 'Select a Size' : 'Add to Cart')}
        </button>
      </div>
    </div>
  )
}
