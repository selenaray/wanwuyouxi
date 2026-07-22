export const PORTRAIT_KEYS = [
  "noir-01",
  "noir-02",
  "noir-03",
  "noir-04",
  "noir-05",
  "noir-06",
  "noir-07",
  "noir-08",
  "noir-09",
  "noir-10",
  "noir-11",
  "noir-12",
  "noir-13",
  "noir-14",
  "noir-15",
  "noir-16",
  "noir-17",
  "noir-18",
  "noir-19",
  "noir-20",
  "noir-21",
] as const;

export type PortraitKey = (typeof PORTRAIT_KEYS)[number];

export type SuspectArchetype = {
  id: string;
  name: string;
  gender: "男" | "女";
  age: number;
  identity: string;
  personality: string;
  personalityTags: [string, string];
  portraitKey: PortraitKey;
};

export const SUSPECT_ROSTER: readonly SuspectArchetype[] = [
  { id: "shen-yanzhou", name: "沈砚舟", gender: "男", age: 35, identity: "私家侦探", personality: "冷静克制，观察力极强，不轻易相信别人", personalityTags: ["冷静", "克制"], portraitKey: "noir-01" },
  { id: "lin-wanqing", name: "林晚晴", gender: "女", age: 29, identity: "心理咨询师", personality: "温柔理性，擅长洞察人心，看似善良但极有控制欲", personalityTags: ["理性", "洞察"], portraitKey: "noir-02" },
  { id: "gu-yanchuan", name: "顾言川", gender: "男", age: 42, identity: "企业董事长", personality: "强势果断，野心极大，习惯操控局面", personalityTags: ["强势", "果断"], portraitKey: "noir-03" },
  { id: "su-nianan", name: "苏念安", gender: "女", age: 24, identity: "法医助理", personality: "外表开朗，内心敏感，对细节异常执着", personalityTags: ["开朗", "敏锐"], portraitKey: "noir-04" },
  { id: "lu-chengze", name: "陆承泽", gender: "男", age: 31, identity: "新闻记者", personality: "正义感强，行动大胆，不怕得罪权贵", personalityTags: ["大胆", "正义"], portraitKey: "noir-05" },
  { id: "tang-wanning", name: "唐婉宁", gender: "女", age: 38, identity: "豪门夫人", personality: "优雅冷静，社交能力强，情绪隐藏极深", personalityTags: ["优雅", "冷静"], portraitKey: "noir-06" },
  { id: "zhou-qiming", name: "周启明", gender: "男", age: 56, identity: "老警探", personality: "经验丰富，沉稳谨慎，坚持原则", personalityTags: ["沉稳", "谨慎"], portraitKey: "noir-07" },
  { id: "xu-qinghe", name: "许清禾", gender: "女", age: 27, identity: "古董店老板", personality: "神秘安静，博学敏锐，不喜欢解释自己", personalityTags: ["神秘", "博学"], portraitKey: "noir-08" },
  { id: "jiang-ye", name: "江野", gender: "男", age: 22, identity: "网络主播", personality: "外向幽默，喜欢冒险，擅长获取信息", personalityTags: ["外向", "冒险"], portraitKey: "noir-09" },
  { id: "ye-zhiqiu", name: "叶知秋", gender: "女", age: 45, identity: "高中教师", personality: "温和耐心，责任感强，容易获得信任", personalityTags: ["温和", "耐心"], portraitKey: "noir-10" },
  { id: "han-mobai", name: "韩墨白", gender: "男", age: 36, identity: "律师", personality: "逻辑严密，谈吐优雅，擅长辩护", personalityTags: ["严密", "优雅"], portraitKey: "noir-11" },
  { id: "wen-ruyue", name: "温如月", gender: "女", age: 33, identity: "画家", personality: "感性浪漫，观察细腻，情绪复杂", personalityTags: ["感性", "细腻"], portraitKey: "noir-12" },
  { id: "wang-guifen", name: "王桂芬", gender: "女", age: 52, identity: "小区保洁员", personality: "朴实热心，嘴碎爱聊天，对小区里每个人都熟悉", personalityTags: ["热心", "熟络"], portraitKey: "noir-13" },
  { id: "chen-haoran", name: "陈浩然", gender: "男", age: 26, identity: "外卖骑手", personality: "乐观随和，行动力强，喜欢帮助别人", personalityTags: ["乐观", "行动"], portraitKey: "noir-14" },
  { id: "zhao-xiaoyu", name: "赵小雨", gender: "女", age: 23, identity: "酒店服务员", personality: "胆小敏感，察言观色能力强，擅长记住客人的习惯", personalityTags: ["敏感", "细心"], portraitKey: "noir-15" },
  { id: "li-jianguo", name: "李建国", gender: "男", age: 58, identity: "小区门卫", personality: "固执传统，责任心强，警惕性高", personalityTags: ["固执", "警惕"], portraitKey: "noir-16" },
  { id: "lin-xiaomei", name: "林晓梅", gender: "女", age: 34, identity: "早餐店老板娘", personality: "爽朗热情，八卦能力强，人情世故老练", personalityTags: ["爽朗", "老练"], portraitKey: "noir-17" },
  { id: "zhang-weiqiang", name: "张伟强", gender: "男", age: 40, identity: "网约车司机", personality: "健谈幽默，看似普通，实际观察力强", personalityTags: ["健谈", "观察"], portraitKey: "noir-18" },
  { id: "xu-xinghe", name: "许星河", gender: "男", age: 16, identity: "高中生", personality: "安静聪明，观察力强，喜欢摄影，不善表达", personalityTags: ["安静", "聪明"], portraitKey: "noir-19" },
  { id: "shen-zhixia", name: "沈知夏", gender: "女", age: 14, identity: "初中生", personality: "活泼敏感，想象力丰富，喜欢写日记", personalityTags: ["活泼", "敏感"], portraitKey: "noir-20" },
  { id: "fang-ye", name: "方野", gender: "男", age: 18, identity: "职高学生/兼职维修工", personality: "叛逆直接，嘴硬心软，行动力强", personalityTags: ["叛逆", "直接"], portraitKey: "noir-21" },
] as const;

export function isRosterSuspect(value: {
  name: string;
  gender: string;
  age: number;
  identity: string;
  portraitKey: string;
}) {
  return SUSPECT_ROSTER.some((suspect) =>
    suspect.name === value.name
    && suspect.gender === value.gender
    && suspect.age === value.age
    && suspect.identity === value.identity
    && suspect.portraitKey === value.portraitKey);
}
