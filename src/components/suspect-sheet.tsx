"use client";

import { FormEvent, useMemo, useState } from "react";

import { interrogateSuspect, type InterrogationMessage } from "@/features/game/api-client";
import type { PublicSuspect, V2PlayerCase } from "@/features/game/types";

const SAMPLE_QUESTIONS = [
  "你最后一次看到那件物品时，它在什么位置？",
  "案发前后，你有没有注意到谁靠近过它？",
  "你为什么会记得那件物品没有变过？",
  "你离开现场前，最后看见的是谁？",
  "你刚才的证词里，哪一句你最确定？",
  "现场有哪处细节让你觉得不自然？",
  "如果有人移动过它，你觉得会留下什么痕迹？",
  "你有没有听到或看到别人整理现场？",
  "你说没碰过它，那你怎么知道它一直在原位？",
  "你觉得另外两个人谁最在意那件物品？",
];

export function SuspectSheet({
  game,
  suspect,
  onClose,
}: {
  game: V2PlayerCase;
  suspect: PublicSuspect;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<InterrogationMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleQuestion] = useState(
    () => SAMPLE_QUESTIONS[Math.floor(Math.random() * SAMPLE_QUESTIONS.length)],
  );
  const usedRounds = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  );
  const remainingRounds = Math.max(0, 3 - usedRounds);
  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy || remainingRounds === 0) return;
    const nextMessages: InterrogationMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setQuestion("");
    setBusy(true);
    setError(null);
    try {
      const result = await interrogateSuspect({
        game,
        suspectId: suspect.id,
        messages: nextMessages,
      });
      setMessages([...nextMessages, { role: "suspect", content: result.reply }]);
    } catch {
      setMessages(messages);
      setError("对方暂时沉默了，换个问法再试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="clue-sheet suspect-sheet" role="dialog" aria-modal="true" aria-labelledby="suspect-title">
        <div className="sheet-handle" />
        <div className="suspect-sheet-profile">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/portraits/${suspect.portraitKey}.webp`} alt={`${suspect.name}角色立绘`} />
          <div>
            <p className="eyebrow">SUSPECT FILE</p>
            <h2 id="suspect-title">{suspect.name}</h2>
            <strong>{suspect.identity}</strong>
          </div>
        </div>
        <p className="suspect-relation">{suspect.gender} · {suspect.age} 岁 · {suspect.identity}</p>
        <p className="suspect-relation">与案件的关系：{suspect.relation}</p>
        <div className="personality-tags suspect-sheet-tags">
          {suspect.personalityTags.map((tag) => <em key={tag}>{tag}</em>)}
        </div>
        <blockquote>{suspect.initialTestimony}</blockquote>
        <div className="interrogation-panel">
          <div className="interrogation-heading">
            <p className="eyebrow">INTERROGATION</p>
            <strong>自由审问</strong>
            <span>{remainingRounds}/3</span>
          </div>
          <p className="interrogation-guide">围绕时间线、物证和证词追问。嫌疑人可能闪躲，但不会替你直接揭晓答案。</p>
          <div className="interrogation-log" aria-live="polite">
            {messages.length === 0 ? (
              <p className="empty-dialogue">试着问：“{sampleQuestion}”</p>
            ) : messages.map((message, index) => (
              <p key={`${message.role}-${index}`} className={`dialogue-line ${message.role}`}>
                <span>{message.role === "user" ? "你" : suspect.name}</span>
                {message.content}
              </p>
            ))}
            {busy && <p className="empty-dialogue">对方正在斟酌回答……</p>}
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <form className="interrogation-form" onSubmit={submitQuestion}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={busy || remainingRounds === 0}
              maxLength={120}
              placeholder={remainingRounds === 0 ? "本轮审问已结束" : "输入你的追问"}
              aria-label={`审问${suspect.name}`}
            />
            <button className="secondary-button" type="submit" disabled={busy || remainingRounds === 0 || !question.trim()}>
              追问
            </button>
          </form>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>返回现场</button>
      </section>
    </div>
  );
}
