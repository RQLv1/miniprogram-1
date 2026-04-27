import { getCurrentUser } from '../../utils/auth'

interface OrderDoc {
  _id: string
  title?: string
  type?: string
  amount?: number
  status?: string
  createdAt?: number
  reportId?: string
  openid?: string
}

interface OrderView {
  id: string
  orderNo: string
  title: string
  typeLabel: string
  createdText: string
  amountText: string
  statusKey: 'all' | 'pending' | 'progress' | 'done'
  statusText: string
  statusClass: string
  iconLabel: string
  reportId?: string
  primaryAction: string
  primaryVariant: 'primary' | 'gold'
  secondaryAction?: string
}

function formatDate(timestamp = 0) {
  if (!timestamp) return '时间待补充'
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeStatus(status = ''): Pick<OrderView, 'statusKey' | 'statusText' | 'statusClass' | 'primaryAction' | 'primaryVariant' | 'secondaryAction'> {
  const normalized = status.toLowerCase()
  if (['pending', 'unpaid', 'created'].includes(normalized)) {
    return {
      statusKey: 'pending',
      statusText: '待支付',
      statusClass: 'status--pending',
      primaryAction: '去支付',
      primaryVariant: 'gold',
      secondaryAction: '查看详情',
    }
  }
  if (['processing', 'progress', 'running'].includes(normalized)) {
    return {
      statusKey: 'progress',
      statusText: '进行中',
      statusClass: 'status--progress',
      primaryAction: '查看进度',
      primaryVariant: 'primary',
      secondaryAction: '联系顾问',
    }
  }
  return {
    statusKey: 'done',
    statusText: '已完成',
    statusClass: 'status--done',
    primaryAction: '查看报告',
    primaryVariant: 'primary',
  }
}

Page({
  data: {
    loading: true,
    activeFilter: 'all',
    filters: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待支付' },
      { key: 'progress', label: '进行中' },
      { key: 'done', label: '已完成' },
    ],
    orders: [] as OrderView[],
    filteredOrders: [] as OrderView[],
  },

  onShow() {
    this._loadOrders()
  },

  async _loadOrders() {
    const openid = getCurrentUser().openid
    if (!openid) {
      this.setData({ loading: false, orders: [], filteredOrders: [] })
      return
    }

    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('orders').where({ openid }).orderBy('createdAt', 'desc').limit(50).get()
      const orders = (res.data as OrderDoc[]).map((item, index) => {
        const statusView = normalizeStatus(item.status)
        return {
          id: item._id,
          orderNo: `订单号 ${item._id.slice(-10).toUpperCase() || String(index + 1).padStart(4, '0')}`,
          title: item.title || '财税服务订单',
          typeLabel: item.type || '财税分析服务',
          createdText: formatDate(item.createdAt),
          amountText: String(item.amount == null ? 0 : item.amount),
          iconLabel: '单',
          reportId: item.reportId,
          ...statusView,
        }
      })
      this.setData({ orders, loading: false })
      this._applyFilter(this.data.activeFilter as 'all' | 'pending' | 'progress' | 'done')
    } catch (_error) {
      this.setData({ loading: false, orders: [], filteredOrders: [] })
    }
  },

  onFilterTap(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset as { key: 'all' | 'pending' | 'progress' | 'done' }).key
    this._applyFilter(key)
  },

  _applyFilter(key: 'all' | 'pending' | 'progress' | 'done') {
    const filteredOrders = key === 'all'
      ? this.data.orders
      : this.data.orders.filter((item) => item.statusKey === key)
    this.setData({ activeFilter: key, filteredOrders })
  },

  onOrderTap(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id: string }).id
    if (!id) return
    wx.navigateTo({ url: `/pages/report-detail/report-detail?id=${id}` })
  },

  onOrderAction(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id: string }).id
    if (!id) {
      wx.showToast({ title: '暂无可查看内容', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/report-detail/report-detail?id=${id}` })
  },

  noop() {},
})
