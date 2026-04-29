const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'text-embedding-v4'
const VECTOR_SIZE = 1024
const MAX_ROWS = Number(process.env.RAG_MAX_ROWS || 20000)

const MODULES = {
  ecommerce_tax: { moduleKey: 'ecommerce_tax', moduleName: '电商财税实操', collection: 'rag_ecommerce_tax' },
  dual_accounts: { moduleKey: 'dual_accounts', moduleName: '两帐合一实操', collection: 'rag_dual_accounts' },
  tax_saving: { moduleKey: 'tax_saving', moduleName: '节税方案', collection: 'rag_tax_saving' },
  equity_design: { moduleKey: 'equity_design', moduleName: '合伙股权设计', collection: 'rag_equity_design' },
  policy_search: { moduleKey: 'policy_search', moduleName: '政策查询', collection: 'rag_policy_search' },
  audit_response: { moduleKey: 'audit_response', moduleName: '稽查应对实操', collection: 'rag_audit_response' },
  templates: { moduleKey: 'templates', moduleName: '实用模板', collection: 'rag_templates' },
  business_model: { moduleKey: 'business_model', moduleName: '商业模式分析与融资建议', collection: 'rag_business_model' },
  common_qa: { moduleKey: 'common_qa', moduleName: '常见问题', collection: 'rag_common_qa' },
}

const TOOL_MODULE_MAP = {
  'policy-search': 'policy_search',
  'tax-saving': 'tax_saving',
  'equity-design': 'equity_design',
  'dual-accounts': 'dual_accounts',
  'audit-response': 'audit_response',
  'business-model': 'business_model',
  'tax-detection': 'tax_saving',
  'risk-detection': 'audit_response',
  'data-analysis': 'business_model',
}

const POLICY_SEARCH_SOURCE_PATHS = new Set([
  '政策查询/增值税系列配套文件重点问题讲解01.md',
  '政策查询/增值税系列配套文件重点问题讲解02.md',
  '政策查询/增值税新政重大疑难问题破局04.md',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function stableHash(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function localEmbedding(text) {
  const vector = new Array(VECTOR_SIZE).fill(0)
  const tokens = normalizeText(text).match(/[\u4e00-\u9fa5]{1,4}|[a-zA-Z0-9.%〔〕年第号]+/g) || []
  tokens.forEach((token) => {
    vector[stableHash(token) % VECTOR_SIZE] += 1
  })
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => value / norm)
}

function postJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url)
    const req = https.request({
      method: 'POST',
      hostname: endpoint.hostname,
      path: endpoint.pathname + endpoint.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        raw += chunk
      })
      res.on('end', () => {
        let parsed
        try {
          parsed = raw ? JSON.parse(raw) : {}
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${raw.slice(0, 200)}`))
          return
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 300)}`))
          return
        }
        resolve(parsed)
      })
    })
    req.on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

async function createEmbedding(text) {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey || process.env.RAG_USE_LOCAL_EMBEDDING === '1') {
    return localEmbedding(text)
  }

  const response = await postJson(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
    { Authorization: `Bearer ${apiKey}` },
    { model: EMBEDDING_MODEL, input: text },
  )
  const vector = response && response.data && response.data[0] && response.data[0].embedding
  if (!Array.isArray(vector)) {
    throw new Error('Embedding response missing vector')
  }
  return vector
}

function inferModuleKey(query) {
  if (/电商|直播|主播|平台|店铺|好评返现|跨境/.test(query)) return 'ecommerce_tax'
  if (/两账|两帐|内外账|AB账|公私|个人卡|私卡/.test(query)) return 'dual_accounts'
  if (/税负|降低税负|减少税负|降税|减税|节税|避税|税筹|筹划|纳税筹划|税收筹划|合理避税|缺票|税收洼地|拿钱/.test(query)) return 'tax_saving'
  if (/股权|合伙|持股|代持|分红|控制权|激励/.test(query)) return 'equity_design'
  if (/稽查|检查|自查|税务局|约谈|补税|处罚/.test(query)) return 'audit_response'
  if (/合同|协议|模板|表格|员工手册|申请表/.test(query)) return 'templates'
  if (/商业模式|融资|估值|计划书|经营分析/.test(query)) return 'business_model'
  if (/政策|税率|免征|加计扣除|公告|财税|增值税|企业所得税|个人所得税|印花税/.test(query)) return 'policy_search'
  return ''
}

function resolveModule(event, query) {
  const rawModuleKey = normalizeText(event && event.moduleKey).replace(/-/g, '_')
  if (rawModuleKey) return MODULES[rawModuleKey]

  const toolId = normalizeText(event && event.toolId)
  if (toolId && TOOL_MODULE_MAP[toolId]) {
    return MODULES[TOOL_MODULE_MAP[toolId]]
  }

  const inferred = inferModuleKey(query)
  if (inferred) return MODULES[inferred]

  return MODULES.common_qa
}

function isPolicyDirectSearch(event) {
  return normalizeText(event && event.toolId) === 'policy-search'
}

async function fetchChunks(moduleInfo) {
  const db = cloud.database()
  const collection = db.collection(moduleInfo.collection)
  const pageSize = 100
  const chunks = []

  for (let skip = 0; skip < MAX_ROWS; skip += pageSize) {
    const res = await collection.skip(skip).limit(pageSize).get()
    chunks.push(...(res.data || []))
    if (!res.data || res.data.length < pageSize) break
  }
  return chunks
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0
  const length = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < length; i += 1) {
    const av = Number(a[i]) || 0
    const bv = Number(b[i]) || 0
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function tokenize(query) {
  return normalizeText(query)
    .replace(/[，。！？、；：,.!?;:()[\]【】《》]/g, ' ')
    .split(/\s+/)
    .flatMap((part) => {
      const tokens = [part]
      const zhTokens = part.match(/[\u4e00-\u9fa5]{2,8}/g) || []
      return tokens.concat(zhTokens)
    })
    .filter((item) => item && item.length >= 2)
}

function keywordScore(tokens, chunk) {
  const title = normalizeText(chunk.title)
  const sectionTitle = normalizeText(chunk.sectionTitle)
  const headingPath = Array.isArray(chunk.headingPath) ? chunk.headingPath.join(' ') : ''
  const keywords = normalizeText(chunk.keywords)
  const sourcePath = normalizeText(chunk.sourcePath)
  const content = normalizeText(chunk.content)
  let score = 0

  tokens.forEach((token) => {
    if (title.includes(token)) score += 0.35
    if (sectionTitle.includes(token)) score += 0.35
    if (headingPath.includes(token)) score += 0.2
    if (keywords.includes(token)) score += 0.2
    if (sourcePath.includes(token)) score += 0.12
    if (content.includes(token)) score += 0.08
  })

  return Math.min(score, 1)
}

function buildAnswerContext(matches) {
  return matches.map((item, index) => [
    `【资料${index + 1}】${item.title}`,
    `模块：${item.moduleName || '未注明'}`,
    `来源：${item.sourcePath || item.fileName || '未注明'}`,
    `章节：${item.sectionTitle || '未注明'}`,
    `原文摘录：${item.sourceExcerpt || item.content}`,
  ].join('\n')).join('\n\n')
}

function buildMatch(chunk, moduleInfo, score) {
  return {
    moduleKey: chunk.moduleKey || moduleInfo.moduleKey,
    moduleName: chunk.moduleName || moduleInfo.moduleName,
    collection: moduleInfo.collection,
    sourcePath: chunk.sourcePath || '',
    fileName: chunk.fileName || '',
    docId: chunk.docId || '',
    chunkId: chunk.chunkId || '',
    title: chunk.title || chunk.fileName || '',
    sectionTitle: chunk.sectionTitle || '',
    headingPath: chunk.headingPath || [],
    content: chunk.content || '',
    sourceExcerpt: chunk.sourceExcerpt || chunk.content || '',
    cloudPath: chunk.cloudPath || '',
    contentHash: chunk.contentHash || '',
    originalCharLength: chunk.originalCharLength || 0,
    score,
  }
}

function searchPolicyChunksByKeyword(chunks, query, moduleInfo, topK) {
  const tokens = tokenize(query)
  return chunks
    .filter((chunk) => POLICY_SEARCH_SOURCE_PATHS.has(normalizeText(chunk.sourcePath)))
    .map((chunk) => buildMatch(chunk, moduleInfo, keywordScore(tokens, chunk)))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

exports.main = async (event) => {
  const query = normalizeText(event && event.query)
  const topK = Math.min(Math.max(Number(event && event.topK) || 5, 1), 10)

  if (!query) {
    return { success: false, error: 'query is required', query: '', answerContext: '', matches: [] }
  }

  const moduleInfo = resolveModule(event || {}, query)
  if (!moduleInfo) {
    return { success: false, error: 'unknown module', query, answerContext: '', matches: [] }
  }

  try {
    const chunks = await fetchChunks(moduleInfo)
    if (!chunks.length) {
      return {
        success: true,
        query,
        moduleKey: moduleInfo.moduleKey,
        moduleName: moduleInfo.moduleName,
        collection: moduleInfo.collection,
        answerContext: '',
        matches: [],
      }
    }

    if (isPolicyDirectSearch(event || {})) {
      const matches = searchPolicyChunksByKeyword(chunks, query, moduleInfo, topK)
      return {
        success: true,
        query,
        moduleKey: moduleInfo.moduleKey,
        moduleName: moduleInfo.moduleName,
        collection: moduleInfo.collection,
        answerContext: buildAnswerContext(matches),
        matches,
        maxScore: matches.length ? matches[0].score : 0,
      }
    }

    const usesLocalVectors = chunks.some((chunk) => chunk.embeddingModel === 'local-keyword-fallback')
    const queryVector = usesLocalVectors ? localEmbedding(query) : await createEmbedding(query)
    const tokens = tokenize(query)
    const matches = chunks
      .map((chunk) => {
        const vector = Array.isArray(chunk.vector) ? chunk.vector : localEmbedding(chunk.keywords || chunk.content || '')
        const vectorScore = cosineSimilarity(queryVector, vector)
        const sparseScore = keywordScore(tokens, chunk)
        const score = vectorScore * 0.76 + sparseScore * 0.24
        return buildMatch(chunk, moduleInfo, score)
      })
      .filter((item) => item.score > 0.015)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    return {
      success: true,
      query,
      moduleKey: moduleInfo.moduleKey,
      moduleName: moduleInfo.moduleName,
      collection: moduleInfo.collection,
      answerContext: buildAnswerContext(matches),
      matches,
      maxScore: matches.length ? matches[0].score : 0,
    }
  } catch (err) {
    console.error('[ragRetrieval] failed:', err)
    return {
      success: false,
      error: err.message || 'rag retrieval failed',
      query,
      moduleKey: moduleInfo.moduleKey,
      moduleName: moduleInfo.moduleName,
      collection: moduleInfo.collection,
      answerContext: '',
      matches: [],
    }
  }
}
