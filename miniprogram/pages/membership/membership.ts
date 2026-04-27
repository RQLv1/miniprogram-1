import { MEMBERSHIP_FEATURES } from '../../utils/constants'
import { createShareMessage, enableShareMenu } from '../../utils/share'

const app = getApp<IAppOption>()

function featureToText(value: boolean | string) {
  if (value === true) return '✓'
  if (value === false) return '—'
  return value
}

Page({
  data: {
    memberLevel: 'free',
    memberLevelLabel: '免费用户',
    memberLevelMark: '免',
    selectedPlanId: 'vip',
    selectedPlanName: 'VIP 会员',
    selectedPlanPrice: '¥20',
    payButtonText: '立即开通',
    featuresView: MEMBERSHIP_FEATURES.map((item) => ({
      name: item.name,
      freeText: featureToText(item.free),
      vipText: featureToText(item.vip),
      svipText: featureToText(item.svip),
    })),
    plans: [
      {
        id: 'free',
        name: '免费版',
        badge: '当前',
        badgeColor: '#e5e7eb',
        badgeTextColor: '#667085',
        currency: '¥',
        amount: '0',
        period: '',
        desc: '基础 AI 问答',
        color: '#d0d5dd',
        bgColor: '#ffffff',
      },
      {
        id: 'vip',
        name: 'VIP 会员',
        badge: '推荐',
        badgeColor: '#1f4b99',
        badgeTextColor: '#ffffff',
        currency: '¥',
        amount: '20',
        period: '/月',
        desc: '全功能 + 专家咨询',
        color: '#1f4b99',
        bgColor: 'rgba(31,75,153,0.08)',
      },
      {
        id: 'svip',
        name: 'SVIP 会员',
        badge: '尊享',
        badgeColor: '#b7791f',
        badgeTextColor: '#5a3400',
        currency: '¥',
        amount: '99',
        period: '/月',
        desc: '全功能 + 优先服务',
        color: '#b7791f',
        bgColor: 'rgba(183,121,31,0.08)',
      },
    ],
  },

  onLoad() {
    enableShareMenu()
    const memberLevel = app.globalData.memberLevel || 'free'
    const levelLabelMap = {
      free: ['免费用户', '免'],
      vip: ['VIP 会员', 'V'],
      svip: ['SVIP 会员', 'S'],
    } as const
    const selectedPlanId = memberLevel === 'free' ? 'vip' : memberLevel
    const selectedPlan = this.data.plans.find((item) => item.id === selectedPlanId) || this.data.plans[1]

    this.setData({
      memberLevel,
      memberLevelLabel: levelLabelMap[memberLevel][0],
      memberLevelMark: levelLabelMap[memberLevel][1],
      selectedPlanId,
      selectedPlanName: selectedPlan.name,
      selectedPlanPrice: `${selectedPlan.currency}${selectedPlan.amount}${selectedPlan.period}`,
      payButtonText: memberLevel === selectedPlanId ? '当前套餐' : '立即开通',
    })
  },

  onPlanSelect(e: WechatMiniprogram.TouchEvent) {
    const planId = (e.currentTarget.dataset as { planId: string }).planId
    const plan = this.data.plans.find((item) => item.id === planId)
    if (!plan) return
    this.setData({
      selectedPlanId: planId,
      selectedPlanName: plan.name,
      selectedPlanPrice: `${plan.currency}${plan.amount}${plan.period}`,
      payButtonText: this.data.memberLevel === planId ? '当前套餐' : '立即开通',
    })
  },

  onSubscribe() {
    if (this.data.memberLevel === this.data.selectedPlanId) {
      wx.showToast({ title: '已是当前套餐', icon: 'none' })
      return
    }
    wx.showToast({ title: '支付功能开发中', icon: 'none' })
  },

  onShareAppMessage() {
    return createShareMessage({
      title: '智税宝顾问会员权益',
      path: '/pages/membership/membership',
    })
  },
})
