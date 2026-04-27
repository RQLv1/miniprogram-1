import { ReportDoc } from '../../utils/cloudDB'
import { markdownToHtml } from '../../utils/markdown'
import { isReportToolId } from '../../utils/constants'
import { createShareMessage, enableShareMenu } from '../../utils/share'

const REPORT_TYPE_NAMES: Record<string, string> = {
  'tax-detection': '税负检测',
  'risk-detection': '风险检测',
  'tax-saving': '节税方案',
  'policy-search': '政策查询',
  'business-model': '商业模式融资',
  'data-analysis': '管理数据分析',
  'equity-design': '合伙股权设计',
  'dual-accounts': '两帐合一实操',
  'audit-response': '稽查应对实操',
}

function formatDate(timestamp = 0) {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}`
}

Page({
  data: {
    loading: true,
    report: null as ReportDoc | null,
    reportHtml: '',
    reportView: {
      title: '',
      typeLabel: '',
      createdText: '',
      questionText: '',
      iconLabel: '报',
    },
  },

  onLoad(query: Record<string, string>) {
    enableShareMenu()
    const id = query.id || ''
    if (id) this._loadReport(id)
  },

  async _loadReport(id: string) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('reports').doc(id).get()
      const report = res.data as ReportDoc
      if (!isReportToolId(report.type || '')) {
        throw new Error('invalid report type')
      }
      this.setData({
        loading: false,
        report,
        reportHtml: markdownToHtml(report.content || ''),
        reportView: {
          title: report.title || '财税分析报告',
          typeLabel: REPORT_TYPE_NAMES[report.type] || report.type || '财税分析',
          createdText: formatDate(report.createdAt),
          questionText: report.questionText || '未记录原始问题，当前展示为已生成报告内容。',
          iconLabel: '报',
        },
      })
    } catch (_error) {
      this.setData({ loading: false, report: null })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onDownloadPdf() {
    if (!this.data.report) return
    wx.navigateTo({ url: `/pages/download-pdf/download-pdf?reportId=${this.data.report._id || ''}` })
  },

  onShareAppMessage() {
    const report = this.data.report
    return createShareMessage({
      title: report ? report.title || '财税分析报告' : '财税分析报告',
      path: `/pages/report-detail/report-detail?id=${report ? report._id || '' : ''}`,
    })
  },
})
