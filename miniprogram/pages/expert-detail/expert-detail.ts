import type { ExpertInfo } from '../../utils/constants'
import { EXPERTS } from '../../utils/expertData'
import { getExpertAvatarUrl } from '../../utils/cloudAssets'
import { createShareMessage, enableShareMenu } from '../../utils/share'

function getAvatarLabel(expert: ExpertInfo | null): string {
  return (expert && expert.name.charAt(0)) || '专'
}

function getAvatarSrc(expert: ExpertInfo | null): string {
  if (!expert) return ''
  return expert.avatarUrl || getExpertAvatarUrl(`${expert.avatar}.png`)
}

Page({
  data: {
    expert: null as ExpertInfo | null,
    avatarSrc: '',
    avatarLoadFailed: false,
    avatarLabel: '专',
  },

  onLoad(query: Record<string, string>) {
    enableShareMenu()
    const expertId = query.expertId || ''
    const expert = EXPERTS.find((item) => item.id === expertId) || null
    this.setData({
      expert,
      avatarSrc: getAvatarSrc(expert),
      avatarLoadFailed: false,
      avatarLabel: getAvatarLabel(expert),
    })
  },

  onAvatarError() {
    this.setData({ avatarLoadFailed: true })
  },

  onConsult() {
    if (!this.data.expert) return
    wx.navigateTo({ url: `/pages/expert-chat/expert-chat?expertId=${this.data.expert.id}` })
  },

  onShareAppMessage() {
    const expert = this.data.expert
    if (!expert) return createShareMessage()
    return createShareMessage({
      title: `${expert.name} - 财税专家咨询`,
      path: `/pages/expert-detail/expert-detail?expertId=${expert.id}`,
    })
  },
})
