import { useEffect, useMemo, useState } from 'react'
import { api, setAuthToken } from './lib/api'
import { Card, Button, Input } from './components/Kit'
import ProductForm from './components/ProductForm'
import ProductTable from './components/ProductTable'
import Modal from './components/Modal'
import Toast from './components/Toast'
import Pagination from './components/Pagination'
import { makeT } from './i18n'
import SparkleCursor from './components/SparkleCursor'

export default function App() {
  // theme & lang
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'vi')
  const t = makeT(lang)
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])
  useEffect(() => { localStorage.setItem('lang', lang) }, [lang])

  // data
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState({ open: false, msg: '', type: 'success' })
  const [openCreate, setOpenCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  // navigation
  const [view, setView] = useState('home') // 'home' | 'product' | 'cart' | 'checkout' | 'orders'
  const [selectedProduct, setSelectedProduct] = useState(null)

  // auth
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem('auth')
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return parsed && parsed.token ? parsed : null
    } catch {
      return null
    }
  })
  const isLoggedIn = !!auth?.token

  // auth modal
  const [authMode, setAuthMode] = useState('login') // 'login' | 'register'
  const [openAuth, setOpenAuth] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // filters
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('default')

  // paging
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)

  // cart
  const [cart, setCart] = useState(null)
  const [cartLoading, setCartLoading] = useState(false)

  // orders
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)

  // init auth token
  useEffect(() => {
    if (auth?.token) {
      setAuthToken(auth.token)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const data = await api.listProducts()
      setItems(data)
    } catch {
      setToast({ open: true, msg: 'Lỗi tải dữ liệu', type: 'error' })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function loadCart() {
    if (!isLoggedIn) {
      setCart(null)
      return
    }
    try {
      setCartLoading(true)
      const data = await api.getCart()
      setCart(data)
    } catch {
      setToast({ open: true, msg: lang === 'vi' ? 'Lỗi tải giỏ hàng' : 'Failed to load cart', type: 'error' })
    } finally {
      setCartLoading(false)
    }
  }

  async function loadOrders() {
    if (!isLoggedIn) {
      setOrders([])
      setSelectedOrder(null)
      return
    }
    try {
      setOrdersLoading(true)
      const data = await api.listOrders()
      setOrders(data)
    } catch {
      setToast({ open: true, msg: lang === 'vi' ? 'Lỗi tải đơn hàng' : 'Failed to load orders', type: 'error' })
    } finally {
      setOrdersLoading(false)
    }
  }

  function handleLogout() {
    setAuth(null)
    setAuthToken(null)
    localStorage.removeItem('auth')
    setToast({ open: true, msg: lang === 'vi' ? 'Đã đăng xuất' : 'Logged out', type: 'success' })
  }

  async function handleAuthSubmit(e) {
    e.preventDefault()
    setAuthLoading(true)
    try {
      const payload = { email: authEmail.trim(), password: authPassword.trim() }
      const res = authMode === 'login'
        ? await api.login(payload)
        : await api.register(payload)

      const next = { userId: res.userId, email: res.email, token: res.token }
      setAuth(next)
      setAuthToken(next.token)
      localStorage.setItem('auth', JSON.stringify(next))
      setOpenAuth(false)
      setAuthPassword('')
      setToast({ open: true, msg: lang === 'vi' ? 'Thành công' : 'Success', type: 'success' })
    } catch (err) {
      setToast({ open: true, msg: err.message || (lang === 'vi' ? 'Lỗi xác thực' : 'Auth error'), type: 'error' })
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleAddToCart(productId) {
    if (!isLoggedIn) {
      setToast({ open: true, msg: lang === 'vi' ? 'Vui lòng đăng nhập để mua hàng' : 'Please login to add to cart', type: 'error' })
      setAuthMode('login')
      setOpenAuth(true)
      return
    }
    try {
      const data = await api.addToCart({ productId, quantity: 1 })
      setCart(data)
      setToast({ open: true, msg: lang === 'vi' ? 'Đã thêm vào giỏ' : 'Added to cart', type: 'success' })
    } catch (err) {
      setToast({ open: true, msg: err.message || (lang === 'vi' ? 'Lỗi giỏ hàng' : 'Cart error'), type: 'error' })
    }
  }

  async function handleCartQuantityChange(itemId, quantity) {
    if (!isLoggedIn) return
    try {
      const q = Number(quantity)
      const data = await api.updateCartItem(itemId, { quantity: isNaN(q) ? 0 : q })
      setCart(data)
    } catch (err) {
      setToast({ open: true, msg: err.message || (lang === 'vi' ? 'Lỗi giỏ hàng' : 'Cart error'), type: 'error' })
    }
  }

  async function handleCartRemoveItem(itemId) {
    if (!isLoggedIn) return
    try {
      const data = await api.removeCartItem(itemId)
      setCart(data)
    } catch (err) {
      setToast({ open: true, msg: err.message || (lang === 'vi' ? 'Lỗi giỏ hàng' : 'Cart error'), type: 'error' })
    }
  }

  async function handlePlaceOrder() {
    if (!isLoggedIn) return
    try {
      const detail = await api.placeOrder()
      setCart({ items: [], totalAmount: 0 })
      setSelectedOrder(detail)
      await loadOrders()
      setView('orders')
      setToast({ open: true, msg: lang === 'vi' ? 'Đã tạo đơn hàng' : 'Order created', type: 'success' })
    } catch (err) {
      setToast({ open: true, msg: err.message || (lang === 'vi' ? 'Lỗi đặt hàng' : 'Order error'), type: 'error' })
    }
  }

  async function handlePayOrder(orderId) {
    if (!isLoggedIn) return
    try {
      await api.payOrder(orderId)
      const updated = await api.getOrder(orderId)
      setSelectedOrder(updated)
      await loadOrders()
      setToast({ open: true, msg: lang === 'vi' ? 'Thanh toán thành công' : 'Payment successful', type: 'success' })
    } catch (err) {
      setToast({ open: true, msg: err.message || (lang === 'vi' ? 'Lỗi thanh toán' : 'Payment error'), type: 'error' })
    }
  }

  // auto-load when navigating to cart / checkout / orders
  useEffect(() => {
    if (!isLoggedIn) return
    if (view === 'cart' || view === 'checkout') {
      loadCart()
    }
    if (view === 'orders') {
      loadOrders()
    }
  }, [view, isLoggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = items
    const q = query.trim().toLowerCase()
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    const min = parseFloat(minPrice); const max = parseFloat(maxPrice)
    if (!isNaN(min)) list = list.filter(p => p.price >= min)
    if (!isNaN(max)) list = list.filter(p => p.price <= max)
    if (sort === 'price-asc') list = [...list].sort((a,b)=>a.price-b.price)
    if (sort === 'price-desc') list = [...list].sort((a,b)=>b.price-a.price)
    return list
  }, [items, query, minPrice, maxPrice, sort])

  // reset page khi điều kiện lọc đổi
  useEffect(() => { setPage(1) }, [query, minPrice, maxPrice, sort, items])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  async function createProduct(payload) {
    try {
      await api.createProduct(payload)
      setOpenCreate(false)
      setToast({ open: true, msg: t('createdOk'), type: 'success' })
      load()
    } catch {
      setToast({ open: true, msg: t('createdErr'), type: 'error' })
    }
  }

  async function updateProduct(payload) {
    try {
      await api.updateProduct(editing.id, payload)
      setEditing(null)
      setToast({ open: true, msg: t('updatedOk'), type: 'success' })
      load()
    } catch {
      setToast({ open: true, msg: t('updatedErr'), type: 'error' })
    }
  }

  async function deleteProductConfirm() {
    try {
      await api.deleteProduct(confirm.id)
      setConfirm(null)
      setToast({ open: true, msg: t('deletedOk'), type: 'success' })
      load()
    } catch {
      setToast({ open: true, msg: t('deletedErr'), type: 'error' })
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 backdrop-blur bg-base-bg/70 border-b border-base-line">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="text-lg font-semibold tracking-tight">{t('title')}</div>
            {/* Simple nav placeholder for future pages */}
            <nav className="hidden md:flex items-center gap-3 text-sm text-base-mute">
                  <button
                    type="button"
                    className={`hover:text-base-text ${view === 'home' ? 'text-base-text' : 'opacity-70'}`}
                    onClick={() => { setView('home'); setSelectedProduct(null) }}
                  >
                {lang === 'vi' ? 'Trang chủ' : 'Home'}
              </button>
                  <button
                    type="button"
                    className={`hover:text-base-text ${view === 'cart' ? 'text-base-text' : 'opacity-70'}`}
                    onClick={() => setView('cart')}
                  >
                {lang === 'vi' ? 'Giỏ hàng' : 'Cart'}
              </button>
                  <button
                    type="button"
                    className={`hover:text-base-text ${view === 'orders' ? 'text-base-text' : 'opacity-70'}`}
                    onClick={() => setView('orders')}
                  >
                {lang === 'vi' ? 'Đơn hàng' : 'Orders'}
              </button>
            </nav>
          </div>

          {/* Controls: theme + language + auth */}
          <div className="flex items-center gap-2">
            <select
              className="bg-base-soft border border-base-line rounded-xl px-2 py-1"
              value={lang}
              onChange={e=>setLang(e.target.value)}
              aria-label={t('language')}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
            <Button variant="ghost" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>
              {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </Button>
            {isLoggedIn ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-xs text-base-mute max-w-[160px] truncate">
                  {auth.email}
                </span>
                <Button variant="ghost" onClick={handleLogout}>
                  {lang === 'vi' ? 'Đăng xuất' : 'Logout'}
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => { setAuthMode('login'); setOpenAuth(true) }}
                >
                  {lang === 'vi' ? 'Đăng nhập' : 'Login'}
                </Button>
                <Button
                  onClick={() => { setAuthMode('register'); setOpenAuth(true) }}
                >
                  {lang === 'vi' ? 'Đăng ký' : 'Register'}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {view === 'home' && (
          <>
            {/* Search + quick actions */}
            <Card>
              <div className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <input
                    className="flex-1 md:w-[360px] bg-base-soft border border-base-line rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder={t('search')}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {isLoggedIn && (
                    <Button onClick={() => setOpenCreate(true)}>{t('add')}</Button>
                  )}
                  <Button variant="ghost" onClick={load}>{t('refresh')}</Button>
                </div>
              </div>
            </Card>

            {/* Filters */}
            <Card><div className="p-4 card-hover">
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-sm text-base-mute">{t('filters')}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-base-mute mb-1">{t('minPrice')}</label>
                    <input
                      className="w-full bg-base-soft border border-base-line rounded-xl px-3 py-2"
                      type="number" min="0" value={minPrice}
                      onChange={e=>setMinPrice(e.target.value)}
                    />
                  </div>

                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-base-mute mb-1">{t('maxPrice')}</label>
                    <input
                      className="w-full bg-base-soft border border-base-line rounded-xl px-3 py-2"
                      type="number" min="0" value={maxPrice}
                      onChange={e=>setMaxPrice(e.target.value)}
                    />
                  </div>

                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs text-base-mute mb-1">{t('sort')}</label>
                    <select
                      className="w-full bg-base-soft border border-base-line rounded-xl px-3 py-2"
                      value={sort} onChange={e=>setSort(e.target.value)}
                    >
                      <option value="default">{t('sortDefault')}</option>
                      <option value="price-asc">{t('sortPriceAsc')}</option>
                      <option value="price-desc">{t('sortPriceDesc')}</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => { setMinPrice(''); setMaxPrice(''); setSort('default') }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
              </div>
            </Card>

            {/* Table */}
            {loading ? (
              <Card>
                <div className="p-6 animate-pulse space-y-4">
                  <div className="h-6 bg-base-soft rounded-xl" />
                  <div className="h-6 bg-base-soft rounded-xl" />
                  <div className="h-6 bg-base-soft rounded-xl" />
                </div>
              </Card>
            ) : (
              <>
                <ProductTable
                  t={t}
                  items={pageItems}
                  onEdit={setEditing}
                  onDelete={setConfirm}
                  onView={(p) => { setSelectedProduct(p); setView('product') }}
                  canManage={isLoggedIn}
                />
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPage={(p)=>setPage(Math.max(1, Math.min(totalPages, p)))}
                  pageSize={pageSize}
                  onPageSize={(n)=>{ setPageSize(n); setPage(1) }}
                />
              </>
            )}
          </>
        )}

        {view === 'product' && selectedProduct && (
          <Card>
            <div className="p-4 flex flex-col gap-4 md:flex-row">
              <div className="md:w-1/3 flex flex-col items-center gap-3">
                {selectedProduct.image ? (
                  <img
                    src={selectedProduct.image}
                    alt={selectedProduct.name}
                    className="w-full max-w-xs rounded-2xl object-cover border border-base-line"
                  />
                ) : (
                  <div className="w-full max-w-xs aspect-square rounded-2xl bg-base-soft grid place-items-center border border-base-line text-4xl">
                    🛍️
                  </div>
                )}
              </div>
              <div className="md:flex-1 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-xl font-semibold">{selectedProduct.name}</h1>
                  <div className="text-lg font-semibold text-brand-400">
                    {Intl.NumberFormat('vi-VN').format(selectedProduct.price)} ₫
                  </div>
                </div>
                <p className="text-sm text-base-mute whitespace-pre-line">
                  {selectedProduct.description}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button variant="ghost" onClick={() => { setSelectedProduct(null); setView('home') }}>
                    {lang === 'vi' ? '← Quay lại' : '← Back to list'}
                  </Button>
                  <Button onClick={() => handleAddToCart(selectedProduct.id)}>
                    {lang === 'vi' ? 'Thêm vào giỏ' : 'Add to cart'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {view === 'cart' && (
          <Card>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {lang === 'vi' ? 'Giỏ hàng' : 'Shopping cart'}
                </h2>
                <Button variant="ghost" onClick={() => setView('home')}>
                  {lang === 'vi' ? '← Tiếp tục mua sắm' : '← Continue shopping'}
                </Button>
              </div>
              {!isLoggedIn ? (
                <div className="text-sm text-base-mute">
                  {lang === 'vi'
                    ? 'Vui lòng đăng nhập để xem giỏ hàng.'
                    : 'Please login to view your cart.'}
                </div>
              ) : cartLoading ? (
                <div className="text-sm text-base-mute">
                  {lang === 'vi' ? 'Đang tải giỏ hàng...' : 'Loading cart...'}
                </div>
              ) : !cart || cart.items.length === 0 ? (
                <div className="text-sm text-base-mute">
                  {lang === 'vi' ? 'Giỏ hàng đang trống.' : 'Your cart is empty.'}
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cart.items.map(item => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 border border-base-line rounded-xl px-3 py-2"
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-12 w-12 rounded-xl object-cover border border-base-line"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-base-soft grid place-items-center border border-base-line">
                            🛍️
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-base-mute">
                            {Intl.NumberFormat('vi-VN').format(item.price)} ₫
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={e => handleCartQuantityChange(item.id, e.target.value)}
                            className="w-20"
                          />
                          <div className="w-24 text-right text-sm">
                            {Intl.NumberFormat('vi-VN').format(item.lineTotal)} ₫
                          </div>
                          <Button
                            variant="ghost"
                            onClick={() => handleCartRemoveItem(item.id)}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-base-line pt-3 mt-2">
                    <div className="text-sm text-base-mute">
                      {lang === 'vi' ? 'Tổng thanh toán' : 'Total'}
                    </div>
                    <div className="text-lg font-semibold text-brand-400">
                      {Intl.NumberFormat('vi-VN').format(cart.totalAmount)} ₫
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      disabled={!cart.items.length}
                      onClick={() => setView('checkout')}
                    >
                      {lang === 'vi' ? 'Tiến hành đặt hàng' : 'Proceed to checkout'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {view === 'checkout' && (
          <Card>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {lang === 'vi' ? 'Xác nhận đơn hàng' : 'Checkout'}
                </h2>
                <Button variant="ghost" onClick={() => setView('cart')}>
                  {lang === 'vi' ? '← Quay lại giỏ hàng' : '← Back to cart'}
                </Button>
              </div>
              {!isLoggedIn ? (
                <div className="text-sm text-base-mute">
                  {lang === 'vi'
                    ? 'Vui lòng đăng nhập để đặt hàng.'
                    : 'Please login to place an order.'}
                </div>
              ) : !cart || cart.items.length === 0 ? (
                <div className="text-sm text-base-mute">
                  {lang === 'vi'
                    ? 'Giỏ hàng đang trống, không thể đặt hàng.'
                    : 'Cart is empty, nothing to checkout.'}
                </div>
              ) : (
                <>
                  <div className="space-y-2 text-sm">
                    {cart.items.map(item => (
                      <div key={item.id} className="flex justify-between">
                        <span>{item.name} × {item.quantity}</span>
                        <span>
                          {Intl.NumberFormat('vi-VN').format(item.lineTotal)} ₫
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-base-line pt-3 mt-2">
                    <div className="text-sm text-base-mute">
                      {lang === 'vi' ? 'Tổng thanh toán' : 'Total'}
                    </div>
                    <div className="text-lg font-semibold text-brand-400">
                      {Intl.NumberFormat('vi-VN').format(cart.totalAmount)} ₫
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handlePlaceOrder}>
                      {lang === 'vi' ? 'Đặt hàng' : 'Place order'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {view === 'orders' && (
          <div className="grid gap-4 md:grid-cols-[2fr,minmax(0,1.4fr)]">
            <Card>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {lang === 'vi' ? 'Lịch sử đơn hàng' : 'Order history'}
                  </h2>
                  <Button variant="ghost" onClick={loadOrders}>
                    {lang === 'vi' ? 'Làm mới' : 'Refresh'}
                  </Button>
                </div>
                {!isLoggedIn ? (
                  <div className="text-sm text-base-mute">
                    {lang === 'vi'
                      ? 'Vui lòng đăng nhập để xem đơn hàng.'
                      : 'Please login to view your orders.'}
                  </div>
                ) : ordersLoading ? (
                  <div className="text-sm text-base-mute">
                    {lang === 'vi' ? 'Đang tải đơn hàng...' : 'Loading orders...'}
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-sm text-base-mute">
                    {lang === 'vi'
                      ? 'Chưa có đơn hàng nào.'
                      : 'You have no orders yet.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orders.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={async () => {
                          try {
                            const detail = await api.getOrder(o.id)
                            setSelectedOrder(detail)
                          } catch (err) {
                            setToast({ open: true, msg: err.message || 'Error', type: 'error' })
                          }
                        }}
                        className={`w-full text-left border rounded-xl px-3 py-2 text-sm ${
                          selectedOrder?.id === o.id
                            ? 'border-brand-500 bg-brand-500/5'
                            : 'border-base-line hover:bg-base-soft'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            #{o.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className="text-xs text-base-mute">
                            {new Date(o.createdAt).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs uppercase tracking-wide">
                            {lang === 'vi'
                              ? (o.status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán')
                              : (o.status === 'paid' ? 'Paid' : 'Pending')}
                          </span>
                          <span className="font-semibold text-sm text-brand-400">
                            {Intl.NumberFormat('vi-VN').format(o.totalAmount)} ₫
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <div className="p-4 space-y-3">
                <h2 className="text-lg font-semibold">
                  {lang === 'vi' ? 'Chi tiết đơn hàng' : 'Order detail'}
                </h2>
                {!selectedOrder ? (
                  <div className="text-sm text-base-mute">
                    {lang === 'vi'
                      ? 'Chọn một đơn hàng bên trái để xem chi tiết.'
                      : 'Select an order on the left to see details.'}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono">
                        #{selectedOrder.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-xs text-base-mute">
                        {new Date(selectedOrder.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <div className="text-xs uppercase tracking-wide">
                      {lang === 'vi'
                        ? (selectedOrder.status === 'paid' ? 'ĐÃ THANH TOÁN' : 'CHỜ THANH TOÁN')
                        : (selectedOrder.status === 'paid' ? 'PAID' : 'PENDING')}
                    </div>
                    <div className="space-y-2 text-sm mt-2">
                      {selectedOrder.items.map(item => (
                        <div key={item.productId} className="flex justify-between">
                          <span>{item.productName} × {item.quantity}</span>
                          <span>
                            {Intl.NumberFormat('vi-VN').format(item.lineTotal)} ₫
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-base-line pt-3 mt-2">
                      <div className="text-sm text-base-mute">
                        {lang === 'vi' ? 'Tổng thanh toán' : 'Total'}
                      </div>
                      <div className="text-lg font-semibold text-brand-400">
                        {Intl.NumberFormat('vi-VN').format(selectedOrder.totalAmount)} ₫
                      </div>
                    </div>
                    {selectedOrder.status !== 'paid' && (
                      <div className="flex justify-end">
                        <Button onClick={() => handlePayOrder(selectedOrder.id)}>
                          {lang === 'vi' ? 'Thanh toán' : 'Simulate payment'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Create */}
      <Modal open={openCreate} onClose={() => setOpenCreate(false)} title={t('createTitle')}>
        <ProductForm t={t} onSubmit={createProduct} />
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('editTitle')}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>{t('cancel')}</Button>
          </div>
        )}
      >
        {editing && <ProductForm t={t} initial={editing} onSubmit={updateProduct} />}
      </Modal>

      {/* Confirm delete */}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('confirmDelete')}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t('later')}</Button>
            <Button variant="danger" onClick={deleteProductConfirm}>{t('delete')}</Button>
          </div>
        )}
      >
        {confirm && (
          <div className="text-base-mute">
            {lang === 'vi'
              ? <>Bạn chắc chắn muốn xoá <span className="text-base-text">{confirm.name}</span>?</>
              : <>Are you sure to delete <span className="text-base-text">{confirm.name}</span>?</>}
          </div>
        )}
      </Modal>

      {/* Auth modal */}
      <Modal
        open={openAuth}
        onClose={() => setOpenAuth(false)}
        title={authMode === 'login'
          ? (lang === 'vi' ? 'Đăng nhập' : 'Login')
          : (lang === 'vi' ? 'Đăng ký' : 'Register')}
        footer={(
          <div className="flex justify-between items-center gap-3">
            <button
              type="button"
              className="text-xs text-base-mute underline"
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            >
              {authMode === 'login'
                ? (lang === 'vi' ? 'Chưa có tài khoản? Đăng ký' : "Don't have an account? Register")
                : (lang === 'vi' ? 'Đã có tài khoản? Đăng nhập' : 'Already have an account? Login')}
            </button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpenAuth(false)}>
                {lang === 'vi' ? 'Huỷ' : 'Cancel'}
              </Button>
              <Button type="submit" form="auth-form" disabled={authLoading}>
                {authLoading
                  ? (lang === 'vi' ? 'Đang xử lý...' : 'Working...')
                  : (authMode === 'login'
                      ? (lang === 'vi' ? 'Đăng nhập' : 'Login')
                      : (lang === 'vi' ? 'Đăng ký' : 'Register'))}
              </Button>
            </div>
          </div>
        )}
      >
        <form id="auth-form" className="space-y-3" onSubmit={handleAuthSubmit}>
          <div>
            <label className="block text-sm text-base-mute mb-1">
              Email
            </label>
            <Input
              type="email"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-base-mute mb-1">
              {lang === 'vi' ? 'Mật khẩu' : 'Password'}
            </label>
            <Input
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
        </form>
      </Modal>

      <Toast
        open={toast.open}
        message={toast.msg}
        type={toast.type}
        onClose={() => setToast(t => ({ ...t, open: false }))}
      />

      {/* Hiệu ứng lấp lánh theo chuột */}
      <SparkleCursor />
    </div>
  )
}
