#!/usr/bin/env node

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { once } = require('events')

const DATA_TRANS_ROOT = path.resolve(__dirname, '../../data/data_trans')
const RAG_DIR = path.resolve(process.env.RAG_OUTPUT_DIR || path.resolve(__dirname, '../source-assets/rag'))

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

function titleFromFile(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/__/g, ' / ').trim()
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

function buildDocumentRecord(filePath) {
  const relativePath = path.relative(DATA_TRANS_ROOT, filePath)
  const moduleInfo = getModuleInfo(relativePath)
  const markdown = fs.readFileSync(filePath, 'utf8')
  const docId = stableHash(relativePath)
  const sourcePath = relativePath.split(path.sep).join('/')
  const fileName = path.basename(filePath)

  return {
    _id: `rag_document_${docId}`,
    docId,
    moduleKey: moduleInfo.moduleKey,
    moduleName: moduleInfo.moduleName,
    collection: moduleInfo.collection,
    sourcePath,
    fileName,
    title: titleFromFile(filePath),
    contentHash: contentHash(markdown),
    charLength: markdown.length,
    cloudPath: `rag/originals/${moduleInfo.moduleKey}/${docId}.md`,
    source: 'data_trans',
    updatedAt: Date.now(),
  }
}

function buildDocumentMap() {
  const documents = walkMarkdownFiles(DATA_TRANS_ROOT).map(buildDocumentRecord)
  const bySourcePath = new Map()
  documents.forEach((document) => {
    bySourcePath.set(document.sourcePath, document)
  })
  return { documents, bySourcePath }
}

async function writeLine(stream, line) {
  if (!stream.write(line)) {
    await once(stream, 'drain')
  }
}

async function finishStream(stream) {
  stream.end()
  await once(stream, 'finish')
}

async function writeDocumentsIndex(documents) {
  const outputPath = path.join(RAG_DIR, 'documents.jsonl')
  const tmpPath = `${outputPath}.tmp-${process.pid}`
  const stream = fs.createWriteStream(tmpPath, { encoding: 'utf8' })
  for (const document of documents) {
    await writeLine(stream, `${JSON.stringify(document)}\n`)
  }
  await finishStream(stream)
  fs.renameSync(tmpPath, outputPath)
  console.log(`[rag:patch-doc-map] wrote ${documents.length} documents to ${outputPath}`)
}

function listModuleJsonlFiles() {
  const onlyModule = process.env.RAG_PATCH_ONLY_MODULE || ''
  return fs.readdirSync(RAG_DIR)
    .filter((fileName) => fileName.endsWith('.jsonl') && fileName !== 'documents.jsonl')
    .filter((fileName) => !onlyModule || fileName === `${onlyModule}.jsonl`)
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => path.join(RAG_DIR, fileName))
}

function patchChunk(chunk, document) {
  return {
    ...chunk,
    sourceExcerpt: chunk.content || '',
    cloudPath: document.cloudPath,
    contentHash: document.contentHash,
    originalCharLength: document.charLength,
  }
}

async function patchModuleFile(jsonlPath, documentMap) {
  const jsonPath = jsonlPath.replace(/\.jsonl$/, '.json')
  const tmpJsonlPath = `${jsonlPath}.tmp-${process.pid}`
  const tmpJsonPath = `${jsonPath}.tmp-${process.pid}`
  const reader = readline.createInterface({
    input: fs.createReadStream(jsonlPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  const jsonlWriter = fs.createWriteStream(tmpJsonlPath, { encoding: 'utf8' })
  const jsonWriter = fs.createWriteStream(tmpJsonPath, { encoding: 'utf8' })
  let count = 0
  let firstJsonItem = true

  await writeLine(jsonWriter, '[\n')
  for await (const line of reader) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const chunk = JSON.parse(trimmed)
    const document = documentMap.get(chunk.sourcePath)
    if (!document) {
      throw new Error(`sourcePath not found in data_trans: ${chunk.sourcePath}`)
    }

    const patched = patchChunk(chunk, document)
    const compact = JSON.stringify(patched)
    await writeLine(jsonlWriter, `${compact}\n`)
    await writeLine(jsonWriter, `${firstJsonItem ? '' : ',\n'}${JSON.stringify(patched, null, 2)}`)
    firstJsonItem = false
    count += 1
  }
  await writeLine(jsonWriter, '\n]\n')
  await Promise.all([finishStream(jsonlWriter), finishStream(jsonWriter)])

  fs.renameSync(tmpJsonlPath, jsonlPath)
  fs.renameSync(tmpJsonPath, jsonPath)
  console.log(`[rag:patch-doc-map] patched ${path.basename(jsonlPath)} -> ${count} chunks`)
  return count
}

async function main() {
  if (!fs.existsSync(DATA_TRANS_ROOT)) {
    throw new Error(`data_trans root not found: ${DATA_TRANS_ROOT}`)
  }
  if (!fs.existsSync(RAG_DIR)) {
    throw new Error(`rag output dir not found: ${RAG_DIR}`)
  }

  const { documents, bySourcePath } = buildDocumentMap()
  await writeDocumentsIndex(documents)

  const files = listModuleJsonlFiles()
  let total = 0
  for (const filePath of files) {
    total += await patchModuleFile(filePath, bySourcePath)
  }
  console.log(`[rag:patch-doc-map] done, patched ${total} chunks in ${files.length} module files`)
}

main().catch((err) => {
  console.error('[rag:patch-doc-map] failed:', err.message || err)
  process.exitCode = 1
})
