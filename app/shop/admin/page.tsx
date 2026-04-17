'use client'

import { useState, useEffect } from 'react'

interface Product {
  id: string
  name: string
  artist?: string
  catno?: string
  price: number
  category: 'lp' | '7inch' | 'merch'
  image: string
  description: string
  variants?: string[]
  stock: number
}

const CATEGORIES = ['lp', '7inch', 'merch'] as const

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    category: 'lp', price: 0, stock: 0, image: '', name: '', artist: '', description: '',
  })

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    fetch('/api/shop/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setAuthed(true)
          loadProducts()
        } else {
          setAuthError('Incorrect password.')
        }
      })
  }

  function loadProducts() {
    setLoading(true)
    fetch('/api/shop/products')
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false) })
  }

  function updateProduct(id: string, field: keyof Product, value: string | number) {
    setProducts(prev =>
      prev.map(p => p.id === id ? { ...p, [field]: value } : p)
    )
  }

  async function saveAll() {
    setSaving(true)
    setSaveMsg('')
    const res = await fetch('/api/shop/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products, password }),
    })
    const data = await res.json()
    setSaving(false)
    setSaveMsg(data.ok ? 'Saved!' : 'Error saving.')
    setTimeout(() => setSaveMsg(''), 2500)
  }

  function deleteProduct(id: string) {
    if (!confirm('Delete this product?')) return
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  function addProduct() {
    if (!newProduct.name || !newProduct.id) return
    const p: Product = {
      id: newProduct.id!,
      name: newProduct.name!,
      artist: newProduct.artist,
      catno: newProduct.catno,
      price: Number(newProduct.price) || 0,
      category: (newProduct.category as Product['category']) || 'lp',
      image: newProduct.image || '',
      description: newProduct.description || '',
      variants: newProduct.variants,
      stock: Number(newProduct.stock) || 0,
    }
    setProducts(prev => [...prev, p])
    setNewProduct({ category: 'lp', price: 0, stock: 0, image: '', name: '', artist: '', description: '' })
  }

  if (!authed) {
    return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
        <form onSubmit={handleAuth} style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: 40, minWidth: 320 }}>
          <h1 style={{ color: '#F0ECE2', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Shop Admin</h1>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>New Orleans Record Press</p>
          <label style={{ color: '#888', fontSize: 13, display: 'block', marginBottom: 6 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '10px 12px', color: '#F0ECE2', fontSize: 15, marginBottom: 12, boxSizing: 'border-box' }}
            autoFocus
          />
          {authError && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{authError}</p>}
          <button
            type="submit"
            style={{ width: '100%', background: '#00E86A', color: '#0a0a0a', border: 'none', borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Sign In
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', color: '#F0ECE2', fontFamily: "'Space Grotesk', system-ui, sans-serif", padding: '32px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Shop Admin</h1>
            <p style={{ color: '#888', fontSize: 14 }}>Manage products, stock, and pricing</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {saveMsg && <span style={{ color: saveMsg === 'Saved!' ? '#00E86A' : '#ff6b6b', fontSize: 14 }}>{saveMsg}</span>}
            <button
              onClick={saveAll}
              disabled={saving}
              style={{ background: '#00E86A', color: '#0a0a0a', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving...' : 'Save All Changes'}
            </button>
            <a href="/shop" style={{ color: '#888', fontSize: 14, textDecoration: 'none', padding: '10px 16px', border: '1px solid #2a2a2a', borderRadius: 8 }}>← View Shop</a>
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#555' }}>Loading...</p>
        ) : (
          <>
            {/* Product Table */}
            <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden', marginBottom: 32 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                    {['ID', 'Name / Artist', 'Cat', 'Price ($)', 'Stock', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#888', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'monospace' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #1a1a1a', background: i % 2 === 0 ? 'transparent' : '#0f0f0f' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#555', fontFamily: 'monospace' }}>{p.id}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#F0ECE2' }}>{p.name}</div>
                        {p.artist && <div style={{ fontSize: 12, color: '#888' }}>{p.artist}</div>}
                        {p.catno && <div style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>{p.catno}</div>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#888', fontFamily: 'monospace' }}>{p.category}</span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <input
                          type="number"
                          value={p.price / 100}
                          onChange={e => updateProduct(p.id, 'price', Math.round(parseFloat(e.target.value) * 100) || 0)}
                          style={{ width: 80, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, padding: '4px 8px', color: '#F0ECE2', fontSize: 13 }}
                          step="0.01"
                          min="0"
                        />
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <input
                          type="number"
                          value={p.stock}
                          onChange={e => updateProduct(p.id, 'stock', parseInt(e.target.value) || 0)}
                          style={{ width: 70, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, padding: '4px 8px', color: p.stock > 0 ? '#00E86A' : '#888', fontSize: 13 }}
                          min="0"
                        />
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <button
                          onClick={() => deleteProduct(p.id)}
                          style={{ background: 'none', border: '1px solid #3a1a1a', borderRadius: 4, color: '#ff6b6b', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add New Product */}
            <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: '#F0ECE2' }}>Add New Product</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {[
                  { key: 'id', label: 'ID (slug)', type: 'text' },
                  { key: 'name', label: 'Name', type: 'text' },
                  { key: 'artist', label: 'Artist', type: 'text' },
                  { key: 'catno', label: 'Cat #', type: 'text' },
                  { key: 'description', label: 'Description', type: 'text' },
                  { key: 'image', label: 'Image URL', type: 'text' },
                  { key: 'price', label: 'Price ($)', type: 'number' },
                  { key: 'stock', label: 'Stock', type: 'number' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</label>
                    <input
                      type={f.type}
                      value={f.type === 'number' ? (newProduct[f.key as keyof Product] as number ?? 0) : (newProduct[f.key as keyof Product] as string ?? '')}
                      onChange={e => setNewProduct(prev => ({ ...prev, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                      step={f.key === 'price' ? '0.01' : undefined}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', color: '#F0ECE2', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
                <div>
                  <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</label>
                  <select
                    value={newProduct.category}
                    onChange={e => setNewProduct(prev => ({ ...prev, category: e.target.value as Product['category'] }))}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', color: '#F0ECE2', fontSize: 13, boxSizing: 'border-box' }}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={addProduct}
                style={{ marginTop: 16, background: '#1a1a2a', border: '1px solid #3a3a5a', borderRadius: 8, color: '#aaaaee', fontSize: 14, fontWeight: 600, padding: '10px 20px', cursor: 'pointer' }}
              >
                + Add Product
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
