import { isReportToolId } from '../../utils/constants'
import { ensureCurrentOpenid } from '../../utils/auth'
import { getReportById, getReports, ReportDoc, updateReportPdfUrl } from '../../utils/cloudDB'
import { createReportPdfBuffer, PDF_RENDER_VERSION } from '../../utils/pdf'

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
    keyword: '',
    preferredReportId: '',
    reports: [] as Array<{
      id: string
      title: string
      createdText: string
      pdfUrl?: string
      pdfVersion?: number
      hasPdf: boolean
      isGenerating: boolean
      focused: boolean
    }>,
    filteredReports: [] as Array<{
      id: string
      title: string
      createdText: string
      pdfUrl?: string
      pdfVersion?: number
      hasPdf: boolean
      isGenerating: boolean
      focused: boolean
    }>,
  },

  onLoad(query: Record<string, string>) {
    this.setData({ preferredReportId: query.reportId || '' })
  },

  onShow() {
    this._loadReports()
  },

  async _loadReports() {
    this.setData({ loading: true })
    try {
      const openid = await ensureCurrentOpenid()
      const reports = await getReports(openid)
      const preferredId = this.data.preferredReportId
      const nextReports = reports
        .filter((item) => isReportToolId(item.type || ''))
        .map((item: ReportDoc) => ({
          id: String(item._id || ''),
          title: item.title || '财税分析报告',
          createdText: formatDate(item.createdAt),
          pdfUrl: item.pdfUrl,
          pdfVersion: item.pdfVersion,
          hasPdf: !!item.pdfUrl && item.pdfVersion === PDF_RENDER_VERSION,
          isGenerating: false,
          focused: preferredId ? String(item._id || '') === preferredId : false,
        }))
      nextReports.sort((a, b) => Number(b.focused) - Number(a.focused))
      this.setData({ loading: false, reports: nextReports })
      this._applyFilter(this.data.keyword)
    } catch (_error) {
      this.setData({ loading: false, reports: [], filteredReports: [] })
    }
  },

  onKeywordChange(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ keyword })
    this._applyFilter(keyword)
  },

  _applyFilter(keyword = '') {
    const normalized = keyword.trim().toLowerCase()
    const filteredReports = this.data.reports.filter((item) => item.title.toLowerCase().includes(normalized))
    this.setData({ filteredReports })
  },

  _updateReportState(id: string, patch: Partial<{
    pdfUrl?: string
    pdfVersion?: number
    hasPdf: boolean
    isGenerating: boolean
  }>) {
    const reports = this.data.reports.map((item) => {
      if (item.id !== id) return item
      return { ...item, ...patch }
    })
    this.setData({ reports })
    this._applyFilter(this.data.keyword)
  },

  async _downloadPdfToTemp(pdfUrl: string): Promise<string> {
    let downloadUrl = pdfUrl
    if (downloadUrl.startsWith('cloud://')) {
      const result = await wx.cloud.getTempFileURL({ fileList: [downloadUrl] })
      downloadUrl = result.fileList[0].tempFileURL
    }
    return new Promise<string>((resolve, reject) => {
      wx.downloadFile({
        url: downloadUrl,
        success: (res) => resolve(res.tempFilePath),
        fail: reject,
      })
    })
  },

  async _writePdfTempFile(reportId: string, buffer: ArrayBuffer): Promise<string> {
    const filePath = `${wx.env.USER_DATA_PATH}/report-${reportId}.pdf`
    const fs = wx.getFileSystemManager()
    await new Promise<void>((resolve, reject) => {
      fs.writeFile({
        filePath,
        data: buffer,
        success: () => resolve(),
        fail: reject,
      })
    })
    return filePath
  },

  async _generatePdf(reportId: string): Promise<string> {
    const openid = await ensureCurrentOpenid()
    const report = await getReportById(reportId)
    if (!isReportToolId(report.type || '')) {
      throw new Error('unsupported report type')
    }

    const buffer = createReportPdfBuffer(report)
    const filePath = await this._writePdfTempFile(reportId, buffer)
    const uploadRes = await wx.cloud.uploadFile({
      cloudPath: `reports/${openid}/${reportId}-${Date.now()}.pdf`,
      filePath,
    })
    await updateReportPdfUrl(reportId, uploadRes.fileID, PDF_RENDER_VERSION)
    this._updateReportState(reportId, {
      pdfUrl: uploadRes.fileID,
      pdfVersion: PDF_RENDER_VERSION,
      hasPdf: true,
    })
    return filePath
  },

  onReportTap(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id: string }).id
    wx.navigateTo({ url: `/pages/report-detail/report-detail?id=${id}` })
  },

  async onDownload(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id: string }).id
    const report = this.data.reports.find((item) => item.id === id)
    if (!report || report.isGenerating) {
      return
    }

    this._updateReportState(id, { isGenerating: true })
    const useCachedPdf = !!report.pdfUrl && report.pdfVersion === PDF_RENDER_VERSION
    wx.showLoading({ title: useCachedPdf ? '下载中...' : '生成中...' })

    try {
      const tempPath = useCachedPdf && report.pdfUrl
        ? await this._downloadPdfToTemp(report.pdfUrl)
        : await this._generatePdf(id)
      wx.hideLoading()
      wx.openDocument({ filePath: tempPath, showMenu: true })
    } catch (error) {
      console.error('[download-pdf] generate/download failed:', error)
      wx.hideLoading()
      wx.showToast({ title: '导出失败，请稍后重试', icon: 'none' })
    } finally {
      this._updateReportState(id, { isGenerating: false })
    }
  },
})
