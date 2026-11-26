import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { api, session } from '../../api/client';
import type { AssistantReply, Role } from '../../../types';
import './ai.css';

// 밀어서 실행. 손잡이를 끌어 85%를 넘기면 실행하고, 탭·Enter도 같은 동작입니다.
// 이동은 문서 전체에서 추적해 포인터가 버튼 밖으로 나가도 끊기지 않습니다.
export function SlideAction({label,onDone}:{label:string;onDone:()=>void}) {
 const [x,setX]=useState(0);const [dragging,setDragging]=useState(false);const moved=useRef(false);
 const down=(e:PointerEvent<HTMLButtonElement>)=>{
  if(e.button!==0)return;
  e.preventDefault();
  const start=e.clientX, max=e.currentTarget.clientWidth-56;let last=0;moved.current=false;setDragging(true);
  const move=(ev:globalThis.PointerEvent)=>{last=Math.min(Math.max(ev.clientX-start,0),max);if(last>6)moved.current=true;setX(last);};
  const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);setDragging(false);
   if(moved.current&&last>=max*.85){setX(max);setTimeout(()=>{onDone();setX(0);},180);}else setX(0);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
 };
 return <button type="button" draggable={false} className={`shell-slide${dragging?' is-dragging':''}`} style={{'--slide-x':`${x}px`} as CSSProperties} onPointerDown={down} onClick={()=>{if(!moved.current)onDone();moved.current=false;}}>
  <span className="shell-slide-fill" aria-hidden="true"/><span className="shell-slide-knob" aria-hidden="true">›</span><span className="shell-slide-label">{label}</span><span className="shell-slide-arrows" aria-hidden="true"><i>›</i><i>›</i><i>›</i></span>
 </button>;
}

export type Suggestion = {id:string;title:ReactNode;meta?:ReactNode;reason:ReactNode;icon?:string;accept:string;onAccept:()=>void};
export function AiSuggestions({items,more}:{items:Suggestion[];more?:()=>void}) {
 const [gone,setGone]=useState<string[]>([]);const [leaving,setLeaving]=useState<string|null>(null);
 const dismiss=(id:string)=>{setLeaving(id);setTimeout(()=>{setGone(g=>[...g,id]);setLeaving(null);},240);};
 const list=items.filter(s=>!gone.includes(s.id));
 return <section className="shell-ai" aria-label="AI 제안"><div className="shell-ai-head"><h2><img src="/icons/sparkle_16.svg" alt=""/>AI 제안</h2>{more&&<button type="button" onClick={more}>더보기</button>}</div>
  {list.length?<ul>{list.map((s,i)=><li key={s.id} className={leaving===s.id?'is-leaving':undefined} style={{'--i':i} as CSSProperties} onClick={s.onAccept}>
   <span className="shell-ai-thumb" aria-hidden="true">{s.icon?<img src={`/icons/${s.icon}.svg`} alt=""/>:'✦'}</span>
   <div className="shell-ai-text"><b>{s.title}{s.meta&&<small> / {s.meta}</small>}</b><span>{s.reason}</span></div>
   <button type="button" className="shell-ai-no" aria-label="제안 닫기" onClick={e=>{e.stopPropagation();dismiss(s.id);}}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/></svg></button>
   <button type="button" className="shell-ai-yes" aria-label={s.accept} onClick={e=>{e.stopPropagation();s.onAccept();}}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3.5l4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg></button>
  </li>)}</ul>:<p className="shell-ai-empty">새 제안 없음</p>}
 </section>;
}

type Shortcut = {label:string;go:string};
const guide:Record<Role,{cards:[Shortcut&{desc:string},Shortcut&{desc:string}];chips:Shortcut[]}>={
 seller:{cards:[{label:'판매 등록',desc:'사진, 품목, 무게로 시세 기준 추천가 확인',go:'register'},{label:'공동판매 묶음',desc:'근처 판매자와 묶어 운송비 절감',go:'poolFind'}],chips:[{label:'🚚 출고 일정',go:'orders'},{label:'📈 이번 주 시세',go:'market'},{label:'♻️ 공동판매 현황',go:'poolStatus'},{label:'🏭 재활용업체',go:'buyers'}]},
 buyer:{cards:[{label:'통과증 매물 찾기',desc:'등급, 지역에 맞는 매물 추천',go:'explore'},{label:'시세 비교',desc:'지금 사기 좋은 품목 확인',go:'market'}],chips:[{label:'🧺 장바구니',go:'cart'},{label:'📦 거래 내역',go:'orders'},{label:'⭐ 관심 품목',go:'interests'},{label:'🔔 알림',go:'notifications'}]},
};
function Facts({facts}:{facts:AssistantReply['facts']}) {
 const labels=[...new Set(facts.filter(f=>!f.headline).flatMap(f=>f.evidence.map(e=>e.label).filter(Boolean)))];
 return <>{facts.map((f,i)=><div className="shell-assistant-fact" key={i}>{f.headline&&<b>{f.headline}</b>}<p>{f.text}</p>{f.headline&&f.detail&&<details className="shell-assistant-law"><summary>조문 보기</summary><p>{f.detail}</p></details>}</div>)}{labels.length>0&&<small>출처: {labels.join(', ')}</small>}</>;
}
// AI 문장이 있으면 답을 먼저 보이고 근거는 접어 둡니다. 코드 답은 근거 문장이 곧 답입니다.
function AiReply({reply}:{reply:AssistantReply}) {
 if(reply.source==='none')return <p className="shell-assistant-answer">{reply.answer}</p>;
 const hasLaw=reply.facts.some(f=>Boolean(f.headline));
 return <>
  {hasLaw&&<small>법 쉬운 설명</small>}
  {reply.source==='llm'&&!hasLaw
   ?<><small>AI 설명</small><p className="shell-assistant-answer">{reply.answer}</p><details className="shell-assistant-facts"><summary>근거 {reply.facts.length}개 보기</summary><Facts facts={reply.facts}/></details></>
   :<>{!hasLaw&&<small>데이터에서 확인</small>}<Facts facts={reply.facts}/></>}
  {reply.legal_note&&<small className="shell-assistant-legal-note">{reply.legal_note}</small>}
 </>;
}
export function Assistant({appRole,go,back}:{appRole:Role;go:(name:string)=>void;back:()=>void}) {
 const g=guide[appRole];const name=session(appRole)?.company.name;
 const [input,setInput]=useState('');const [busy,setBusy]=useState(false);
 const [messages,setMessages]=useState<({kind:'user';text:string}|{kind:'ai';reply:AssistantReply}|{kind:'error';text:string})[]>([]);
 const body=useRef<HTMLDivElement>(null);const lock=useRef(false);
 useEffect(()=>{if(body.current)body.current.scrollTop=body.current.scrollHeight;},[messages,busy]);
 const send=async()=>{
  const message=input.trim();if(!message||message.length>300||lock.current)return;
  lock.current=true;setBusy(true);setInput('');setMessages(m=>[...m,{kind:'user',text:message}]);
  try {
   const reply=await api<AssistantReply>(appRole,'/assistant/chat','POST',{message});
   setMessages(m=>[...m,{kind:'ai',reply}]);
  } catch {
   setMessages(m=>[...m,{kind:'error',text:'답변 불러오기 실패, 잠시 후 다시 질문 필요'}]);
  } finally {lock.current=false;setBusy(false);}
 };
 return <main className="shell-assistant">
  <header><button type="button" onClick={back} aria-label="뒤로"><img src="/icons/back.svg" alt=""/></button><h1>AI 도우미</h1><span/></header>
  <div className="shell-assistant-body" ref={body}>
   {messages.length ? <div className="shell-assistant-messages" role="log" aria-label="AI 대화">
    {messages.map((m,i)=><div key={i} className={`shell-assistant-bubble ${m.kind}`}>
     {m.kind==='ai'?<AiReply reply={m.reply}/>:m.kind==='user'?<p>{m.text}</p>:<><small>AI 도우미</small><p>{m.text}</p></>}
    </div>)}
    {busy&&<p role="status">확인 중…</p>}
   </div>:<>

   <span className="shell-assistant-avatar" aria-hidden="true"><img src="/icons/sparkle_16.svg" alt=""/></span>
   <p className="shell-assistant-hi">{name ? `${name}님` : '잔재미 AI'} 👋</p>
   <h2>{'필요한 업무 선택'.split(' ').map((w,i)=><span key={i} style={{'--i':i} as CSSProperties}>{w} </span>)}</h2>
   <div className="shell-assistant-cards">{g.cards.map((c,i)=><button type="button" key={c.go} className={`shell-assistant-card ${i?'peach':'mint'}`} onClick={()=>go(c.go)}><i aria-hidden="true">↗</i><b>{c.label}</b><small>{c.desc}</small></button>)}</div>
   <h3>자주 찾는 메뉴</h3>
   <div className="shell-assistant-chips">{g.chips.map(c=><button type="button" key={c.go} onClick={()=>go(c.go)}>{c.label}</button>)}</div>
   </>}
  </div>
  <form className="shell-assistant-input" onSubmit={e=>{e.preventDefault();void send();}}>
   <input aria-label="AI에게 물어보기" placeholder="질문 입력" maxLength={300} value={input} onChange={e=>setInput(e.target.value)}/><button type="submit" aria-label="보내기" disabled={busy||!input.trim()}>➤</button>
  </form>
 </main>;
}
