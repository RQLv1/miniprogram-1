import { ensureCurrentOpenid, getCurrentUser, maskPhone, updateUserInfo } from '../../utils/auth'
import { getLinkedCompanies } from '../../utils/cloudDB'
import type { MembershipLevel } from '../../utils/constants'
import { createShareMessage, enableShareMenu } from '../../utils/share'

interface MenuItem {
  icon: string
  text: string
  url: string
}

const MENU_ITEMS: MenuItem[] = [
  { icon: '/assets/icons/orders.svg',    text: '我的订单',     url: '/pages/orders/orders' },
  { icon: '/assets/icons/purchased.svg', text: '已购订单',     url: '/pages/purchased/purchased' },
  { icon: '/assets/icons/pdf.svg',       text: '下载PDF',      url: '/pages/download-pdf/download-pdf' },
  { icon: '/assets/icons/service.svg',   text: '在线客服',     url: '' },
  { icon: '/assets/icons/privacy.svg',   text: '隐私政策',     url: '/pages/privacy/privacy' },
  { icon: '/assets/icons/terms.svg',     text: '风险责任条款', url: '/pages/terms/terms' },
]

const LEVEL_LABEL: Record<MembershipLevel, string> = {
  free: '免费用户',
  vip: 'VIP 会员',
  svip: 'SVIP 会员',
}

Page({
  data: {
    isLoggedIn: false,
    displayName: '',
    avatarUrl: '',
    memberLevel: 'free' as MembershipLevel,
    memberLevelLabel: '免费用户',
    memberStatusText: '未开通',
    vipButtonText: '去开通',
    linkedCompanyLoading: false,
    hasLinkedCompanies: false,
    linkedCompaniesCount: 0,
    primaryCompanyName: '',
    linkedCompanyDesc: '用于报告、订单和咨询记录归档',
    menuItems: MENU_ITEMS,
    isEditing: false,
    editNickname: '',
    editAvatarPath: '',
    editLoading: false,
  },

  onLoad() {
    enableShareMenu()
  },

  onShow() {
    const tabBar = (this as any).getTabBar()
    if (tabBar) {
      tabBar.setData({ selected: 3 })
    }
    this._refresh()
    this._loadLinkedCompanies()
  },

  _refresh() {
    const user = getCurrentUser()
    const isLoggedIn = !!user.openid
    const displayName =
      user.nickname ||
      (user.phone ? maskPhone(user.phone) : user.openid ? `${user.openid.slice(0, 10)}...` : '')
    const memberLevel = user.memberLevel || 'free'
    this.setData({
      isLoggedIn,
      displayName,
      avatarUrl: user.avatarUrl || '',
      memberLevel,
      memberLevelLabel: LEVEL_LABEL[memberLevel],
      memberStatusText: memberLevel === 'free' ? '未开通' : '已开通',
      vipButtonText: memberLevel === 'free' ? '去开通' : '查看权益',
    })
  },

  async _loadLinkedCompanies() {
    this.setData({ linkedCompanyLoading: true })
    try {
      const openid = await ensureCurrentOpenid()
      const companies = await getLinkedCompanies(openid)
      const primaryCompany = companies.find((item) => item.isPrimary) || companies[0]
      this.setData({
        linkedCompanyLoading: false,
        hasLinkedCompanies: companies.length > 0,
        linkedCompaniesCount: companies.length,
        primaryCompanyName: primaryCompany ? primaryCompany.companyKeyword : '',
        linkedCompanyDesc: companies.length > 0
          ? `共 ${companies.length} 个企业档案`
          : '用于报告、订单和咨询记录归档',
      })
    } catch (_error) {
      this.setData({
        linkedCompanyLoading: false,
        hasLinkedCompanies: false,
        linkedCompaniesCount: 0,
        primaryCompanyName: '',
        linkedCompanyDesc: '用于报告、订单和咨询记录归档',
      })
    }
  },

  onEditTap() {
    const user = getCurrentUser()
    this.setData({
      isEditing: true,
      editNickname: user.nickname || '',
      editAvatarPath: user.avatarUrl || '',
    })
  },

  onEditCancel() {
    this.setData({ isEditing: false })
  },

  onEditChooseAvatar(e: { detail: { avatarUrl: string } }) {
    this.setData({ editAvatarPath: e.detail.avatarUrl })
  },

  onEditNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ editNickname: e.detail.value })
  },

  async onEditSave() {
    const { editNickname, editAvatarPath } = this.data
    if (!editNickname.trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }

    this.setData({ editLoading: true })
    try {
      let avatarFileID = editAvatarPath
      // 只有选了新头像（本地路径）才上传
      if (editAvatarPath && !editAvatarPath.startsWith('cloud://')) {
        let localPath = editAvatarPath
        if (editAvatarPath.startsWith('https://')) {
          const dlRes = await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>((resolve, reject) => {
            wx.downloadFile({ url: editAvatarPath, success: resolve, fail: reject })
          })
          localPath = dlRes.tempFilePath
        }
        const compressRes = await wx.compressImage({ src: localPath, quality: 60 })
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
          filePath: compressRes.tempFilePath,
        })
        avatarFileID = uploadRes.fileID
      }

      const result = await updateUserInfo({ nickname: editNickname.trim(), avatarFileID })
      if (!result.success) {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
        return
      }

      const app = getApp<IAppOption>()
      app.globalData.nickname = editNickname.trim()
      app.globalData.avatarUrl = avatarFileID

      this.setData({ isEditing: false })
      this._refresh()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      console.error('[profile] onEditSave error:', err)
      wx.showToast({ title: '操作失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ editLoading: false })
    }
  },

  onLoginTap() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onVipTap() {
    wx.navigateTo({ url: '/pages/membership/membership' })
  },

  onViewLinkedCompanies() {
    wx.navigateTo({ url: '/pages/linked-companies/linked-companies' })
  },

  onAddLinkedCompany() {
    wx.navigateTo({ url: '/pages/linked-companies/add-linked-company' })
  },

  onMenuTap(e: WechatMiniprogram.TouchEvent) {
    const url = (e.currentTarget.dataset as { url: string }).url
    if (!url) {
      wx.showToast({ title: '功能开发中', icon: 'none' })
      return
    }
    wx.navigateTo({ url })
  },

  onShareAppMessage() {
    return createShareMessage()
  },
})
