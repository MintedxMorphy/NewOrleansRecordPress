'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'

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
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Header />

      {/* Page content pushed below fixed header */}
      <main className="pt-20">

        {/* Section Header */}
        <section className="py-16 md:py-20 text-center">
          <div className="max-w-7xl mx-auto px-6">
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-accent mb-4">From the Press</p>

            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Records &amp; merch from New Orleans Record Press
            </p>
          </div>
        </section>

        {/* Category Tabs */}
        <div className="max-w-7xl mx-auto px-6 pb-8">
          <div className="flex gap-2 justify-center flex-wrap">
            {(Object.keys(categoryLabels) as Category[]).map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider border transition-colors ${
                  category === cat
                    ? 'bg-card border-primary text-primary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                {categoryLabels[cat]}
              </button>
            ))}
            <button
              onClick={() => setCartOpen(true)}
              className="ml-4 px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors flex items-center gap-2"
            >
              Cart
              {cartCount() > 0 && (
                <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                  {cartCount()}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Product Grid */}
        <section className="max-w-7xl mx-auto px-6 pb-20">
          {loading ? (
            <p className="text-center text-muted-foreground py-16">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-16">No products found.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
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
        </section>
      </main>

      <Footer />

      {/* Cart Drawer */}
      {cartOpen && (
        <>
          <div
            onClick={() => setCartOpen(false)}
            className="fixed inset-0 bg-black/60 z-[200]"
          />
          <div className="fixed top-0 right-0 bottom-0 w-96 max-w-[95vw] bg-card border-l border-border z-[201] flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-lg font-bold uppercase tracking-wider text-foreground">
                Cart ({cartCount()})
              </h2>
              <button
                onClick={() => setCartOpen(false)}
                className="text-muted-foreground hover:text-foreground text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Drawer Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {cart.length === 0 ? (
                <p className="text-muted-foreground text-center mt-8">Your cart is empty.</p>
              ) : (
                cart.map(item => (
                  <div
                    key={item.product.id + (item.variant ?? '')}
                    className="flex gap-3 mb-4 items-start"
                  >
                    <div className="w-14 h-14 bg-background rounded border border-border flex-shrink-0 overflow-hidden">
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{item.product.name}</div>
                      {item.product.artist && (
                        <div className="text-xs text-muted-foreground">{item.product.artist}</div>
                      )}
                      {item.variant && (
                        <div className="text-xs text-muted-foreground">Size: {item.variant}</div>
                      )}
                      <div className="text-sm text-primary mt-1 font-medium">
                        {formatPrice(item.product.price)} × {item.qty}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id, item.variant)}
                      className="text-muted-foreground hover:text-foreground text-lg transition-colors px-1"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            {cart.length > 0 && (
              <div className="px-6 py-5 border-t border-border">
                <div className="flex justify-between mb-4 text-base">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold text-foreground">{formatPrice(cartTotal())}</span>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className={`w-full py-4 rounded-lg font-bold uppercase tracking-wider text-sm transition-all ${
                    checkingOut
                      ? 'bg-card border border-border text-muted-foreground cursor-not-allowed'
                      : 'bg-primary text-primary-foreground glow-green hover:bg-primary/90 cursor-pointer'
                  }`}
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
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col hover:border-border/80 transition-colors group">
      {/* Image */}
      <div className="relative aspect-square bg-background overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover block group-hover:scale-[1.02] transition-transform duration-300"
          onError={e => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            const parent = target.parentElement
            if (parent) {
              parent.classList.add('flex', 'items-center', 'justify-center')
              parent.innerHTML = '<span class="text-5xl opacity-20">♪</span>'
            }
          }}
        />
        {outOfStock && (
          <div className="absolute top-2 right-2 bg-black/80 border border-border text-muted-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
            Out of Stock
          </div>
        )}
        {isExperience && (
          <div className="absolute top-2 right-2 bg-accent/10 border border-accent text-accent text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
            Experience
          </div>
        )}
        {product.catno && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-muted-foreground text-[10px] font-mono px-2 py-0.5 rounded">
            {product.catno}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex-1 flex flex-col gap-1">
        <div className="text-sm font-semibold text-foreground leading-snug">{product.name}</div>
        {product.artist && product.artist !== product.name && (
          <div className="text-xs text-muted-foreground">{product.artist}</div>
        )}
        <div className="text-base font-bold text-primary mt-1">
          {formatPrice(product.price)}{isExperience ? ' / person' : ''}
        </div>
        {product.bookingInfo && (
          <div className="text-xs text-muted-foreground mt-0.5">{product.bookingInfo}</div>
        )}

        {/* Size selector */}
        {needsVariant && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {product.variants!.map(v => (
              <button
                key={v}
                onClick={() => onSelectVariant(v)}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                  selectedVariant === v
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground/30'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onAddToCart}
          disabled={outOfStock || (needsVariant ? !selectedVariant : false)}
          className={`mt-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
            outOfStock
              ? 'bg-card border border-border text-muted-foreground cursor-not-allowed'
              : needsVariant && !selectedVariant
              ? 'bg-card border border-border text-muted-foreground cursor-not-allowed'
              : isExperience
              ? 'bg-accent/10 border border-accent text-accent hover:bg-accent/20 cursor-pointer'
              : 'bg-primary text-primary-foreground glow-green hover:bg-primary/90 cursor-pointer'
          }`}
        >
          {outOfStock
            ? 'Out of Stock'
            : isExperience
            ? 'Book Now →'
            : needsVariant && !selectedVariant
            ? 'Select a Size'
            : 'Add to Cart'}
        </button>
      </div>
    </div>
  )
}
