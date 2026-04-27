import { getCurrentUser } from '../../utils/auth'

interface PurchasedDoc {
  _id: string
  title?: string
  type?: string
  amount?: number
  createdAt?: number
  reportId?: string
  openid?: string
}

function formatDate(timestamp = 0) {
  if (!timestamp) return '时间待补充'
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

Page({
  data: {
    loading: true,
    items: [] as Array<{
      id: string
      reportId?: string
      title: string
      typeLabel: string
      createdText: string
      amountText: string
      iconLabel: string
    }>,
    stats: {
      count: 0,
      amount: '0',
      types: 0,
    },
  },

  onShow() {
    this._loadItems()
  },

  async _loadItems() {
    const openid = getCurrentUser().openid
    if (!openid) {
      this.setData({ loading: false, items: [] })
      return
    }

    try {
      const db = wx.cloud.database()
      const res = await db.collection('orders').where({ openid, status: 'paid' }).orderBy('createdAt', 'desc').limit(50).get()
      const docs = res.data as PurchasedDoc[]
      const items = docs.map((item) => ({
        id: item._id,
        reportId: item.reportId,
        title: item.title || '已购财税服务',
        typeLabel: item.type || '财税分析服务',
        createdText: formatDate(item.createdAt),
        amountText: String(item.amount == null ? 0 : item.amount),
        iconLabel: '报',
      }))
      const totalAmount = docs.reduce((sum, item) => sum + (item.amount || 0), 0)
      const typeCount = new Set(docs.map((item) => item.type || '财税分析服务')).size
      this.setData({
        loading: false,
        items,
        stats: {
          count: items.length,
          amount: String(totalAmount),
          types: typeCount,
        },
      })
    } catch (_error) {
      this.setData({
        loading: false,
        items: [],
        stats: { count: 0, amount: '0', types: 0 },
      })
    }
  },

  onItemTap(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id: string }).id
    if (!id) {
      wx.showToast({ title: '暂无报告内容', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/report-detail/report-detail?id=${id}` })
  },

  onDownload(e: WechatMiniprogram.TouchEvent) {
    const reportId = (e.currentTarget.dataset as { reportId: string }).reportId
    if (!reportId) {
      wx.showToast({ title: '暂无可下载文件', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/download-pdf/download-pdf?reportId=${reportId}` })
  },
})
