const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const MAX_INLINE_CONTENT_BYTES = 700 * 1024

function normalizeText(value) {
  return String(value || '').trim()
}

async function findDocument(event) {
  const db = cloud.database()
  const docId = normalizeText(event && event.docId)
  const sourcePath = normalizeText(event && event.sourcePath)

  if (docId) {
    const res = await db.collection('rag_documents').where({ docId }).limit(1).get()
    return res.data && res.data[0]
  }

  if (sourcePath) {
    const res = await db.collection('rag_documents').where({ sourcePath }).limit(1).get()
    return res.data && res.data[0]
  }

  return null
}

async function resolveTempFileURL(fileID) {
  const res = await cloud.getTempFileURL({
    fileList: [fileID],
  })
  const item = res.fileList && res.fileList[0]
  return item && (item.tempFileURL || item.download_url) || ''
}

async function downloadContent(fileID) {
  const res = await cloud.downloadFile({ fileID })
  if (!res || !res.fileContent) return ''
  const buffer = Buffer.from(res.fileContent)
  if (buffer.length > MAX_INLINE_CONTENT_BYTES) return ''
  return buffer.toString('utf8')
}

exports.main = async (event) => {
  try {
    const document = await findDocument(event || {})
    if (!document) {
      return { success: false, error: 'original document not found' }
    }

    if (!document.fileID) {
      return {
        success: false,
        error: 'original document fileID missing; please run npm run rag:upload with RAG_UPLOAD_SCOPE=documents or all',
        document,
      }
    }

    const includeContent = event && event.includeContent === true
    const tempFileURL = await resolveTempFileURL(document.fileID)
    const content = includeContent ? await downloadContent(document.fileID) : ''

    return {
      success: true,
      document,
      tempFileURL,
      content,
      contentTruncated: includeContent && !content,
    }
  } catch (err) {
    console.error('[ragOriginal] failed:', err)
    return {
      success: false,
      error: err.message || 'resolve original document failed',
    }
  }
}
