import { createShareMessage, enableShareMenu } from '../../utils/share'

interface CompanyTool {
  name: string
  desc: string
  icon: string
  url: string
}

const COMPANY_TOOLS: CompanyTool[] = [
  { name: '企业信用公示系统', desc: '工商信息查询', icon: '/assets/icons/company-credit.svg', url: 'https://www.gsxt.gov.cn/' },
  { name: '天眼查', desc: '商业信息平台', icon: '/assets/icons/tianyancha.svg', url: 'https://www.tianyancha.com/' },
  { name: '企查查', desc: '企业信息查询', icon: '/assets/icons/qichacha.svg', url: 'https://www.qcc.com/' },
  { name: '中国裁判文书网', desc: '司法文书检索', icon: '/assets/icons/court-doc.svg', url: 'https://wenshu.court.gov.cn/' },
  { name: '行政处罚文书网', desc: '行政执法信息公开', icon: '/assets/icons/penalty.svg', url: 'https://cfws.samr.gov.cn/' },
]

Page({
  data: {
    tools: COMPANY_TOOLS,
    keyword: '',
  },

  onLoad() {
    enableShareMenu()
  },

  onShow() {
    const tabBar = this.getTabBar()
    if (tabBar) {
      tabBar.setData({ selected: 2 })
    }
  },

  onKeywordChange(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
  },

  onToolTap(e: WechatMiniprogram.TouchEvent) {
    const url = (e.currentTarget.dataset as { url: string }).url
    wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` })
  },

  onShareAppMessage() {
    return createShareMessage()
  },
})
