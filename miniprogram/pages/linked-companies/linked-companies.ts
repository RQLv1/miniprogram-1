import { ensureCurrentOpenid } from '../../utils/auth'
import { deleteLinkedCompany, getLinkedCompanies, type LinkedCompanyDoc } from '../../utils/cloudDB'
import { createShareMessage, enableShareMenu } from '../../utils/share'

interface LinkedCompanyView extends LinkedCompanyDoc {
  id: string
  createdText: string
}

function formatDate(timestamp = 0) {
  if (!timestamp) return '时间待补充'
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

Page({
  data: {
    loading: true,
    companies: [] as LinkedCompanyView[],
    deletingId: '',
  },

  onLoad() {
    enableShareMenu()
  },

  onShow() {
    this._loadCompanies()
  },

  async _loadCompanies() {
    this.setData({ loading: true })
    try {
      const openid = await ensureCurrentOpenid()
      const companies = await getLinkedCompanies(openid)
      this.setData({
        loading: false,
        companies: companies.map((item) => ({
          ...item,
          id: item._id || item.companyKeyword,
          createdText: formatDate(item.createdAt),
        })),
      })
    } catch (_error) {
      this.setData({ loading: false, companies: [] })
    }
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/linked-companies/add-linked-company' })
  },

  onDeleteCompanyTap(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { id?: string; name?: string }
    const id = dataset.id || ''
    const name = dataset.name || '该企业档案'
    if (!id || this.data.deletingId) return

    wx.showModal({
      title: '删除企业档案',
      content: `确认删除“${name}”？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#d92d20',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ deletingId: id })
        try {
          const openid = await ensureCurrentOpenid()
          await deleteLinkedCompany(openid, id)
          wx.showToast({ title: '已删除', icon: 'success' })
          await this._loadCompanies()
        } catch (error) {
          console.error('[linkedCompanies] delete failed:', error)
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' })
        } finally {
          this.setData({ deletingId: '' })
        }
      },
    })
  },

  onShareAppMessage() {
    return createShareMessage()
  },
})
