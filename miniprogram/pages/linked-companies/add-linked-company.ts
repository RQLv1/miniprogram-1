import { ensureCurrentOpenid } from '../../utils/auth'
import { addLinkedCompany } from '../../utils/cloudDB'

const IDENTITY_OPTIONS = [
  { value: 'finance', label: '财务人员' },
  { value: 'owner', label: '企业老板' },
  { value: 'agency', label: '财税服务机构' },
]

Page({
  data: {
    contactName: '',
    companyKeyword: '',
    queriedCompanyName: '',
    hasQueriedCompany: false,
    identity: 'finance',
    identityLabel: '财务人员',
    identityOptions: IDENTITY_OPTIONS,
    isPrimary: true,
    canSubmit: false,
    saving: false,
  },

  onContactInput(e: WechatMiniprogram.Input) {
    const contactName = e.detail.value
    this.setData({ contactName })
    this._syncCanSubmit({ contactName })
  },

  onCompanyInput(e: WechatMiniprogram.Input) {
    const companyKeyword = e.detail.value
    const next = {
      companyKeyword,
      queriedCompanyName: '',
      hasQueriedCompany: false,
    }
    this.setData(next)
    this._syncCanSubmit(next)
  },

  onQueryCompany() {
    const contactName = this.data.contactName.trim()
    const companyKeyword = this.data.companyKeyword.trim()
    if (!contactName) {
      wx.showToast({ title: '请输入联系人称呼', icon: 'none' })
      return
    }
    if (!companyKeyword) {
      wx.showToast({ title: '请输入企业主体', icon: 'none' })
      return
    }
    const next = {
      contactName,
      companyKeyword,
      queriedCompanyName: companyKeyword,
      hasQueriedCompany: true,
    }
    this.setData(next)
    this._syncCanSubmit(next)
  },

  onIdentityTap(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { value: string; label: string }
    this.setData({
      identity: dataset.value,
      identityLabel: dataset.label,
    })
  },

  onPrimaryToggle() {
    this.setData({ isPrimary: !this.data.isPrimary })
  },

  async onSubmit() {
    if (this.data.saving) return
    if (!this.data.canSubmit) {
      wx.showToast({ title: '请先识别企业主体', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const openid = await ensureCurrentOpenid()
      await addLinkedCompany(openid, {
        contactName: this.data.contactName.trim(),
        companyKeyword: this.data.companyKeyword.trim(),
        identity: this.data.identity,
        identityLabel: this.data.identityLabel,
        isPrimary: this.data.isPrimary,
      })
      wx.showToast({ title: '已保存档案', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 600)
    } catch (_error) {
      this.setData({ saving: false })
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
    }
  },

  _syncCanSubmit(next: Partial<{
    contactName: string
    companyKeyword: string
    hasQueriedCompany: boolean
  }> = {}) {
    const contactName = next.contactName == null ? this.data.contactName : next.contactName
    const companyKeyword = next.companyKeyword == null ? this.data.companyKeyword : next.companyKeyword
    const hasQueriedCompany = next.hasQueriedCompany == null
      ? this.data.hasQueriedCompany
      : next.hasQueriedCompany
    this.setData({
      canSubmit: Boolean(contactName.trim() && companyKeyword.trim() && hasQueriedCompany),
    })
  },
})
