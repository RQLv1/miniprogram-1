// components/expert-card/expert-card.ts
// 专家卡片组件：展示专家头像、姓名、职称、标签、评分、咨询按钮

import type { ExpertInfo } from '../../utils/constants'

function getAvatarLabel(expert?: Partial<ExpertInfo>): string {
  return (expert && expert.name && expert.name.charAt(0)) || '专'
}

Component({
  properties: {
    expert: {
      type: Object,
      value: {} as unknown as ExpertInfo,
      observer(expert) {
        this.setData({
          avatarLoadFailed: false,
          avatarLabel: getAvatarLabel(expert as Partial<ExpertInfo>),
        })
      },
    },
  },

  data: {
    avatarLoadFailed: false,
    avatarLabel: '专',
  },

  methods: {
    onAvatarError() {
      this.setData({ avatarLoadFailed: true })
    },

    onConsult() {
      const expert = this.properties.expert as ExpertInfo
      if (!expert || !expert.id) return
      wx.navigateTo({
        url: `/pages/expert-detail/expert-detail?expertId=${expert.id}`,
      })
    },
  },
})
