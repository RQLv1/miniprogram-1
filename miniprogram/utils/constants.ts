// utils/constants.ts

export interface ExpertInfo {
  id: string
  name: string
  title: string
  experience: string
  badge: string
  avatar: string
  avatarUrl: string
  qualifications: string
  specialties: string[]
  specialtySummary: string
  intro: string
  greeting: string
  rating: number
  consultCount: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  loading?: boolean
  modelContent?: string
}

export interface PendingChatTask {
  toolId: string
  displayText: string
  promptText: string
  systemPrompt: string
  reportTitle: string
  questionText: string
}

export const REPORT_TOOL_IDS = [
  'tax-detection',
  'risk-detection',
  'tax-saving',
  'business-model',
  'data-analysis',
  'equity-design',
  'dual-accounts',
  'audit-response',
] as const

export function isReportToolId(value: string): boolean {
  return (REPORT_TOOL_IDS as readonly string[]).includes(value)
}

export interface UserInfo {
  openid: string
  phone?: string
  memberLevel: MembershipLevel
  nickname?: string
  avatarUrl?: string
}

export type MembershipLevel = 'free' | 'vip' | 'svip'

export interface MembershipFeature {
  name: string
  free: boolean | string
  vip: boolean | string
  svip: boolean | string
}

export interface ToolFieldOption {
  label: string
  value: string
  active?: boolean
}

export interface ToolField {
  id: string
  label: string
  type: 'select' | 'number' | 'textarea' | 'tag-multi' | 'check-multi'
  placeholder?: string
  unit?: string
  required?: boolean
  options?: ToolFieldOption[]
  value?: string
}

export interface ToolStep {
  title: string
  desc: string
}

export interface ToolSection {
  id: string
  title: string
  tag?: '必填' | '选填'
  note?: string
  type?: 'fields' | 'steps'
  fields?: ToolField[]
  steps?: ToolStep[]
}

export interface ToolPolicy {
  id: string
  title: string
  docNo: string
  date: string
  category: string
  tags: string[]
  summary: string
}

export interface ToolItem {
  id: string
  name: string
  navTitle: string
  description: string
  shortLabel: string
  icon: string
  accent: string
  accentSoft: string
  hint: string
  placeholder?: string
  submitText?: string
  systemPrompt?: string
  promptPrefix?: string
  reportTitle: string
  sections?: ToolSection[]
  hotTags?: string[]
  mode?: 'form' | 'policy'
  pagePath: string
}

export const MEMBERSHIP_FEATURES: MembershipFeature[] = [
  { name: 'AI问答次数', free: '5次/天', vip: '无限次', svip: '无限次' },
  { name: '工具库使用', free: '基础工具', vip: '全部工具', svip: '全部工具' },
  { name: '报告保存', free: '3份', vip: '无限份', svip: '无限份' },
  { name: '专家咨询', free: false, vip: '3次/月', svip: '无限次' },
  { name: 'PDF下载', free: false, vip: true, svip: true },
  { name: '优先客服', free: false, vip: false, svip: true },
  { name: '专属顾问', free: false, vip: false, svip: true },
]

export const TOOL_ITEMS: ToolItem[] = [
  {
    id: 'tax-detection',
    name: '税负检测',
    navTitle: '税负检测',
    description: '智能分析企业税负合理性',
    shortLabel: '税',
    icon: '/assets/icons/tax-detection.svg',
    accent: '#1f4b99',
    accentSoft: '#e8edf7',
    hint: '请填写您的企业财务数据，系统将数据分析您的实际税负水平并与同行业进行对比。',
    placeholder: '请输入企业财务数据',
    submitText: '提交检测',
    reportTitle: '税负检测分析报告',
    pagePath: '/pages/tool-chat/tool-chat?toolId=tax-detection',
    sections: [
      {
        id: 'finance',
        title: '基本财务数据',
        tag: '必填',
        fields: [
          {
            id: 'industry',
            label: '所属行业',
            type: 'select',
            required: true,
            options: [
              '制造业',
              '批发和零售业',
              '建筑业',
              '信息技术服务业',
              '房地产业',
              '住宿和餐饮业',
              '交通运输业',
              '金融业',
              '教育',
              '其他',
            ].map((value) => ({ label: value, value })),
          },
          { id: 'annual_revenue', label: '年收入（营业收入）', type: 'number', required: true, unit: '万元', placeholder: '请输入年营业收入' },
          { id: 'cost', label: '成本费用', type: 'number', required: true, unit: '万元', placeholder: '请输入年成本费用总额' },
          { id: 'profit', label: '利润总额', type: 'number', required: true, unit: '万元', placeholder: '请输入年利润总额' },
        ],
      },
      {
        id: 'paid_tax',
        title: '已缴税额',
        tag: '选填',
        note: '未填写的税种将以同行业平均税率进行估算，填写后可获得更精准的分析结果。',
        fields: [
          { id: 'vat', label: '增值税', type: 'number', unit: '万元', placeholder: '请输入已缴增值税额' },
          { id: 'corp_tax', label: '企业所得税', type: 'number', unit: '万元', placeholder: '请输入已缴企业所得税额' },
          { id: 'personal_tax', label: '个人所得税', type: 'number', unit: '万元', placeholder: '请输入已缴个人所得税额' },
        ],
      },
    ],
  },
  {
    id: 'risk-detection',
    name: '风险检测',
    navTitle: '风险检测',
    description: '识别财税潜在风险点',
    shortLabel: '险',
    icon: '/assets/icons/risk-detection.svg',
    accent: '#c0392b',
    accentSoft: '#fbe7e5',
    hint: '请选择以下风险指标，系统将综合评估您的企业税务风险等级并给出整改建议。',
    submitText: '提交检测',
    reportTitle: '风险检测分析报告',
    pagePath: '/pages/tool-chat/tool-chat?toolId=risk-detection',
    sections: [
      {
        id: 'risk_metrics',
        title: '风险指标',
        tag: '必填',
        fields: [
          {
            id: 'industry',
            label: '所属行业',
            type: 'select',
            required: true,
            options: [
              '制造业',
              '批发和零售业',
              '建筑业',
              '信息技术服务业',
              '房地产业',
              '住宿和餐饮业',
              '交通运输业',
              '金融业',
              '教育',
              '其他',
            ].map((value) => ({ label: value, value })),
          },
          {
            id: 'revenue_range',
            label: '年营收区间',
            type: 'select',
            required: true,
            options: ['100万以下', '100~500万', '500~1000万', '1000~5000万', '5000万以上'].map((value) => ({ label: value, value })),
          },
          {
            id: 'private_ratio',
            label: '私户收款比例',
            type: 'select',
            required: true,
            options: ['无', '10%以下', '10%~30%', '30%~50%', '50%以上'].map((value) => ({ label: value, value })),
          },
          {
            id: 'no_receipt_ratio',
            label: '无票支出比例',
            type: 'select',
            required: true,
            options: ['无', '5%以下', '5%~15%', '15%~30%', '30%以上'].map((value) => ({ label: value, value })),
          },
          {
            id: 'inventory',
            label: '库存/往来是否异常',
            type: 'select',
            required: true,
            options: ['正常', '略有异常', '明显异常'].map((value) => ({ label: value, value })),
          },
          {
            id: 'social_match',
            label: '社保人数与收入匹配度',
            type: 'select',
            required: true,
            options: ['匹配', '略有偏差', '严重不匹配'].map((value) => ({ label: value, value })),
          },
          { id: 'undistributed_profit', label: '未分配利润', type: 'number', unit: '万元', placeholder: '请输入未分配利润金额' },
        ],
      },
    ],
  },
  {
    id: 'tax-saving',
    name: '节税方案',
    navTitle: '节税方案',
    description: 'AI生成个性化节税方案',
    shortLabel: '策',
    icon: '/assets/icons/tax-saving.svg',
    accent: '#b7791f',
    accentSoft: '#fff3dc',
    hint: '请完整填写企业经营及税务数据，系统将定制方案节税方案。',
    submitText: '生成节税方案',
    reportTitle: '节税方案分析报告',
    pagePath: '/pages/tool-chat/tool-chat?toolId=tax-saving',
    sections: [
      {
        id: 'company_basic',
        title: '企业基本信息',
        tag: '必填',
        fields: [
          {
            id: 'industry',
            label: '所属行业',
            type: 'select',
            required: true,
            options: [
              '制造业',
              '批发和零售业',
              '建筑业',
              '信息技术服务业',
              '房地产业',
              '住宿和餐饮业',
              '交通运输业',
              '金融业',
              '教育',
              '其他',
            ].map((value) => ({ label: value, value })),
          },
          {
            id: 'revenue_range',
            label: '年营收区间',
            type: 'select',
            required: true,
            options: ['100万以下', '100~500万', '500~1000万', '1000~5000万', '5000万以上'].map((value) => ({ label: value, value })),
          },
        ],
      },
      {
        id: 'finance',
        title: '财务数据',
        tag: '必填',
        note: '以下已缴税额未填写将以同行业平均税率进行估算，填写后可获得更精准的方案。',
        fields: [
          { id: 'annual_revenue', label: '年收入（营业收入）', type: 'number', required: true, unit: '万元', placeholder: '请输入年营业收入' },
          { id: 'cost', label: '成本费用', type: 'number', required: true, unit: '万元', placeholder: '请输入年成本费用总额' },
          { id: 'profit', label: '利润总额', type: 'number', required: true, unit: '万元', placeholder: '请输入年利润总额' },
          { id: 'vat', label: '增值税', type: 'number', unit: '万元', placeholder: '请输入已缴增值税额' },
          { id: 'corp_tax', label: '企业所得税', type: 'number', unit: '万元', placeholder: '请输入已缴企业所得税额' },
          { id: 'personal_tax', label: '个人所得税', type: 'number', unit: '万元', placeholder: '请输入已缴个人所得税额' },
        ],
      },
      {
        id: 'risk',
        title: '经营风险指标',
        tag: '必填',
        fields: [
          {
            id: 'private_ratio',
            label: '私户收款比例',
            type: 'select',
            required: true,
            options: ['无', '10%以下', '10%~30%', '30%~50%', '50%以上'].map((value) => ({ label: value, value })),
          },
          {
            id: 'no_invoice_ratio',
            label: '无票支出比例',
            type: 'select',
            required: true,
            options: ['无', '5%以下', '5%~15%', '15%~30%', '30%以上'].map((value) => ({ label: value, value })),
          },
          {
            id: 'inventory',
            label: '库存/往来是否异常',
            type: 'select',
            required: true,
            options: ['正常', '略有异常', '明显异常'].map((value) => ({ label: value, value })),
          },
          {
            id: 'social_match',
            label: '社保人数与收入匹配度',
            type: 'select',
            required: true,
            options: ['匹配', '略有偏差', '严重不匹配'].map((value) => ({ label: value, value })),
          },
        ],
      },
      {
        id: 'requirement',
        title: '需求描述',
        tag: '必填',
        fields: [
          {
            id: 'requirement',
            label: '您的需求与困惑',
            type: 'textarea',
            required: true,
            placeholder: '请描述您想要达到的目的，例如：希望降低增值税税负、优化股东分红方案、业务拆分节税等，尽量细化',
          },
        ],
      },
    ],
  },
  {
    id: 'policy-search',
    name: '政策查询',
    navTitle: '政策查询库',
    description: '最新税收政策智能检索',
    shortLabel: '政',
    icon: '/assets/icons/policy-search.svg',
    accent: '#1f4b99',
    accentSoft: '#eef3fb',
    hint: '支持搜索增值税、企业所得税、个税、优惠政策等相关法规文件。',
    reportTitle: '政策查询结果',
    pagePath: '/pages/tool-chat/tool-chat?toolId=policy-search',
    mode: 'policy',
    hotTags: ['小规模纳税人', '增值税优惠', '研发费用加计扣除', '小微企业', '个税专项扣除', '留抵退税'],
  },
  {
    id: 'business-model',
    name: '商业模式融资',
    navTitle: '商业模式融资',
    description: '商业模式分析与融资建议',
    shortLabel: '融',
    icon: '/assets/icons/business-model.svg',
    accent: '#5b6ac4',
    accentSoft: '#eef0ff',
    hint: '请输入企业和融资需求，AI 将给出商业模式诊断和融资方案。',
    submitText: '生成融资方案',
    reportTitle: '商业模式融资分析报告',
    pagePath: '/pages/tool-chat/tool-chat?toolId=business-model',
    sections: [
      {
        id: 'company',
        title: '企业基本信息',
        tag: '必填',
        fields: [
          {
            id: 'industry',
            label: '所属行业',
            type: 'select',
            required: true,
            options: ['科技/互联网', '制造业', '服务业', '贸易/零售', '建筑/房地产', '咨询/培训', '其他'].map((value) => ({ label: value, value })),
          },
          {
            id: 'stage',
            label: '企业发展阶段',
            type: 'select',
            required: true,
            options: ['初创期（0~1年）', '成长期（1~3年）', '扩张期（3~5年）', '成熟期（5年以上）'].map((value) => ({ label: value, value })),
          },
          { id: 'revenue', label: '年营收规模', type: 'number', unit: '万元', placeholder: '请输入年营业收入' },
          { id: 'employee_count', label: '现有员工人数', type: 'number', unit: '人', placeholder: '请输入员工人数' },
        ],
      },
      {
        id: 'funding',
        title: '融资需求',
        tag: '必填',
        fields: [
          {
            id: 'funding_type',
            label: '融资类型',
            type: 'select',
            required: true,
            options: ['股权融资', '债权融资', '政府补贴/扶持资金', '供应链融资', '其他'].map((value) => ({ label: value, value })),
          },
          { id: 'funding_amount', label: '期望融资金额', type: 'number', unit: '万元', placeholder: '请输入期望融资金额' },
          { id: 'funding_usage', label: '融资用途描述', type: 'textarea', placeholder: '请简要描述融资用途，如扩产、研发、市场推广等' },
        ],
      },
    ],
  },
  {
    id: 'data-analysis',
    name: '管理数据分析',
    navTitle: '管理数据分析',
    description: '财务数据智能分析报告',
    shortLabel: '数',
    icon: '/assets/icons/data-analysis.svg',
    accent: '#2478a8',
    accentSoft: '#e9f3fb',
    hint: '请填写企业财务数据，系统将从多维度为您生成经营管理分析报告。',
    submitText: '生成分析报告',
    reportTitle: '管理数据分析报告',
    pagePath: '/pages/tool-chat/tool-chat?toolId=data-analysis',
    sections: [
      {
        id: 'finance',
        title: '财务数据',
        tag: '必填',
        fields: [
          {
            id: 'period',
            label: '分析周期',
            type: 'select',
            required: true,
            options: ['最近一个月', '最近一个季度', '最近半年', '最近一年', '自定义'].map((value) => ({ label: value, value })),
          },
          { id: 'revenue', label: '营业收入', type: 'number', unit: '万元', placeholder: '请输入营业收入' },
          { id: 'cost', label: '营业成本', type: 'number', unit: '万元', placeholder: '请输入营业成本' },
          { id: 'profit', label: '净利润', type: 'number', unit: '万元', placeholder: '请输入净利润' },
          { id: 'receivable', label: '应收账款余额', type: 'number', unit: '万元', placeholder: '请输入应收账款余额' },
          { id: 'payable', label: '应付账款余额', type: 'number', unit: '万元', placeholder: '请输入应付账款余额' },
        ],
      },
      {
        id: 'dimensions',
        title: '分析维度',
        tag: '选填',
        fields: [
          {
            id: 'analysis_dimensions',
            label: '分析维度',
            type: 'tag-multi',
            options: ['盈利能力', '偿债能力', '营运能力', '成长能力', '现金流分析', '成本结构', '杜邦分析'].map((label, index) => ({
              label,
              value: label,
              active: index < 2,
            })),
          },
        ],
      },
    ],
  },
  {
    id: 'equity-design',
    name: '合伙股权设计',
    navTitle: '合伙股权设计',
    description: '股权架构设计与优化',
    shortLabel: '股',
    icon: '/assets/icons/equity-design.svg',
    accent: '#1f8f5f',
    accentSoft: '#e8f6ee',
    hint: '请输入合伙人信息，AI 将设计合理的股权架构方案。',
    submitText: '生成股权方案',
    reportTitle: '合伙股权设计方案',
    pagePath: '/pages/tool-chat/tool-chat?toolId=equity-design',
    sections: [
      {
        id: 'company',
        title: '公司信息',
        tag: '必填',
        fields: [
          {
            id: 'company_type',
            label: '公司类型',
            type: 'select',
            required: true,
            options: ['有限责任公司', '股份有限公司', '有限合伙企业', '其他'].map((value) => ({ label: value, value })),
          },
          { id: 'company_stage', label: '公司阶段', type: 'select', options: ['初创期', '成长期', '成熟期', '融资前后'].map((value) => ({ label: value, value })) },
          {
            id: 'industry',
            label: '所属行业',
            type: 'select',
            required: true,
            options: ['科技/互联网', '制造业', '服务业', '贸易/零售', '建筑/房地产', '咨询/培训', '其他'].map((value) => ({ label: value, value })),
          },
        ],
      },
      {
        id: 'partners',
        title: '合伙人信息',
        tag: '必填',
        fields: [
          {
            id: 'partner_count',
            label: '合伙人数量',
            type: 'select',
            required: true,
            options: ['2人', '3人', '4~5人', '6~10人', '10人以上'].map((value) => ({ label: value, value })),
          },
          {
            id: 'investment_style',
            label: '出资方式',
            type: 'select',
            required: true,
            options: ['全部货币出资', '货币+技术出资', '货币+资源出资', '混合出资'].map((value) => ({ label: value, value })),
          },
          {
            id: 'option_pool',
            label: '是否设置期权池',
            type: 'select',
            options: ['是，预留10%', '是，预留15%', '是，预留20%', '暂不设置'].map((value) => ({ label: value, value })),
          },
          {
            id: 'partner_note',
            label: '补充说明',
            type: 'textarea',
            placeholder: '如：核心创始人投入技术、某合伙人仅出资不参与经营等',
          },
        ],
      },
    ],
  },
  {
    id: 'dual-accounts',
    name: '两帐合一实操',
    navTitle: '两帐合一实操',
    description: '内外账合规整合方案',
    shortLabel: '帐',
    icon: '/assets/icons/dual-accounts.svg',
    accent: '#0f8f7e',
    accentSoft: '#e6f7f4',
    hint: '请描述账务情况，AI 将制定安全可操作的两帐合一方案。',
    submitText: '生成合并方案',
    reportTitle: '两帐合一实操方案',
    pagePath: '/pages/tool-chat/tool-chat?toolId=dual-accounts',
    sections: [
      {
        id: 'steps',
        title: '实操流程',
        type: 'steps',
        steps: [
          { title: '现状摸底', desc: '明确内外账差异来源与主要风险点' },
          { title: '风险评估', desc: '评估补税、罚款和合规整改压力' },
          { title: '合并方案', desc: '制定分步合并计划，最小化税务成本' },
          { title: '落地执行', desc: '调账模板、申报指引、注意事项' },
        ],
      },
      {
        id: 'company',
        title: '企业情况',
        tag: '必填',
        fields: [
          {
            id: 'taxpayer_type',
            label: '企业类型',
            type: 'select',
            required: true,
            options: ['小规模纳税人', '一般纳税人'].map((value) => ({ label: value, value })),
          },
          {
            id: 'industry',
            label: '所属行业',
            type: 'select',
            required: true,
            options: ['制造业', '批发和零售业', '建筑业', '服务业', '餐饮业', '其他'].map((value) => ({ label: value, value })),
          },
          {
            id: 'gap_level',
            label: '内外账差异程度',
            type: 'select',
            required: true,
            options: [
              '差异较小（收入差异10%以内）',
              '差异中等（收入差异10%~30%）',
              '差异较大（收入差异30%以上）',
            ].map((value) => ({ label: value, value })),
          },
          {
            id: 'gap_desc',
            label: '主要差异描述',
            type: 'textarea',
            required: true,
            placeholder: '如：部分收入未入外账、存在无票支出、库存差异等',
          },
        ],
      },
    ],
  },
  {
    id: 'audit-response',
    name: '稽查应对实操',
    navTitle: '稽查应对实操',
    description: '税务稽查应对策略指导',
    shortLabel: '查',
    icon: '/assets/icons/audit-response.svg',
    accent: '#c0392b',
    accentSoft: '#fbe7e5',
    hint: '请描述稽查情况，AI 将给出专业应对策略。',
    submitText: '生成应对方案',
    reportTitle: '稽查应对实操方案',
    pagePath: '/pages/tool-chat/tool-chat?toolId=audit-response',
    sections: [
      {
        id: 'audit_basic',
        title: '稽查基本信息',
        tag: '必填',
        fields: [
          {
            id: 'audit_type',
            label: '稽查类型',
            type: 'select',
            required: true,
            options: ['例行检查', '专项检查', '举报检查', '协查', '不确定'].map((value) => ({ label: value, value })),
          },
          {
            id: 'audit_stage',
            label: '当前阶段',
            type: 'select',
            required: true,
            options: ['收到通知/尚未开始', '检查进行中', '已出具初步意见', '已收到处理决定', '复议/诉讼阶段'].map((value) => ({ label: value, value })),
          },
          {
            id: 'audit_tax_type',
            label: '涉及税种',
            type: 'select',
            required: true,
            options: ['增值税', '企业所得税', '个人所得税', '多个税种', '尚不清楚'].map((value) => ({ label: value, value })),
          },
        ],
      },
      {
        id: 'issues',
        title: '涉及问题',
        tag: '选填',
        fields: [
          {
            id: 'audit_issues',
            label: '风险问题',
            type: 'check-multi',
            options: [
              '发票问题（虚开、不合规等）',
              '收入未申报/少申报',
              '成本费用扣除问题',
              '关联交易/转让定价',
              '个税代扣代缴问题',
              '其他/不确定',
            ].map((label, index) => ({ label, value: label, active: index === 0 })),
          },
        ],
      },
      {
        id: 'note',
        title: '补充说明',
        fields: [
          {
            id: 'audit_note',
            label: '补充说明',
            type: 'textarea',
            placeholder: '请描述具体情况，如稽查通知书内容、已沟通的情况等',
          },
        ],
      },
    ],
  },
]

export const TOOL_ITEM_MAP: Record<string, ToolItem> = TOOL_ITEMS.reduce((acc, item) => {
  acc[item.id] = item
  return acc
}, {} as Record<string, ToolItem>)
