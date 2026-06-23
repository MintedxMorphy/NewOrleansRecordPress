'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface PVCColor {
  lbs: number
  status: string
}

interface Inventory {
  pvc: {
    capacity: number
    colors: {
      black: PVCColor
      clear: PVCColor
      yellow: PVCColor
      red: PVCColor
    }
  }
  innerSleeves: {
    whitePaper: number
    blackPaper: number
    whitePoly: number
    blackPoly: number
    ricePaper: number
  }
  outerSleeves: {
    twoMil: number
    twoMilResealable: number
    threeMil: number
  }
  boxes: {
    innerBox: number
    outerBox: number
    shippingBox: number
  }
}

const CATEGORIES = ['lp', '7inch', 'merch'] as const

// ─── Shared Styles ────────────────────────────────────────────────────────────

const S = {
  page: { background: '#0a0a0a', minHeight: '100vh', color: '#F0ECE2', fontFamily: "'Space Grotesk', system-ui, sans-serif" } as React.CSSProperties,
  nav: { background: '#0d0d0d', borderBottom: '1px solid #2a2a2a', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
  navLeft: { display: 'flex', alignItems: 'center', gap: 0 } as React.CSSProperties,
  navBrand: { fontSize: 15, fontWeight: 700, color: '#F0ECE2', padding: '16px 16px 16px 0', marginRight: 16, borderRight: '1px solid #2a2a2a' } as React.CSSProperties,
  navRight: { display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
  content: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' } as React.CSSProperties,
  card: { background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden', marginBottom: 24 } as React.CSSProperties,
  cardPad: { background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24, marginBottom: 24 } as React.CSSProperties,
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#F0ECE2', marginBottom: 20 } as React.CSSProperties,
  label: { color: '#888', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontFamily: 'monospace' },
  input: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', color: '#F0ECE2', fontSize: 13, width: '100%', boxSizing: 'border-box' as const },
  numInput: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, padding: '4px 8px', color: '#F0ECE2', fontSize: 13 } as React.CSSProperties,
  btnGreen: { background: '#1A53FF', color: '#0a0a0a', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { background: 'none', border: '1px solid #2a2a2a', borderRadius: 8, color: '#888', fontSize: 13, padding: '8px 16px', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' } as React.CSSProperties,
  btnDanger: { background: 'none', border: '1px solid #3a1a1a', borderRadius: 4, color: '#ff6b6b', fontSize: 12, padding: '4px 10px', cursor: 'pointer' } as React.CSSProperties,
  btnBlue: { background: '#1a1a2a', border: '1px solid #3a3a5a', borderRadius: 8, color: '#aaaaee', fontSize: 14, fontWeight: 600, padding: '10px 20px', cursor: 'pointer' } as React.CSSProperties,
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onAuth }: { onAuth: (pw: string) => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    fetch('/api/shop/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) onAuth(password)
        else setError('Incorrect password.')
      })
  }

  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: 40, minWidth: 320 }}>
        <h1 style={{ color: '#F0ECE2', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Admin Panel</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 28 }}>New Orleans Record Press</p>
        <label style={S.label}>Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ ...S.input, marginBottom: 12, fontSize: 15 }}
          autoFocus
        />
        {error && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button type="submit" style={{ ...S.btnGreen, width: '100%', padding: 12, fontSize: 15 }}>
          Sign In
        </button>
      </form>
    </div>
  )
}

// ─── PVC Progress Bar ─────────────────────────────────────────────────────────

function ProgressBar({ value, max, color, striped }: { value: number; max: number; color: string; striped?: boolean }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 6, height: 12, overflow: 'hidden', flex: 1 }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: striped
            ? 'repeating-linear-gradient(45deg,#b0c4cc,#b0c4cc 4px,#d0e4ec 4px,#d0e4ec 8px)'
            : color,
          borderRadius: 6,
          transition: 'width 0.3s ease',
          minWidth: pct > 0 ? 4 : 0,
        }}
      />
    </div>
  )
}

// ─── PVC Color config ─────────────────────────────────────────────────────────

const PVC_COLORS: { key: keyof Inventory['pvc']['colors']; label: string; bar: string; striped?: boolean }[] = [
  { key: 'black',  label: 'Black',  bar: '#333' },
  { key: 'clear',  label: 'Clear',  bar: '#c8d8e0', striped: true },
  { key: 'yellow', label: 'Yellow', bar: '#FFD700' },
  { key: 'red',    label: 'Red',    bar: '#DC143C' },
]

const INNER_SLEEVES: { key: keyof Inventory['innerSleeves']; label: string }[] = [
  { key: 'whitePaper', label: 'White Paper' },
  { key: 'blackPaper', label: 'Black Paper' },
  { key: 'whitePoly',  label: 'White Poly' },
  { key: 'blackPoly',  label: 'Black Poly' },
  { key: 'ricePaper',  label: 'Rice Paper' },
]

const OUTER_SLEEVES: { key: keyof Inventory['outerSleeves']; label: string }[] = [
  { key: 'twoMil',          label: '2 mil' },
  { key: 'twoMilResealable', label: '2 mil Resealable' },
  { key: 'threeMil',        label: '3 mil' },
]

const BOXES: { key: keyof Inventory['boxes']; label: string }[] = [
  { key: 'innerBox',    label: 'Inner Box' },
  { key: 'outerBox',    label: 'Outer Box' },
  { key: 'shippingBox', label: 'Shipping Box' },
]

// ─── Inventory Tab ────────────────────────────────────────────────────────────

function InventoryTab({ password, inventory, setInventory }: {
  password: string
  inventory: Inventory | null
  setInventory: (inv: Inventory) => void
}) {
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [local, setLocal] = useState<Inventory | null>(null)

  useEffect(() => {
    if (inventory) setLocal(JSON.parse(JSON.stringify(inventory)))
  }, [inventory])

  async function save() {
    if (!local) return
    setSaving(true)
    setSaveMsg('')
    const res = await fetch('/api/admin/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory: local, password }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.ok) {
      setInventory(local)
      setSaveMsg('Saved!')
    } else {
      setSaveMsg('Error saving.')
    }
    setTimeout(() => setSaveMsg(''), 2500)
  }

  function setPVCLbs(color: keyof Inventory['pvc']['colors'], lbs: number) {
    if (!local) return
    setLocal({ ...local, pvc: { ...local.pvc, colors: { ...local.pvc.colors, [color]: { ...local.pvc.colors[color], lbs } } } })
  }

  function setPVCStatus(color: keyof Inventory['pvc']['colors'], status: string) {
    if (!local) return
    setLocal({ ...local, pvc: { ...local.pvc, colors: { ...local.pvc.colors, [color]: { ...local.pvc.colors[color], status } } } })
  }

  function setInner(key: keyof Inventory['innerSleeves'], val: number) {
    if (!local) return
    setLocal({ ...local, innerSleeves: { ...local.innerSleeves, [key]: val } })
  }

  function setOuter(key: keyof Inventory['outerSleeves'], val: number) {
    if (!local) return
    setLocal({ ...local, outerSleeves: { ...local.outerSleeves, [key]: val } })
  }

  function setBox(key: keyof Inventory['boxes'], val: number) {
    if (!local) return
    setLocal({ ...local, boxes: { ...local.boxes, [key]: val } })
  }

  if (!local) return <p style={{ color: '#555' }}>Loading inventory...</p>

  const totalLbs = Object.values(local.pvc.colors).reduce((sum, c) => sum + c.lbs, 0)
  const cap = local.pvc.capacity

  return (
    <div>
      {/* Save Bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        {saveMsg && <span style={{ color: saveMsg === 'Saved!' ? '#1A53FF' : '#ff6b6b', fontSize: 14 }}>{saveMsg}</span>}
        <button onClick={save} disabled={saving} style={{ ...S.btnGreen, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save Inventory'}
        </button>
      </div>

      {/* PVC Compound */}
      <div style={S.cardPad}>
        <h2 style={S.sectionTitle}>PVC Compound</h2>

        {/* Total bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#888', fontSize: 13 }}>Total on hand</span>
            <span style={{ color: '#F0ECE2', fontSize: 13, fontFamily: 'monospace' }}>
              {totalLbs.toLocaleString()} / {cap.toLocaleString()} lbs ({Math.round((totalLbs / cap) * 100)}%)
            </span>
          </div>
          <div style={{ background: '#1a1a1a', borderRadius: 8, height: 16, overflow: 'hidden', display: 'flex' }}>
            {PVC_COLORS.map(({ key, bar, striped }) => {
              const lbs = local.pvc.colors[key].lbs
              const pct = cap > 0 ? (lbs / cap) * 100 : 0
              return pct > 0 ? (
                <div key={key} style={{
                  height: '100%', width: `${pct}%`, transition: 'width 0.3s ease',
                  background: striped
                    ? 'repeating-linear-gradient(45deg,#b0c4cc,#b0c4cc 4px,#d0e4ec 4px,#d0e4ec 8px)'
                    : bar,
                }} />
              ) : null
            })}
          </div>
        </div>

        {/* Per-color rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {PVC_COLORS.map(({ key, label, bar, striped }) => {
            const color = local.pvc.colors[key]
            const onOrder = color.status === 'on order'
            const swatch = striped
              ? 'repeating-linear-gradient(45deg,#b0c4cc,#b0c4cc 3px,#d0e4ec 3px,#d0e4ec 6px)'
              : bar
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '110px 150px 1fr 180px', gap: 12, alignItems: 'center' }}>
                {/* Label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: swatch, border: '1px solid #444' }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                </div>
                {/* Input */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number"
                    value={color.lbs}
                    min={0} max={cap}
                    onChange={e => setPVCLbs(key, parseInt(e.target.value) || 0)}
                    style={{ ...S.numInput, width: 90 }}
                  />
                  <span style={{ color: '#888', fontSize: 12 }}>lbs</span>
                </div>
                {/* Bar */}
                <ProgressBar value={color.lbs} max={cap} color={bar} striped={striped} />
                {/* On order */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    id={`order-${key}`}
                    checked={onOrder}
                    onChange={e => setPVCStatus(key, e.target.checked ? 'on order' : '')}
                    style={{ accentColor: '#1A53FF', width: 14, height: 14 }}
                  />
                  <label htmlFor={`order-${key}`} style={{ color: onOrder ? '#F2A623' : '#555', fontSize: 12, cursor: 'pointer' }}>
                    {onOrder ? 'ON ORDER' : 'mark on order'}
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Inner Sleeves */}
      <div style={S.cardPad}>
        <h2 style={S.sectionTitle}>Inner Sleeves</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {INNER_SLEEVES.map(({ key, label }) => (
            <div key={key} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: 16 }}>
              <label style={S.label}>{label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  value={local.innerSleeves[key]}
                  min={0}
                  onChange={e => setInner(key, parseInt(e.target.value) || 0)}
                  style={{ ...S.numInput, flex: 1, width: '100%' }}
                />
                <span style={{ color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>units</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Outer Sleeves */}
      <div style={S.cardPad}>
        <h2 style={S.sectionTitle}>Outer Sleeves</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {OUTER_SLEEVES.map(({ key, label }) => (
            <div key={key} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: 16 }}>
              <label style={S.label}>{label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  value={local.outerSleeves[key]}
                  min={0}
                  onChange={e => setOuter(key, parseInt(e.target.value) || 0)}
                  style={{ ...S.numInput, flex: 1, width: '100%' }}
                />
                <span style={{ color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>units</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Boxes */}
      <div style={S.cardPad}>
        <h2 style={S.sectionTitle}>Boxes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {BOXES.map(({ key, label }) => (
            <div key={key} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: 16 }}>
              <label style={S.label}>{label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  value={local.boxes[key]}
                  min={0}
                  onChange={e => setBox(key, parseInt(e.target.value) || 0)}
                  style={{ ...S.numInput, flex: 1, width: '100%' }}
                />
                <span style={{ color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>units</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Shop Products Tab ────────────────────────────────────────────────────────

function ShopProductsTab({ password }: { password: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    category: 'lp', price: 0, stock: 0, image: '', name: '', artist: '', description: '',
  })

  const loadProducts = useCallback(() => {
    setLoading(true)
    fetch('/api/shop/products')
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false) })
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  function updateProduct(id: string, field: keyof Product, value: string | number) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
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

  if (loading) return <p style={{ color: '#555' }}>Loading products...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        {saveMsg && <span style={{ color: saveMsg === 'Saved!' ? '#1A53FF' : '#ff6b6b', fontSize: 14 }}>{saveMsg}</span>}
        <button onClick={saveAll} disabled={saving} style={{ ...S.btnGreen, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      <div style={S.card}>
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
                    style={{ ...S.numInput, width: 80 }}
                    step="0.01" min="0"
                  />
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <input
                    type="number"
                    value={p.stock}
                    onChange={e => updateProduct(p.id, 'stock', parseInt(e.target.value) || 0)}
                    style={{ ...S.numInput, width: 70, color: p.stock > 0 ? '#1A53FF' : '#888' }}
                    min="0"
                  />
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <button onClick={() => deleteProduct(p.id)} style={S.btnDanger}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={S.cardPad}>
        <h2 style={{ ...S.sectionTitle, marginBottom: 20 }}>Add New Product</h2>
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
              <label style={S.label}>{f.label}</label>
              <input
                type={f.type}
                value={f.type === 'number' ? (newProduct[f.key as keyof Product] as number ?? 0) : (newProduct[f.key as keyof Product] as string ?? '')}
                onChange={e => setNewProduct(prev => ({ ...prev, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                step={f.key === 'price' ? '0.01' : undefined}
                style={S.input}
              />
            </div>
          ))}
          <div>
            <label style={S.label}>Category</label>
            <select
              value={newProduct.category}
              onChange={e => setNewProduct(prev => ({ ...prev, category: e.target.value as Product['category'] }))}
              style={{ ...S.input, appearance: 'none' as const }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <button onClick={addProduct} style={{ ...S.btnBlue, marginTop: 16 }}>+ Add Product</button>
      </div>
    </div>
  )
}

// ─── Team Tab ────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  name: string
  title: string
  department: string
  image: string
}

async function compressImageForUpload(file: File): Promise<File> {
  if (file.type === 'image/gif') return file

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image file'))
    img.src = dataUrl
  })

  const maxSize = 1600
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.88)
  })
  if (!blob) return file

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}

function TeamTab({ password }: { password: string }) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [newMember, setNewMember] = useState<Partial<TeamMember>>({ name: '', title: '', department: '', image: '' })

  const loadMembers = useCallback(() => {
    setLoading(true)
    fetch('/api/team')
      .then(r => r.json())
      .then(data => { setMembers(data); setLoading(false) })
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  function updateMember(id: string, field: keyof TeamMember, value: string) {
    setMembers(prev => prev.map(member => (
      member.id === id ? { ...member, [field]: value } : member
    )))
  }

  async function saveAll(updated: TeamMember[] = members) {
    setSaving(true)
    setSaveMsg('')
    const res = await fetch('/api/team', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: updated, password }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.ok) {
      setMembers(updated)
      setSaveMsg('Saved!')
    } else {
      setSaveMsg(data.error || 'Error saving.')
    }
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function uploadPhoto(memberId: string, file: File) {
    setUploadingId(memberId)
    setSaveMsg('')
    try {
      let uploadFile = file
      try {
        uploadFile = await compressImageForUpload(file)
      } catch {
        uploadFile = file
      }

      const formData = new FormData()
      formData.append('password', password)
      formData.append('memberId', memberId)
      formData.append('file', uploadFile)

      const res = await fetch('/api/admin/team-upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setSaveMsg(data.error || 'Upload failed.')
        return
      }

      const updated = members.map(member => (
        member.id === memberId ? { ...member, image: data.url as string } : member
      ))
      setMembers(updated)
      await saveAll(updated)
      setSaveMsg('Photo uploaded and saved!')
    } catch (error) {
      setSaveMsg(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploadingId(null)
      setTimeout(() => setSaveMsg(''), 8000)
    }
  }

  function deleteMember(id: string) {
    if (!confirm('Remove this team member?')) return
    const updated = members.filter(m => m.id !== id)
    setMembers(updated)
    saveAll(updated)
  }

  function addMember() {
    if (!newMember.name) return
    const id = newMember.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const member: TeamMember = {
      id,
      name: newMember.name!,
      title: newMember.title || '',
      department: newMember.department || '',
      image: newMember.image || '',
    }
    const updated = [...members, member]
    setMembers(updated)
    saveAll(updated)
    setNewMember({ name: '', title: '', department: '', image: '' })
  }

  if (loading) return <p style={{ color: '#555' }}>Loading team...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        {saveMsg && (
          <span style={{ color: saveMsg.toLowerCase().includes('error') || saveMsg.toLowerCase().includes('failed') ? '#ff6b6b' : '#1A53FF', fontSize: 14 }}>
            {saveMsg}
          </span>
        )}
        <button onClick={() => saveAll()} disabled={saving} style={{ ...S.btnGreen, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save Team Changes'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {members.map(member => (
          <div key={member.id} style={{ ...S.cardPad, marginBottom: 0 }}>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '120px 1fr auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 96,
                  height: 96,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {member.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.image} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#555', fontSize: 24, fontWeight: 700 }}>
                      {member.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                    </span>
                  )}
                </div>
                <label style={{ ...S.btnBlue, padding: '6px 10px', fontSize: 12, cursor: uploadingId === member.id ? 'wait' : 'pointer' }}>
                  {uploadingId === member.id ? 'Uploading…' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    style={{ display: 'none' }}
                    disabled={uploadingId === member.id}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) uploadPhoto(member.id, file)
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div>
                  <label style={S.label}>Full Name</label>
                  <input
                    type="text"
                    value={member.name}
                    onChange={event => updateMember(member.id, 'name', event.target.value)}
                    style={S.input}
                  />
                </div>
                <div>
                  <label style={S.label}>Title / Role</label>
                  <input
                    type="text"
                    value={member.title}
                    onChange={event => updateMember(member.id, 'title', event.target.value)}
                    style={S.input}
                  />
                </div>
                <div>
                  <label style={S.label}>Department</label>
                  <input
                    type="text"
                    value={member.department}
                    onChange={event => updateMember(member.id, 'department', event.target.value)}
                    style={S.input}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>Image URL</label>
                  <input
                    type="text"
                    value={member.image}
                    onChange={event => updateMember(member.id, 'image', event.target.value)}
                    style={S.input}
                    placeholder="/images/team/name.jpg or uploaded blob URL"
                  />
                </div>
              </div>

              <div>
                <button onClick={() => deleteMember(member.id)} style={S.btnDanger}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={S.cardPad}>
        <h2 style={{ ...S.sectionTitle, marginBottom: 20 }}>Add Team Member</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { key: 'name', label: 'Full Name' },
            { key: 'title', label: 'Title / Role' },
            { key: 'department', label: 'Department' },
            { key: 'image', label: 'Image URL (optional)' },
          ].map(f => (
            <div key={f.key}>
              <label style={S.label}>{f.label}</label>
              <input
                type="text"
                value={newMember[f.key as keyof TeamMember] ?? ''}
                onChange={e => setNewMember(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={S.input}
                placeholder={f.key === 'name' ? 'Required' : ''}
              />
            </div>
          ))}
        </div>
        <button onClick={addMember} style={{ ...S.btnBlue, marginTop: 16 }}>+ Add Member</button>
      </div>
    </div>
  )
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

type Tab = 'inventory' | 'shop' | 'team'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('inventory')
  // team tab loaded on demand
  const [inventory, setInventory] = useState<Inventory | null>(null)

  function handleAuth(pw: string) {
    setPassword(pw)
    setAuthed(true)
    fetch('/api/admin/inventory')
      .then(r => r.json())
      .then(data => setInventory(data))
  }

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: '16px 20px',
    fontSize: 14,
    fontWeight: 600,
    color: activeTab === tab ? '#F0ECE2' : '#666',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid #1A53FF' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  if (!authed) return <LoginScreen onAuth={handleAuth} />

  return (
    <div style={S.page}>
      {/* Nav */}
      <div style={S.nav}>
        <div style={S.navLeft}>
          <span style={S.navBrand}>NORP Admin</span>
          <button onClick={() => setActiveTab('inventory')} style={tabStyle('inventory')}>Inventory</button>
          <button onClick={() => setActiveTab('shop')} style={tabStyle('shop')}>Shop Products</button>
          <button onClick={() => setActiveTab('team')} style={tabStyle('team')}>Team</button>
        </div>
        <div style={S.navRight}>
          <a href="/dashboard" style={{ ...S.btnGreen, textDecoration: 'none', display: 'inline-block' }}>Operations Dashboard</a>
          <a href="/shop" style={S.btnGhost}>View Shop</a>
          <a href="/staff/inventory" style={S.btnGhost}>Staff View</a>
        </div>
      </div>

      {/* Content */}
      <div style={S.content}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
            {activeTab === 'inventory' ? 'Inventory' : activeTab === 'shop' ? 'Shop Products' : 'Team'}
          </h1>
          <p style={{ color: '#888', fontSize: 14 }}>
            {activeTab === 'inventory'
              ? 'Track PVC compound, inner sleeves, and outer sleeves'
              : activeTab === 'shop'
              ? 'Manage products, stock, and pricing'
              : 'Edit team members and upload profile photos for the public /team page'}
          </p>
        </div>

        {activeTab === 'inventory' && (
          <InventoryTab password={password} inventory={inventory} setInventory={setInventory} />
        )}
        {activeTab === 'shop' && (
          <ShopProductsTab password={password} />
        )}
        {activeTab === 'team' && (
          <TeamTab password={password} />
        )}
      </div>
    </div>
  )
}
