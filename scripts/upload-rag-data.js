#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const readline = require('readline')

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
const RAG_DIR = path.resolve(process.env.RAG_OUTPUT_DIR || path.resolve(__dirname, '../source-assets/rag'))
const DATA_TRANS_ROOT = path.resolve(process.env.DATA_TRANS_ROOT || path.resolve(__dirname, '../../data/data_trans'))
const UPLOAD_CONCURRENCY = Number(process.env.RAG_UPLOAD_CONCURRENCY || 10)
const UPLOAD_SCOPE = process.env.RAG_UPLOAD_SCOPE || 'all'

const MODULE_FILES = [
  { moduleKey: 'ecommerce_tax', moduleName: '电商财税实操', collection: 'rag_ecommerce_tax' },
  { moduleKey: 'dual_accounts', moduleName: '两帐合一实操', collection: 'rag_dual_accounts' },
  { moduleKey: 'tax_saving', moduleName: '节税方案', collection: 'rag_tax_saving' },
  { moduleKey: 'equity_design', moduleName: '合伙股权设计', collection: 'rag_equity_design' },
  { moduleKey: 'policy_search', moduleName: '政策查询', collection: 'rag_policy_search' },
  { moduleKey: 'audit_response', moduleName: '稽查应对实操', collection: 'rag_audit_response' },
  { moduleKey: 'templates', moduleName: '实用模板', collection: 'rag_templates' },
  { moduleKey: 'business_model', moduleName: '商业模式分析与融资建议', collection: 'rag_business_model' },
  { moduleKey: 'common_qa', moduleName: '常见问题', collection: 'rag_common_qa' },
]

function initCloudApp() {
  let tcb
  try {
    tcb = require('@cloudbase/node-sdk')
  } catch (err) {
    throw new Error('@cloudbase/node-sdk is required for rag upload')
  }

  const secretId = process.env.CLOUDBASE_SECRET_ID || process.env.TENCENTCLOUD_SECRETID
  const secretKey = process.env.CLOUDBASE_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY
  if (!secretId || !secretKey) {
    throw new Error('CLOUDBASE_SECRET_ID and CLOUDBASE_SECRET_KEY are required')
  }

  const app = tcb.init({ env: ENV_ID, secretId, secretKey })
  return app
}

async function ensureCollection(db, name) {
  try {
    await db.createCollection(name)
    console.log(`[rag:upload] created collection ${name}`)
  } catch (err) {
    const message = err && (err.message || err.errMsg || String(err))
    if (!/exist|exists|already|DATABASE_COLLECTION_ALREADY_EXISTS|collection is already/i.test(message)) {
      console.warn(`[rag:upload] create collection ${name} skipped: ${message}`)
    }
  }
}

async function uploadChunk(collection, chunk) {
  const { _id, collection: _collection, ...data } = chunk
  if (!_id) throw new Error('chunk missing _id')
  await collection.doc(_id).set(data)
}

async function uploadDocumentRecord(collection, document) {
  const { _id, ...data } = document
  if (!_id) throw new Error('document missing _id')
  await collection.doc(_id).set(data)
}

async function uploadJsonl(db, moduleInfo, filePath) {
  const collection = db.collection(moduleInfo.collection)
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity })
  const inFlight = new Set()
  let successCount = 0
  let failureCount = 0
  let lineNo = 0

  async function schedule(chunk) {
    const task = uploadChunk(collection, chunk)
      .then(() => {
        successCount += 1
        if (successCount % 100 === 0) {
          console.log(`[rag:upload] ${moduleInfo.collection}: uploaded ${successCount}`)
        }
      })
      .catch((err) => {
        failureCount += 1
        console.error(`[rag:upload] ${moduleInfo.collection} failed at ${chunk._id}:`, err.message || err)
      })
      .finally(() => {
        inFlight.delete(task)
      })
    inFlight.add(task)
    if (inFlight.size >= UPLOAD_CONCURRENCY) {
      await Promise.race(inFlight)
    }
  }

  for await (const line of reader) {
    const trimmed = line.trim()
    if (!trimmed) continue
    lineNo += 1
    try {
      await schedule(JSON.parse(trimmed))
    } catch (err) {
      failureCount += 1
      console.error(`[rag:upload] parse failed ${filePath}:${lineNo}`, err.message || err)
    }
  }

  await Promise.all(inFlight)
  return { successCount, failureCount }
}

async function readJsonl(filePath) {
  const records = []
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of reader) {
    const trimmed = line.trim()
    if (trimmed) records.push(JSON.parse(trimmed))
  }
  return records
}

function shouldUploadChunks() {
  return UPLOAD_SCOPE === 'all' || UPLOAD_SCOPE === 'chunks'
}

function shouldUploadDocuments() {
  return UPLOAD_SCOPE === 'all' || UPLOAD_SCOPE === 'documents'
}

async function uploadOriginal(app, document) {
  const sourcePath = path.join(DATA_TRANS_ROOT, document.sourcePath)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`original markdown not found: ${sourcePath}`)
  }
  const result = await app.uploadFile({
    cloudPath: document.cloudPath,
    fileContent: fs.createReadStream(sourcePath),
  })
  return result && result.fileID || ''
}

async function uploadDocuments(app, db, moduleKeys) {
  const documentsPath = path.join(RAG_DIR, 'documents.jsonl')
  if (!fs.existsSync(documentsPath)) {
    console.warn(`[rag:upload] missing ${documentsPath}, skipped original documents`)
    return { successCount: 0, failureCount: 0 }
  }

  await ensureCollection(db, 'rag_documents')
  const collection = db.collection('rag_documents')
  const documents = (await readJsonl(documentsPath))
    .filter((item) => !moduleKeys.length || moduleKeys.includes(item.moduleKey))
  const inFlight = new Set()
  let successCount = 0
  let failureCount = 0

  async function schedule(document) {
    const task = uploadOriginal(app, document)
      .then((fileID) => uploadDocumentRecord(collection, {
        ...document,
        fileID,
        uploadedAt: Date.now(),
      }))
      .then(() => {
        successCount += 1
        if (successCount % 50 === 0) {
          console.log(`[rag:upload] originals: uploaded ${successCount}`)
        }
      })
      .catch((err) => {
        failureCount += 1
        console.error(`[rag:upload] original failed at ${document.sourcePath}:`, err.message || err)
      })
      .finally(() => {
        inFlight.delete(task)
      })
    inFlight.add(task)
    if (inFlight.size >= UPLOAD_CONCURRENCY) {
      await Promise.race(inFlight)
    }
  }

  console.log(`[rag:upload] uploading originals -> rag_documents (${documents.length})`)
  for (const document of documents) {
    await schedule(document)
  }
  await Promise.all(inFlight)
  console.log(`[rag:upload] originals done: uploaded ${successCount}, failed ${failureCount}`)
  return { successCount, failureCount }
}

async function writeBuildLog(db, moduleInfo, stats, startedAt) {
  try {
    await db.collection('ragBuildLogs').add({
      envId: ENV_ID,
      moduleKey: moduleInfo.moduleKey,
      moduleName: moduleInfo.moduleName,
      collection: moduleInfo.collection,
      source: 'source-assets/rag',
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      durationMs: Date.now() - startedAt,
      createdAt: Date.now(),
    })
  } catch (err) {
    console.warn('[rag:upload] write ragBuildLogs failed:', err.message || err)
  }
}

async function main() {
  const onlyModule = process.env.RAG_UPLOAD_ONLY_MODULE || ''
  const modules = onlyModule
    ? MODULE_FILES.filter((item) => item.moduleKey === onlyModule)
    : MODULE_FILES

  if (onlyModule && !modules.length) {
    throw new Error(`unknown RAG_UPLOAD_ONLY_MODULE: ${onlyModule}`)
  }

  if (!['all', 'chunks', 'documents'].includes(UPLOAD_SCOPE)) {
    throw new Error('RAG_UPLOAD_SCOPE must be one of: all, chunks, documents')
  }

  const app = initCloudApp()
  const db = app.database()
  await ensureCollection(db, 'ragBuildLogs')
  console.log(`[rag:upload] env: ${ENV_ID}`)
  console.log(`[rag:upload] concurrency: ${UPLOAD_CONCURRENCY}`)
  console.log(`[rag:upload] scope: ${UPLOAD_SCOPE}`)

  let hasFailure = false

  if (shouldUploadDocuments()) {
    const startedAt = Date.now()
    const stats = await uploadDocuments(app, db, modules.map((item) => item.moduleKey))
    await writeBuildLog(db, {
      moduleKey: 'documents',
      moduleName: '原文索引',
      collection: 'rag_documents',
    }, stats, startedAt)
    hasFailure = hasFailure || stats.failureCount > 0
  }

  if (shouldUploadChunks()) {
    for (const moduleInfo of modules) {
      const jsonlPath = path.join(RAG_DIR, `${moduleInfo.moduleKey}.jsonl`)
      if (!fs.existsSync(jsonlPath)) {
        console.warn(`[rag:upload] missing ${jsonlPath}, skipped`)
        continue
      }

      const startedAt = Date.now()
      await ensureCollection(db, moduleInfo.collection)
      console.log(`[rag:upload] uploading ${moduleInfo.moduleName} -> ${moduleInfo.collection}`)
      const stats = await uploadJsonl(db, moduleInfo, jsonlPath)
      await writeBuildLog(db, moduleInfo, stats, startedAt)
      console.log(`[rag:upload] ${moduleInfo.collection} done: uploaded ${stats.successCount}, failed ${stats.failureCount}`)
      hasFailure = hasFailure || stats.failureCount > 0
    }
  }

  if (hasFailure) process.exitCode = 1
}

main().catch((err) => {
  console.error('[rag:upload] failed:', err.message || err)
  process.exitCode = 1
})
