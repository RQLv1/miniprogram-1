// utils/cloudDB.ts

import type { ChatMessage } from './constants'

export interface SessionDoc {
  _id?: string
  openid: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ExpertSessionDoc {
  _id?: string
  openid: string
  expertId: string
  expertName: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ReportDoc {
  _id?: string
  openid: string
  type: string
  title: string
  content: string
  createdAt: number
  questionText?: string
  pdfUrl?: string
  pdfVersion?: number
}

export interface LinkedCompanyDoc {
  _id?: string
  openid: string
  contactName: string
  companyKeyword: string
  identity: string
  identityLabel: string
  isPrimary: boolean
  createdAt: number
  updatedAt: number
}

export type LinkedCompanyInput = Pick<
  LinkedCompanyDoc,
  'contactName' | 'companyKeyword' | 'identity' | 'identityLabel' | 'isPrimary'
>

export interface RagPolicyMatch {
  policyId?: string
  moduleKey?: string
  moduleName?: string
  collection?: string
  sourcePath?: string
  fileName?: string
  docId?: string
  chunkId: string
  title: string
  docNo?: string
  date?: string
  category?: string
  sectionTitle?: string
  headingPath?: string[]
  content: string
  sourceExcerpt?: string
  cloudPath?: string
  contentHash?: string
  originalCharLength?: number
  score: number
}

export interface RagReference {
  title: string
  docId?: string
  docNo?: string
  date?: string
  category?: string
  moduleName?: string
  sourcePath?: string
  sectionTitle?: string
  sourceExcerpt?: string
  cloudPath?: string
  contentHash?: string
}

export interface RagRetrievalResult {
  success: boolean
  query: string
  moduleKey?: string
  moduleName?: string
  collection?: string
  answerContext: string
  matches: RagPolicyMatch[]
  maxScore?: number
  error?: string
}

export interface RagAnswerResult {
  success: boolean
  answer: string
  references: RagReference[]
  matches: RagPolicyMatch[]
  moduleName?: string
  answerMode?: 'rag' | 'fallback'
  fallbackReason?: 'no_matches' | 'low_confidence'
  maxScore?: number
  error?: string
}

export interface RagOriginalResult {
  success: boolean
  document?: {
    docId: string
    moduleKey: string
    moduleName: string
    sourcePath: string
    fileName: string
    title: string
    contentHash: string
    charLength: number
    cloudPath: string
    fileID?: string
  }
  tempFileURL?: string
  content?: string
  contentTruncated?: boolean
  error?: string
}

function unwrapCloudFunctionResult<T>(res: { result?: unknown }): T {
  return res.result as T
}

export function searchPolicyChunks(
  query: string,
  options: { topK?: number; category?: string; moduleKey?: string; toolId?: string } = {},
): Promise<RagRetrievalResult> {
  return wx.cloud
    .callFunction({
      name: 'ragRetrieval',
      data: {
        query,
        topK: options.topK || 5,
        category: options.category || '',
        moduleKey: options.moduleKey || '',
        toolId: options.toolId || '',
      },
    })
    .then((res) => unwrapCloudFunctionResult<RagRetrievalResult>(res))
}

export function getRagAnswer(
  query: string,
  options: { topK?: number; category?: string; moduleKey?: string; toolId?: string } = {},
): Promise<RagAnswerResult> {
  return wx.cloud
    .callFunction({
      name: 'ragAnswer',
      data: {
        query,
        topK: options.topK || 5,
        category: options.category || '',
        moduleKey: options.moduleKey || '',
        toolId: options.toolId || '',
      },
    })
    .then((res) => unwrapCloudFunctionResult<RagAnswerResult>(res))
}

export function getRagOriginal(options: { docId?: string; sourcePath?: string; includeContent?: boolean }): Promise<RagOriginalResult> {
  return wx.cloud
    .callFunction({
      name: 'ragOriginal',
      data: {
        docId: options.docId || '',
        sourcePath: options.sourcePath || '',
        includeContent: options.includeContent === true,
      },
    })
    .then((res) => unwrapCloudFunctionResult<RagOriginalResult>(res))
}

export function saveSession(
  openid: string,
  title: string,
  messages: ChatMessage[],
): Promise<string> {
  const db = wx.cloud.database()
  const now = Date.now()
  return db
    .collection('sessions')
    .add({
      data: {
        openid,
        title,
        messages,
        createdAt: now,
        updatedAt: now,
      },
    })
    .then((res) => String(res._id))
}

export function getSessions(openid: string): Promise<SessionDoc[]> {
  const db = wx.cloud.database()
  return db
    .collection('sessions')
    .where({ openid })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()
    .then((res) => res.data as SessionDoc[])
}

export function createExpertSession(
  openid: string,
  payload: Pick<ExpertSessionDoc, 'expertId' | 'expertName' | 'title' | 'messages'>,
): Promise<string> {
  const db = wx.cloud.database()
  const now = Date.now()
  return db
    .collection('expertSessions')
    .add({
      data: {
        openid,
        expertId: payload.expertId,
        expertName: payload.expertName,
        title: payload.title,
        messages: payload.messages,
        createdAt: now,
        updatedAt: now,
      },
    })
    .then((res) => String(res._id))
}

export function updateExpertSession(
  id: string,
  messages: ChatMessage[],
  title: string,
): Promise<void> {
  const db = wx.cloud.database()
  return db
    .collection('expertSessions')
    .doc(id)
    .update({
      data: {
        title,
        messages,
        updatedAt: Date.now(),
      },
    })
    .then(() => {})
}

export function getExpertSessions(openid: string): Promise<ExpertSessionDoc[]> {
  const db = wx.cloud.database()
  return db
    .collection('expertSessions')
    .where({ openid })
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get()
    .then((res) => res.data as ExpertSessionDoc[])
}

export function saveReport(
  openid: string,
  type: string,
  content: string,
  title = '',
  extra: Partial<Pick<ReportDoc, 'questionText' | 'pdfUrl' | 'pdfVersion'>> = {},
): Promise<string> {
  const db = wx.cloud.database()
  return db
    .collection('reports')
    .add({
      data: {
        openid,
        type,
        title,
        content,
        createdAt: Date.now(),
        ...extra,
      },
    })
    .then((res) => String(res._id))
}

export function getReports(openid: string): Promise<ReportDoc[]> {
  const db = wx.cloud.database()
  return db
    .collection('reports')
    .where({ openid })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()
    .then((res) => res.data as ReportDoc[])
}

export function getReportById(id: string): Promise<ReportDoc> {
  const db = wx.cloud.database()
  return db
    .collection('reports')
    .doc(id)
    .get()
    .then((res) => res.data as ReportDoc)
}

export function updateReportPdfUrl(id: string, pdfUrl: string, pdfVersion: number): Promise<void> {
  const db = wx.cloud.database()
  return db
    .collection('reports')
    .doc(id)
    .update({
      data: {
        pdfUrl,
        pdfVersion,
      },
    })
    .then(() => {})
}

export function getLinkedCompanies(openid: string): Promise<LinkedCompanyDoc[]> {
  const db = wx.cloud.database()
  return db
    .collection('linkedCompanies')
    .where({ openid })
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get()
    .then((res) => res.data as LinkedCompanyDoc[])
}

export async function deleteLinkedCompany(openid: string, companyId: string): Promise<void> {
  const db = wx.cloud.database()
  const linkedCompanies = db.collection('linkedCompanies')
  const target = await linkedCompanies.doc(companyId).get()
  const targetCompany = target.data as LinkedCompanyDoc

  if (!targetCompany || targetCompany.openid !== openid) {
    throw new Error('linked company not found')
  }

  await linkedCompanies.doc(companyId).remove()

  if (!targetCompany.isPrimary) return

  const remaining = await linkedCompanies
    .where({ openid })
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get()
  const nextPrimary = (remaining.data as LinkedCompanyDoc[])[0]
  if (!nextPrimary || !nextPrimary._id) return

  await linkedCompanies.doc(nextPrimary._id).update({
    data: {
      isPrimary: true,
      updatedAt: Date.now(),
    },
  })
}

export async function addLinkedCompany(openid: string, payload: LinkedCompanyInput): Promise<string> {
  const db = wx.cloud.database()
  const linkedCompanies = db.collection('linkedCompanies')
  const now = Date.now()

  if (payload.isPrimary) {
    const currentPrimary = await linkedCompanies
      .where({ openid, isPrimary: true })
      .get()
    await Promise.all(
      (currentPrimary.data as LinkedCompanyDoc[]).map((item) => {
        if (!item._id) return Promise.resolve()
        return linkedCompanies
          .doc(item._id)
          .update({
            data: {
              isPrimary: false,
              updatedAt: now,
            },
          })
      }),
    )
  }

  return linkedCompanies
    .add({
      data: {
        openid,
        contactName: payload.contactName,
        companyKeyword: payload.companyKeyword,
        identity: payload.identity,
        identityLabel: payload.identityLabel,
        isPrimary: payload.isPrimary,
        createdAt: now,
        updatedAt: now,
      },
    })
    .then((res) => String(res._id))
}
