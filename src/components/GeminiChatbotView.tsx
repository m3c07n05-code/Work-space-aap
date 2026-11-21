import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User as UserIcon,
  Plus,
  Trash2,
  Cpu,
  ShieldCheck,
  Zap,
  MessageSquare,
  PlusCircle,
  Check,
  AlertCircle,
  Loader2,
  Cloud,
} from 'lucide-react';
import { GlassBox } from './ui/glass-box';
import { LiquidButton } from './ui/liquid-glass-button';
import { useFirebase, ChatRoleMode } from '../contexts/FirebaseContext';
import { backendGateway, ScopeItem } from '../services/backendGateway';

interface LocalMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  timestamp: string;
}

const ROLE_OPTIONS: Array<{
  id: ChatRoleMode;
  title: string;
  subtitle: string;
  modelLabel: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'general',
    title: 'ผู้ช่วย CRD WEB ทั่วไป',
    subtitle: 'อธิบายงานและแนวทางพัฒนา',
    modelLabel: 'gemini-4-hydrogen',
    icon: <Bot className="w-4 h-4 text-blue-600" />,
  },
  {
    id: 'deep',
    title: 'วิเคราะห์ 16 ด่าน & PDPA',
    subtitle: 'คิดวิเคราะห์เชิงลึก (XHIGH)',
    modelLabel: 'gemini-4-hydrogen (Deep)',
    icon: <ShieldCheck className="w-4 h-4 text-emerald-600" />,
  },
  {
    id: 'complex',
    title: 'วิศวกร Dual-Key & GAS',
    subtitle: 'ออกแบบโค้ดและโครงสร้างซับซ้อน',
    modelLabel: 'gemini-4-hydrogen (High)',
    icon: <Cpu className="w-4 h-4 text-indigo-600" />,
  },
  {
    id: 'fast',
    title: 'ตรวจ 5 หลัก & V003 ด่วน',
    subtitle: 'ตอบเร็วพิเศษในไม่กี่เสี้ยววินาที',
    modelLabel: 'gemini-3.1-flash-lite',
    icon: <Zap className="w-4 h-4 text-amber-600" />,
  },
];

const QUICK_STARTERS = [
  'ช่วยตรวจสอบกฎ Leading Zero 5 หลัก และ V003 ก่อนนำเข้าข้อมูลสาขา',
  'ออกแบบโครงสร้างแยกสัญญา พม. เดี่ยว กับ พม. ร่วม แบบ Dual-Key',
  'สร้างเงื่อนไข Stop Gate ตรวจจับข้อมูล PII เพื่อไม่ให้หลุดเข้า 00_Project_Manifest.json',
  'สรุปขั้นตอนการเขียน Code.gs เชื่อมต่อ CRD WEB กับ Google Drive',
];

const LOCAL_CHAT_STORAGE_KEY = 'crd_web_local_chat_messages_v1';

export const GeminiChatbotView: React.FC = () => {
  const {
    user,
    signInWithGoogle,
    chatSessions,
    createCloudChatSession,
    updateCloudChatSession,
    appendCloudChatMessage,
    subscribeChatMessages,
    syncScopeToCloud,
  } = useFirebase();

  const [roleMode, setRoleMode] = useState<ChatRoleMode>('general');
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [messages, setMessages] = useState<LocalMessage[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_CHAT_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'welcome_msg',
        role: 'model',
        text: 'สวัสดีครับ ผมคือผู้ช่วย Gemini ประจำระบบ CRD WEB\n\nสามารถถามคำถามต่อเนื่องเกี่ยวกับโครงสร้าง WORK 1–9, กฎ Dual-Key, ด่านตรวจ 16 Stop Gates, การเชื่อมต่อ Apps Script หรือให้ช่วยร่างโค้ดพัฒนาต่อได้ทันทีครับ',
        modelUsed: 'gemini-4-hydrogen',
        timestamp: new Date().toLocaleTimeString('th-TH'),
      },
    ];
  });
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [savedScopeMsgId, setSavedScopeMsgId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Save guest messages locally when not authenticated
  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(LOCAL_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
      } catch {
        // ignore
      }
    }
  }, [messages, user]);

  // Select first Firestore chat session automatically when signed in
  useEffect(() => {
    if (user && user.emailVerified) {
      if (chatSessions.length > 0 && !activeSessionId) {
        setActiveSessionId(chatSessions[0].id);
        setRoleMode(chatSessions[0].roleId || 'general');
      }
    } else {
      setActiveSessionId('');
    }
  }, [user, chatSessions, activeSessionId]);

  // Subscribe to messages of active Firestore chat session
  useEffect(() => {
    if (!user || !user.emailVerified || !activeSessionId) return;
    const unsubscribe = subscribeChatMessages(activeSessionId, (cloudMsgs) => {
      if (cloudMsgs.length === 0) {
        setMessages([
          {
            id: 'cloud_welcome',
            role: 'model',
            text: 'เริ่มบทสนทนาใหม่ (ซิงก์บน Firestore อัตโนมัติแล้ว) พิมพ์คำถามด้านล่างได้เลยครับ',
            modelUsed: 'gemini-4-hydrogen',
            timestamp: new Date().toLocaleTimeString('th-TH'),
          },
        ]);
      } else {
        setMessages(
          cloudMsgs.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            modelUsed: m.modelUsed,
            timestamp: '',
          }))
        );
      }
    });
    return unsubscribe;
  }, [user, activeSessionId, subscribeChatMessages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleStartNewChat = async () => {
    setErrorBanner(null);
    const newId = `chat_${Date.now()}`;
    const selectedRole = ROLE_OPTIONS.find((r) => r.id === roleMode) || ROLE_OPTIONS[0];
    if (user && user.emailVerified) {
      await createCloudChatSession({
        id: newId,
        title: `บทสนทนาใหม่ (${new Date().toLocaleTimeString('th-TH')})`,
        roleId: roleMode,
        modelId: selectedRole.modelLabel,
      });
      setActiveSessionId(newId);
    } else {
      const fresh: LocalMessage[] = [
        {
          id: `welcome_${Date.now()}`,
          role: 'model',
          text: `เริ่มหัวข้อสนทนาใหม่ในโหมด "${selectedRole.title}" แล้วครับ พิมพ์คำสั่งหรือคำถามได้เลย`,
          modelUsed: selectedRole.modelLabel,
          timestamp: new Date().toLocaleTimeString('th-TH'),
        },
      ];
      setMessages(fresh);
    }
  };

  const handleSend = async (customText?: string) => {
    const textToSend = (customText ?? input).trim();
    if (!textToSend || isSending) return;

    setInput('');
    setErrorBanner(null);
    setIsSending(true);
    backendGateway.setSyncStatus('syncing');

    const userMsgId = `msg_u_${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString('th-TH');
    const historyForApi = messages
      .filter((m) => m.id !== 'welcome_msg' && m.id !== 'cloud_welcome')
      .map((m) => ({ role: m.role, text: m.text }));

    const optimisticUserMsg: LocalMessage = {
      id: userMsgId,
      role: 'user',
      text: textToSend,
      timestamp: nowTime,
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    let targetSessionId = activeSessionId;
    const selectedRole = ROLE_OPTIONS.find((r) => r.id === roleMode) || ROLE_OPTIONS[0];

    try {
      if (user && user.emailVerified) {
        if (!targetSessionId) {
          targetSessionId = `chat_${Date.now()}`;
          await createCloudChatSession({
            id: targetSessionId,
            title: textToSend.slice(0, 48),
            roleId: roleMode,
            modelId: selectedRole.modelLabel,
          });
          setActiveSessionId(targetSessionId);
        } else {
          await updateCloudChatSession(targetSessionId, {
            roleId: roleMode,
            modelId: selectedRole.modelLabel,
          });
        }
        await appendCloudChatMessage(targetSessionId, {
          id: userMsgId,
          role: 'user',
          text: textToSend,
        });
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyForApi,
          message: textToSend,
          mode: roleMode,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'ไม่สามารถรับคำตอบจาก Gemini API ได้');
      }

      const botMsgId = `msg_m_${Date.now()}`;
      const botMsg: LocalMessage = {
        id: botMsgId,
        role: 'model',
        text: data.reply,
        modelUsed: data.modelUsed,
        timestamp: new Date().toLocaleTimeString('th-TH'),
      };

      if (user && user.emailVerified && targetSessionId) {
        await appendCloudChatMessage(targetSessionId, {
          id: botMsgId,
          role: 'model',
          text: data.reply,
          modelUsed: data.modelUsed,
        });
      } else {
        setMessages((prev) => [...prev, botMsg]);
      }
      backendGateway.setSyncStatus('synced');
    } catch (err: unknown) {
      backendGateway.setSyncStatus('synced');
      const errMsg = err instanceof Error ? err.message : 'การเชื่อมต่อ Gemini AI ล้มเหลว';
      setErrorBanner(errMsg);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveReplyAsScope = async (msg: LocalMessage) => {
    const firstLine = msg.text.split('\n')[0].replace(/[#*`]/g, '').trim();
    const newScope: ScopeItem = {
      id: `CRD-CHAT-${Math.floor(100 + Math.random() * 900)}`,
      title: firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine || 'ข้อกำหนดจากแชท AI',
      gate: roleMode === 'deep' ? 'PDPA_ZERO_PII' : roleMode === 'complex' ? 'DUAL_KEY_LEDGER' : 'V003_FORMAT_ONLY',
      rule: msg.text.slice(0, 480),
      status: 'ACTIVE_SYNCED',
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    backendGateway.addScope(newScope);
    if (user && user.emailVerified) {
      await syncScopeToCloud(newScope);
    }
    setSavedScopeMsgId(msg.id);
    setTimeout(() => setSavedScopeMsgId(null), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Header & Assistant Role Selector */}
      <GlassBox variant="frosted" className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#14243A] dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600 dark:text-teal-400" />
              <span>ผู้ช่วยพัฒนา CRD WEB (Multi-Turn Gemini Chatbot)</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              สนทนาต่อเนื่องพร้อมบริบทระบบ CRD เต็มรูปแบบ และซิงก์ประวัติอัตโนมัติเมื่อเข้าสู่ระบบ Google
            </p>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-slate-200/60 dark:bg-emerald-950/50 border border-white/90 dark:border-emerald-700 px-3 py-1.5 rounded-full">
                <Cloud className="w-3.5 h-3.5" />
                <span>ซิงก์ Firestore แล้ว</span>
              </span>
            ) : (
              <LiquidButton size="sm" onClick={signInWithGoogle} className="text-xs font-bold">
                <Cloud className="w-3.5 h-3.5 text-blue-600" />
                <span>ล็อกอิน Google เพื่อซิงก์แชท</span>
              </LiquidButton>
            )}
            <LiquidButton size="sm" onClick={handleStartNewChat} className="text-xs font-bold">
              <Plus className="w-3.5 h-3.5" />
              <span>แชทใหม่</span>
            </LiquidButton>
          </div>
        </div>

        {/* Role & Model Mode Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {ROLE_OPTIONS.map((opt) => {
            const active = roleMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRoleMode(opt.id)}
                className={`p-3 rounded-2xl text-left border transition-all cursor-pointer flex flex-col gap-1 ${
                  active
                    ? 'bg-white/95 dark:bg-slate-800 border-blue-300 dark:border-teal-400 shadow-sm ring-1 ring-blue-200 dark:ring-teal-500/40'
                    : 'bg-slate-200/50 hover:bg-white/75 dark:bg-slate-900/60 border-white/90 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#14243A] dark:text-white flex items-center gap-1.5">
                    {opt.icon}
                    <span className="truncate">{opt.title}</span>
                  </span>
                </div>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                  {opt.subtitle}
                </span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                  {opt.modelLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Cloud Sessions Switcher when signed in */}
        {user && chatSessions.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5">
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">ประวัติบน Cloud:</span>
            {chatSessions.map((sess) => (
              <button
                key={sess.id}
                type="button"
                onClick={() => {
                  setActiveSessionId(sess.id);
                  setRoleMode(sess.roleId || 'general');
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition cursor-pointer border ${
                  activeSessionId === sess.id
                    ? 'bg-white text-slate-900 border-slate-300 shadow-2xs font-bold'
                    : 'bg-slate-200/55 text-slate-700 border-white/90 hover:bg-white/80'
                }`}
              >
                {sess.title}
              </button>
            ))}
          </div>
        )}
      </GlassBox>

      {/* Main Chat Container */}
      <GlassBox variant="default" className="p-4 sm:p-6 flex flex-col gap-4">
        {/* Scrollable Message Thread */}
        <div className="h-[380px] sm:h-[430px] overflow-y-auto pr-1 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-2xs ${
                    isUser
                      ? 'bg-slate-800 text-white border-slate-700'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-blue-700 dark:text-teal-300 border-white'
                  }`}
                >
                  {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed space-y-2 border ${
                    isUser
                      ? 'bg-slate-200/75 dark:bg-slate-800 text-[#14243A] dark:text-white border-white/95 dark:border-slate-700 shadow-2xs'
                      : 'bg-white/90 dark:bg-slate-900/90 text-[#14243A] dark:text-slate-100 border-slate-200/80 dark:border-slate-800 shadow-2xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-800 text-[10px] text-slate-500 font-mono">
                    <span>
                      {isUser ? 'คุณ' : msg.modelUsed || 'gemini-4-hydrogen'}
                      {msg.timestamp ? ` · ${msg.timestamp}` : ''}
                    </span>

                    {!isUser && msg.id !== 'welcome_msg' && msg.id !== 'cloud_welcome' && (
                      <button
                        type="button"
                        onClick={() => handleSaveReplyAsScope(msg)}
                        className="inline-flex items-center gap-1 text-blue-700 dark:text-teal-300 hover:underline font-sans font-semibold cursor-pointer"
                      >
                        {savedScopeMsgId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>บันทึกเป็น Scope แล้ว</span>
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3 h-3" />
                            <span>บันทึกเป็น Scope งาน</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-200/80 border border-white flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              </div>
              <div className="rounded-2xl px-4 py-3 bg-white/85 dark:bg-slate-900 border border-slate-200 text-xs text-slate-600 dark:text-slate-300">
                กำลังประมวลผลด้วย Gemini...
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {errorBanner && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* Quick Prompts */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {QUICK_STARTERS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(q)}
              disabled={isSending}
              className="px-3 py-1.5 rounded-full bg-slate-200/55 hover:bg-white/90 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 border border-white/90 dark:border-slate-700 whitespace-nowrap shrink-0 transition cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2.5 pt-1"
        >
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="พิมพ์คำถามหรือคำสั่งพัฒนาต่อให้ CRD WEB... (Enter เพื่อส่ง)"
            className="flex-1 px-4 py-2.5 rounded-2xl bg-white/90 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 text-sm text-[#14243A] dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />

          <div className="flex flex-col gap-1.5 shrink-0">
            <LiquidButton
              type="submit"
              size="default"
              disabled={isSending || !input.trim()}
              className="font-bold cursor-pointer"
            >
              <Send className="w-4 h-4 text-blue-600 dark:text-teal-300" />
              <span>ส่งข้อความ</span>
            </LiquidButton>
            {!user && messages.length > 1 && (
              <button
                type="button"
                onClick={handleStartNewChat}
                className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>ล้างประวัติ</span>
              </button>
            )}
          </div>
        </form>
      </GlassBox>
    </div>
  );
};
