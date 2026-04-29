const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ENV_ID = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || 'cloud-accounting-d7e5ld7733202af'

function normalizeText(value) {
  return String(value || '').trim()
}

function uniqueReferences(matches) {
  const seen = {}
  return (matches || []).filter((item) => {
    const key = `${item.moduleKey || ''}|${item.sourcePath || ''}|${item.title || ''}`
    if (seen[key]) return false
    seen[key] = true
    return true
  }).map((item) => ({
    title: item.title || '',
    docId: item.docId || '',
    moduleName: item.moduleName || '',
    sourcePath: item.sourcePath || '',
    sectionTitle: item.sectionTitle || '',
    sourceExcerpt: item.sourceExcerpt || item.content || '',
    cloudPath: item.cloudPath || '',
    contentHash: item.contentHash || '',
  }))
}

const LOW_CONFIDENCE_SCORE = Number(process.env.RAG_LOW_CONFIDENCE_SCORE || 0.08)

function buildFallbackMessages(query) {
  const systemPrompt = `你是「智税工作台」的专业财税顾问助手。当前资料库未检索到与问题直接相关的依据，请基于通用财税知识给出参考建议。

回答要求：
1. 给出实用的参考建议或分析思路；
2. 不得编造政策编号、具体金额、期限或地区口径；
3. 明确说明本次回答为通用建议，非资料库确定依据；
4. 涉及重大税务处理时，提醒用户以主管税务机关口径为准；
5. 使用中文，结构清晰，控制在 600 字以内。`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query },
  ]
}

async function generateFallbackAnswer(query) {
  let tcb
  try {
    tcb = require('@cloudbase/node-sdk')
  } catch (err) {
    console.warn('[ragAnswer] @cloudbase/node-sdk unavailable for fallback:', err)
    return '当前资料库未检索到明确依据，建议补充具体税种、业务场景或政策文号后再查询，或咨询主管税务机关。'
  }

  const app = tcb.init({ env: ENV_ID })
  const ai = app.ai()
  const model = ai.createModel('deepseek')
  const result = await model.generateText({
    model: 'deepseek-v3.2',
    messages: buildFallbackMessages(query),
  })
  return normalizeText(result && result.text) || '当前资料库未检索到明确依据，建议补充具体信息后再查询。'
}

function buildMessages(query, answerContext, moduleName) {
  const systemPrompt = `你是「智税工作台」的专业财税资料助手。请优先基于提供的参考资料片段回答用户问题。

回答要求：
1. 先直接回答结论，再说明依据、操作建议和注意事项；
2. 必须基于“原文摘录”回答，并引用资料标题、模块、章节或来源文件；
3. 检索片段不足以支持结论时，明确说明“当前资料库未检索到明确依据”，不要编造政策编号、金额、期限或地区口径；
4. 涉及重大税务处理时，提醒用户结合企业资料并以主管税务机关口径为准；
5. 使用中文，结构清晰，控制在 800 字以内。`

  const userPrompt = `用户问题：
${query}

资料模块：
${moduleName || '未指定'}

可引用参考资料：
${answerContext || '当前资料库未检索到明确依据。'}`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

async function generateAnswer(query, answerContext, moduleName) {
  let tcb
  try {
    tcb = require('@cloudbase/node-sdk')
  } catch (err) {
    console.warn('[ragAnswer] @cloudbase/node-sdk unavailable, returning context summary:', err)
    return answerContext
      ? `已检索到以下相关参考资料，请结合原文进一步核验：\n\n${answerContext}`
      : '当前资料库未检索到明确依据，暂无法基于资料库给出确定结论。'
  }

  const app = tcb.init({ env: ENV_ID })
  const ai = app.ai()
  const model = ai.createModel('deepseek')
  const result = await model.generateText({
    model: 'deepseek-v3.2',
    messages: buildMessages(query, answerContext, moduleName),
  })
  return normalizeText(result && result.text) || '已检索到相关参考资料，但模型暂未生成完整解读。请参考下方资料来源进一步核验。'
}

function appendReferences(answer, references) {
  if (!references.length) return answer
  const sourceText = references
    .map((item, index) => {
      const source = item.sourcePath || item.title
      const section = item.sectionTitle ? `，章节：${item.sectionTitle}` : ''
      const moduleName = item.moduleName ? `，模块：${item.moduleName}` : ''
      const excerpt = item.sourceExcerpt ? `\n   原文摘录：${item.sourceExcerpt.slice(0, 120)}` : ''
      return `${index + 1}. ${source}${moduleName}${section}${excerpt}`
    })
    .join('\n')
  if (answer.includes('参考资料')) return answer
  return `${answer}\n\n## 参考资料\n${sourceText}`
}

exports.main = async (event) => {
  const query = normalizeText(event && event.query)
  const topK = Number(event && event.topK) || 5

  if (!query) {
    return { success: false, error: 'query is required', answer: '', references: [] }
  }

  try {
    const retrieval = await cloud.callFunction({
      name: 'ragRetrieval',
      data: {
        query,
        topK,
        moduleKey: event && event.moduleKey,
        toolId: event && event.toolId,
      },
    })
    const result = retrieval && retrieval.result
    const matches = result && result.success ? result.matches || [] : []
    const answerContext = result && result.success ? result.answerContext || '' : ''
    const moduleName = result && result.moduleName || ''
    const maxScore = result && result.success ? result.maxScore || 0 : 0
    const references = uniqueReferences(matches)

    const isLowConfidence = !matches.length || maxScore < LOW_CONFIDENCE_SCORE

    if (isLowConfidence) {
      const fallbackAnswer = await generateFallbackAnswer(query)
      return {
        success: true,
        answer: fallbackAnswer,
        references: [],
        matches: [],
        moduleName,
        answerMode: 'fallback',
        fallbackReason: !matches.length ? 'no_matches' : 'low_confidence',
        maxScore,
      }
    }

    const answer = await generateAnswer(query, answerContext, moduleName)
    return {
      success: true,
      answer: appendReferences(answer, references),
      references,
      matches,
      moduleName,
      answerMode: 'rag',
      maxScore,
    }
  } catch (err) {
    console.error('[ragAnswer] failed:', err)
    return {
      success: false,
      error: err.message || 'rag answer failed',
      answer: '抱歉，资料问答服务暂时不可用，请稍后重试。',
      references: [],
      matches: [],
    }
  }
}
