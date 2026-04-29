#!/usr/bin/env node

const fs = require('fs')
const https = require('https')
const path = require('path')
const crypto = require('crypto')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]]) return
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  })
}

loadEnvFile(path.resolve(__dirname, '../../.env'))
loadEnvFile(path.resolve(__dirname, '../.env'))

const ENV_ID = process.env.CLOUDBASE_ENV_ID || 'cloud-accounting-d7e5ld7733202af'
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'text-embedding-v4'
const EFFECTIVE_EMBEDDING_MODEL = process.env.RAG_USE_LOCAL_EMBEDDING === '1' ? 'local-keyword-fallback' : EMBEDDING_MODEL
const DATA_TRANS_ROOT = path.resolve(__dirname, '../../data/data_trans')
const OUTPUT_DIR = path.resolve(process.env.RAG_OUTPUT_DIR || path.resolve(__dirname, '../source-assets/rag'))
const VECTOR_SIZE = 1024
const MAX_CHARS = Number(process.env.RAG_CHUNK_MAX_CHARS || 1600)
const OVERLAP_CHARS = Number(process.env.RAG_CHUNK_OVERLAP_CHARS || 160)
const EMBEDDING_CONCURRENCY = Number(process.env.RAG_EMBEDDING_CONCURRENCY || 10)

const MODULES = {
  '电商财税实操': { moduleKey: 'ecommerce_tax', collection: 'rag_ecommerce_tax' },
  '两帐合一实操': { moduleKey: 'dual_accounts', collection: 'rag_dual_accounts' },
  '节税方案': { moduleKey: 'tax_saving', collection: 'rag_tax_saving' },
  '合伙股权设计': { moduleKey: 'equity_design', collection: 'rag_equity_design' },
  '政策查询': { moduleKey: 'policy_search', collection: 'rag_policy_search' },
  '稽查应对实操': { moduleKey: 'audit_response', collection: 'rag_audit_response' },
  '实用模板': { moduleKey: 'templates', collection: 'rag_templates' },
  '商业模式分析与融资建议': { moduleKey: 'business_model', collection: 'rag_business_model' },
}

const COMMON_MODULE = {
  moduleKey: 'common_qa',
  moduleName: '常见问题',
  collection: 'rag_common_qa',
}

function stableHash(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function contentHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex')
}

function normalizeText(value) {
  return String(value || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function localEmbedding(text) {
  const vector = new Array(VECTOR_SIZE).fill(0)
  const tokens = String(text).match(/[\u4e00-\u9fa5]{1,4}|[a-zA-Z0-9.%〔〕年第号]+/g) || []
  tokens.forEach((token) => {
    vector[Number.parseInt(stableHash(token), 36) % VECTOR_SIZE] += 1
  })
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => Number((value / norm).toFixed(8)))
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
    {
      model: EMBEDDING_MODEL,
      input: text,
    },
  )

  const vector = response && response.data && response.data[0] && response.data[0].embedding
  if (!Array.isArray(vector)) {
    throw new Error(`Embedding response missing vector: ${JSON.stringify(response).slice(0, 300)}`)
  }
  return vector
}

function walkMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath)
    }
  })
  return files.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function getModuleInfo(relativePath) {
  const parts = relativePath.split(path.sep)
  if (parts.length === 1) return COMMON_MODULE
  const moduleName = parts[0]
  const configured = MODULES[moduleName]
  if (!configured) {
    const moduleKey = stableHash(moduleName)
    return {
      moduleKey,
      moduleName,
      collection: `rag_${moduleKey}`,
    }
  }
  return {
    ...configured,
    moduleName,
  }
}

function titleFromFile(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/__/g, ' / ').trim()
}

function getDocumentMeta(filePath) {
  const relativePath = path.relative(DATA_TRANS_ROOT, filePath)
  const moduleInfo = getModuleInfo(relativePath)
  const fileName = path.basename(filePath)
  const title = titleFromFile(filePath)
  const docId = stableHash(relativePath)
  const markdown = fs.readFileSync(filePath, 'utf8')
  return {
    _id: `rag_document_${docId}`,
    docId,
    moduleKey: moduleInfo.moduleKey,
    moduleName: moduleInfo.moduleName,
    collection: moduleInfo.collection,
    sourcePath: relativePath.split(path.sep).join('/'),
    fileName,
    title,
    contentHash: contentHash(markdown),
    charLength: markdown.length,
    cloudPath: `rag/originals/${moduleInfo.moduleKey}/${docId}.md`,
    source: 'data_trans',
    updatedAt: Date.now(),
  }
}

function parseMarkdownSections(markdown, fileTitle) {
  const lines = normalizeText(markdown).split('\n')
  const sections = []
  let headingPath = []
  let buffer = []

  function flush() {
    const content = normalizeText(buffer.join('\n'))
    if (content.length >= 20) {
      sections.push({
        headingPath: headingPath.length ? [...headingPath] : [fileTitle],
        sectionTitle: headingPath[headingPath.length - 1] || fileTitle,
        content,
      })
    }
    buffer = []
  }

  lines.forEach((line) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (heading) {
      flush()
      const level = heading[1].length
      const text = normalizeText(heading[2])
      headingPath = headingPath.slice(0, level - 1)
      headingPath[level - 1] = text
      buffer.push(text)
      return
    }
    buffer.push(line)
  })
  flush()

  if (!sections.length) {
    const content = normalizeText(markdown)
    if (content) {
      sections.push({
        headingPath: [fileTitle],
        sectionTitle: fileTitle,
        content,
      })
    }
  }

  return sections
}

function splitLongContent(content) {
  const normalized = normalizeText(content)
  if (normalized.length <= MAX_CHARS) return [normalized]

  const chunks = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + MAX_CHARS, normalized.length)
    if (end < normalized.length) {
      const breakAt = Math.max(
        normalized.lastIndexOf('\n\n', end),
        normalized.lastIndexOf('。', end),
        normalized.lastIndexOf('；', end),
      )
      if (breakAt > start + Math.floor(MAX_CHARS * 0.55)) {
        end = breakAt + 1
      }
    }
    chunks.push(normalizeText(normalized.slice(start, end)))
    if (end >= normalized.length) break
    start = Math.max(end - OVERLAP_CHARS, start + 1)
  }
  return chunks.filter(Boolean)
}

function extractKeywords(parts) {
  const text = parts.filter(Boolean).join(' ')
  const tokens = text.match(/[\u4e00-\u9fa5]{2,8}|[a-zA-Z0-9.%〔〕年第号]+/g) || []
  const seen = new Set()
  const keywords = []
  tokens.forEach((token) => {
    if (seen.has(token)) return
    seen.add(token)
    keywords.push(token)
  })
  return keywords.slice(0, 80).join(' ')
}

function buildRawChunks(filePath) {
  const relativePath = path.relative(DATA_TRANS_ROOT, filePath)
  const moduleInfo = getModuleInfo(relativePath)
  const fileName = path.basename(filePath)
  const title = titleFromFile(filePath)
  const docId = stableHash(relativePath)
  const markdown = fs.readFileSync(filePath, 'utf8')
  const hash = contentHash(markdown)
  const cloudPath = `rag/originals/${moduleInfo.moduleKey}/${docId}.md`
  const sections = parseMarkdownSections(markdown, title)
  const chunks = []
  let index = 1

  sections.forEach((section) => {
    splitLongContent(section.content).forEach((content) => {
      const chunkId = String(index).padStart(4, '0')
      const keywords = extractKeywords([
        moduleInfo.moduleName,
        title,
        section.sectionTitle,
        section.headingPath.join(' '),
        content.slice(0, 500),
      ])
      chunks.push({
        _id: `${moduleInfo.collection}_${docId}_chunk_${chunkId}`,
        moduleKey: moduleInfo.moduleKey,
        moduleName: moduleInfo.moduleName,
        collection: moduleInfo.collection,
        sourcePath: relativePath.split(path.sep).join('/'),
        fileName,
        docId,
        chunkId,
        title,
        sectionTitle: section.sectionTitle,
        headingPath: section.headingPath,
        content,
        sourceExcerpt: content,
        keywords,
        cloudPath,
        contentHash: hash,
        originalCharLength: markdown.length,
        embeddingModel: EFFECTIVE_EMBEDDING_MODEL,
        source: 'data_trans',
        updatedAt: Date.now(),
      })
      index += 1
    })
  })

  return chunks
}

function writeDocumentsIndex(files) {
  const documentsPath = path.join(OUTPUT_DIR, 'documents.jsonl')
  const lines = files.map((filePath) => JSON.stringify(getDocumentMeta(filePath)))
  fs.writeFileSync(documentsPath, `${lines.join('\n')}\n`, 'utf8')
  console.log(`[rag:build] wrote ${files.length} documents to ${documentsPath}`)
}

function initCloudDatabase() {
  let tcb
  try {
    tcb = require('@cloudbase/node-sdk')
  } catch (err) {
    console.warn('[rag:build] @cloudbase/node-sdk not installed; skipped database upload.')
    return null
  }

  const secretId = process.env.CLOUDBASE_SECRET_ID || process.env.TENCENTCLOUD_SECRETID
  const secretKey = process.env.CLOUDBASE_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY
  if (!secretId || !secretKey) {
    console.warn('[rag:build] CloudBase credentials not found; skipped database upload.')
    console.warn('[rag:build] Set CLOUDBASE_SECRET_ID and CLOUDBASE_SECRET_KEY to write module collections.')
    return null
  }

  const app = tcb.init({ env: ENV_ID, secretId, secretKey })
  return app.database()
}

function getModuleState(states, chunk) {
  if (!states.has(chunk.collection)) {
    const jsonlPath = path.join(OUTPUT_DIR, `${chunk.moduleKey}.jsonl`)
    const jsonPath = path.join(OUTPUT_DIR, `${chunk.moduleKey}.json`)
    fs.writeFileSync(jsonlPath, '', 'utf8')
    states.set(chunk.collection, {
      moduleKey: chunk.moduleKey,
      moduleName: chunk.moduleName,
      collection: chunk.collection,
      jsonlPath,
      jsonPath,
      chunks: [],
      successCount: 0,
      failureCount: 0,
      startedAt: Date.now(),
    })
  }
  return states.get(chunk.collection)
}

async function uploadChunk(db, chunk) {
  if (!db) return
  const { _id, ...data } = chunk
  await db.collection(chunk.collection).doc(_id).set(data)
}

async function saveCompletedChunk(db, states, chunk) {
  const state = getModuleState(states, chunk)
  state.chunks.push(chunk)
  fs.appendFileSync(state.jsonlPath, `${JSON.stringify(chunk)}\n`, 'utf8')

  try {
    await uploadChunk(db, chunk)
    state.successCount += 1
  } catch (err) {
    state.failureCount += 1
    console.error(`[rag:build] upload failed for ${chunk._id}:`, err.message || err)
  }
}

async function processWithConcurrency(items, concurrency, worker) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor
      cursor += 1
      await worker(items[currentIndex], currentIndex)
    }
  })
  await Promise.all(workers)
}

async function processDocument(filePath, db, states) {
  const rawChunks = buildRawChunks(filePath)

  await processWithConcurrency(rawChunks, EMBEDDING_CONCURRENCY, async (chunk) => {
    const vectorText = [
      chunk.moduleName,
      chunk.title,
      chunk.sectionTitle,
      chunk.keywords,
      chunk.content,
    ].join('\n')
    chunk.vector = await createEmbedding(vectorText)
    await saveCompletedChunk(db, states, chunk)
  })

  console.log(`[rag:build] chunked+embedded+saved ${path.relative(DATA_TRANS_ROOT, filePath)} -> ${rawChunks.length}`)
}

async function writeBuildLogs(db, states) {
  if (!db) return
  for (const state of states.values()) {
    try {
      await db.collection('ragBuildLogs').add({
        envId: ENV_ID,
        moduleKey: state.moduleKey,
        moduleName: state.moduleName,
        collection: state.collection,
        embeddingModel: EFFECTIVE_EMBEDDING_MODEL,
        successCount: state.successCount,
        failureCount: state.failureCount,
        durationMs: Date.now() - state.startedAt,
        createdAt: Date.now(),
      })
    } catch (err) {
      console.warn('[rag:build] write ragBuildLogs failed:', err.message || err)
    }
  }
}

async function main() {
  const files = walkMarkdownFiles(DATA_TRANS_ROOT)
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  writeDocumentsIndex(files)
  const db = process.env.RAG_SKIP_UPLOAD === '1' ? null : initCloudDatabase()
  const states = new Map()

  if (!db) {
    console.log('[rag:build] cloud upload disabled or unavailable; chunks will still be saved locally as they finish.')
  }

  console.log(`[rag:build] embedding concurrency: ${EMBEDDING_CONCURRENCY}`)
  for (const filePath of files) {
    await processDocument(filePath, db, states)
  }

  let ok = true
  for (const state of states.values()) {
    fs.writeFileSync(state.jsonPath, `${JSON.stringify(state.chunks, null, 2)}\n`, 'utf8')
    ok = ok && state.failureCount === 0
    console.log(`[rag:build] wrote ${state.chunks.length} chunks to ${state.jsonPath}`)
    console.log(`[rag:build] streamed ${state.chunks.length} chunks to ${state.jsonlPath}`)
    if (db) {
      console.log(`[rag:build] ${state.collection} uploaded ${state.successCount}, failed ${state.failureCount}`)
    }
  }

  await writeBuildLogs(db, states)
  if (!ok) process.exitCode = 1
}

main().catch((err) => {
  console.error('[rag:build] failed:', err)
  process.exitCode = 1
})
