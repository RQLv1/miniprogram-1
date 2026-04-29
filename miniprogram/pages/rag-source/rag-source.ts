import { getRagOriginal } from '../../utils/cloudDB'

const SOURCE_RENDER_CHUNK_SIZE = 24000

function downloadUrl(url: string): Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({ url, success: resolve, fail: reject })
  })
}

function readTextFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'utf8',
      success: (res) => resolve(String(res.data || '')),
      fail: reject,
    })
  })
}

async function downloadSourceContent(fileID: string, tempFileURL: string): Promise<string> {
  if (fileID) {
    try {
      const res = await wx.cloud.downloadFile({ fileID })
      return readTextFile(res.tempFilePath)
    } catch (err) {
      if (!tempFileURL) throw err
      console.warn('[rag-source] cloud download failed, fallback to temp url:', err)
    }
  }
  const res = await downloadUrl(tempFileURL)
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`原文下载失败：HTTP ${res.statusCode}`)
  }
  return readTextFile(res.tempFilePath)
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return '原文加载失败'
}

Page({
  data: {
    loading: true,
    error: '',
    title: '',
    moduleName: '',
    sourcePath: '',
    sectionTitle: '',
    content: '',
    hasMoreContent: false,
    contentProgress: '',
  },

  _fullContent: '',
  _visibleCharCount: 0,

  onLoad(query: Record<string, string>) {
    const docId = decodeURIComponent(query.docId || '')
    const sourcePath = decodeURIComponent(query.sourcePath || '')
    const sectionTitle = decodeURIComponent(query.sectionTitle || '')
    this.setData({ sectionTitle })
    this._loadOriginal(docId, sourcePath)
  },

  _loadOriginal(docId: string, sourcePath: string) {
    getRagOriginal({ docId, sourcePath, includeContent: false })
      .then(async (res) => {
        if (!res || !res.success || !res.document) {
          throw new Error(res && res.error || '原文加载失败')
        }
        const document = res.document
        const content = res.content || (document.fileID || res.tempFileURL
          ? await downloadSourceContent(document.fileID || '', res.tempFileURL || '')
          : '')
        this.setData({
          loading: false,
          title: document.title || document.fileName || '原文资料',
          moduleName: document.moduleName || '',
          sourcePath: document.sourcePath || '',
        })
        wx.setNavigationBarTitle({ title: document.title || '原文资料' })
        this._setSourceContent(content || '原文文件已找到，但暂时无法读取内容。')
      })
      .catch((err: unknown) => {
        console.error('[rag-source] load original failed:', err)
        this.setData({
          loading: false,
          error: getErrorMessage(err),
        })
      })
  },

  _setSourceContent(content: string) {
    this._fullContent = content
    this._visibleCharCount = Math.min(SOURCE_RENDER_CHUNK_SIZE, content.length)
    this._syncVisibleContent()
  },

  _syncVisibleContent() {
    const hasMoreContent = this._visibleCharCount < this._fullContent.length
    this.setData({
      content: this._fullContent.slice(0, this._visibleCharCount),
      hasMoreContent,
      contentProgress: hasMoreContent
        ? `已显示 ${this._visibleCharCount} / ${this._fullContent.length} 字`
        : '',
    })
  },

  onLoadMoreContent() {
    this._visibleCharCount = Math.min(
      this._visibleCharCount + SOURCE_RENDER_CHUNK_SIZE,
      this._fullContent.length,
    )
    this._syncVisibleContent()
  },
})
