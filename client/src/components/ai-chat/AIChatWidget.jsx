import { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MessageCircle, X, Bot, Send, Sparkles, Package, Truck, CreditCard,
  RotateCcw, ShieldCheck, User, Phone, ArrowRight, ArrowLeft, Paperclip,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../hooks/useToast';
import {
  PRIMARY_GRID_ACTIONS, ADVICE_ACTION, SECONDARY_ACTIONS, FAQ_ACTIONS,
  matchCategory, matchRecommendCategory, buildResponse,
} from './chatResponses';
import s from './AIChatWidget.module.css';

const ICONS = {
  Sparkles, Package, Truck, CreditCard, RotateCcw, ShieldCheck, User, Phone,
};
const MAX_MESSAGE_LENGTH = 500;
const RESPONSE_DELAY_MS = 800;
const HIDDEN_ROUTE_PATTERN = /^\/(checkout|order-success)(\/|$)/;

let idCounter = 0;
const nextId = () => `ai-chat-msg-${++idCounter}`;

const formatTime = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function AIChatWidget() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const titleId = useId();

  const [open, setOpen] = useState(false);
  // 'home' (pristine, no conversation yet) | 'conversation' (active, Back
  // visible) | 'homeWithHistory' (options on top, prior conversation still
  // rendered below — Sapir's swBackToMenu never removes #swMessages, it only
  // re-shows #swWelcome, so both are simultaneously in the DOM).
  const [view, setView] = useState('home');
  const [unread, setUnread] = useState(true);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [recommendStep, setRecommendStep] = useState(null); // null | 'category' | 'budget' | 'usecase'
  const [recommendCategory, setRecommendCategory] = useState(null);
  const [scrollAtBottom, setScrollAtBottom] = useState(true);

  const fabRef = useRef(null);
  const inputRef = useRef(null);
  const firstActionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTimeout(() => fabRef.current?.focus(), 0);
  }, []);

  // Escape closes the entire sidebar — it never navigates Back.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  // Focus moves into a meaningful control when the sidebar OPENS — the
  // input if a conversation already exists, or the first primary action on
  // a pristine Home screen. Deliberately keyed to `open` only (not `view`):
  // this must fire once per open, not on every later view transition while
  // already open, otherwise it fights with handleBack's own explicit
  // focus-to-first-action call (view changes on Back too, and this effect
  // would re-fire ~60ms after it and steal focus back to the input).
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => {
      (view === 'home' ? firstActionRef.current : inputRef.current)?.focus();
    }, 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clean up any pending "typing" timeout on unmount.
  useEffect(() => () => clearTimeout(typingTimeoutRef.current), []);

  // Auto-scroll to the newest message/typing indicator — only while actively
  // conversing. In `homeWithHistory` the user is deliberately browsing the
  // options list, so new content must never yank their scroll position.
  useEffect(() => {
    if (view !== 'conversation') return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing, view]);

  // Tracks whether more content exists below the current scroll position,
  // driving the blue scroll-affordance (mirrors Sapir's blue scrollbar thumb
  // reaching the end of its track).
  const checkScrollBottom = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    setScrollAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 2);
  }, []);
  // useLayoutEffect (not useEffect+rAF) — runs synchronously right after the
  // DOM commit, so scrollHeight/clientHeight already reflect the just-added
  // messages/options. An effect+rAF combo measured up to ~500ms of drift
  // under React 18's effect scheduling before settling on the correct value.
  useLayoutEffect(() => {
    checkScrollBottom();
  }, [open, view, messages, typing, checkScrollBottom]);

  const handleOpen = () => {
    setOpen(true);
    setUnread(false);
  };

  const pushMessage = useCallback((role, text, action = null) => {
    setMessages((prev) => [...prev, { id: nextId(), role, text, action, timestamp: Date.now() }]);
  }, []);

  const respondAfterDelay = useCallback((text, action) => {
    setTyping(true);
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
      pushMessage('assistant', text, action);
    }, RESPONSE_DELAY_MS);
  }, [pushMessage]);

  const beginRecommendFlow = useCallback((presetCategory = null) => {
    if (presetCategory) {
      setRecommendCategory(presetCategory);
      setRecommendStep('budget');
      respondAfterDelay(t('aiChat.resp_recommend_ask_budget'));
    } else {
      setRecommendCategory(null);
      setRecommendStep('category');
      respondAfterDelay(t('aiChat.resp_recommend_ask_category'));
    }
  }, [respondAfterDelay, t]);

  const handleAction = (id, labelText) => {
    if (typing) return;
    setView('conversation');
    pushMessage('user', labelText);
    if (id === 'recommend') { beginRecommendFlow(); return; }
    if (id === 'recommendMonitor') { beginRecommendFlow('monitors'); return; }
    const { text, action } = buildResponse(id, t);
    respondAfterDelay(text, action);
  };

  const handleBack = useCallback(() => {
    clearTimeout(typingTimeoutRef.current);
    setTyping(false);
    setRecommendStep(null);
    setRecommendCategory(null);
    setView('homeWithHistory');
    // Matches Sapir's swBackToMenu, which explicitly resets scrollTop to 0 so
    // the options reappear at the top and the user scrolls down to reach
    // the preserved conversation history. scrollTop=0 is valid at any
    // content height, so this needs no rAF/layout wait.
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
    setTimeout(() => firstActionRef.current?.focus(), 0);
  }, []);

  const handleSend = () => {
    const trimmed = inputValue.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed || typing) return;
    setView('conversation');
    pushMessage('user', trimmed);
    setInputValue('');

    if (recommendStep === 'category') {
      setRecommendCategory(matchRecommendCategory(trimmed, t));
      setRecommendStep('budget');
      respondAfterDelay(t('aiChat.resp_recommend_ask_budget'));
      return;
    }
    if (recommendStep === 'budget') {
      setRecommendStep('usecase');
      respondAfterDelay(t('aiChat.resp_recommend_ask_usecase'));
      return;
    }
    if (recommendStep === 'usecase') {
      setRecommendStep(null);
      const route = recommendCategory ? `/category/${recommendCategory}` : '/products';
      respondAfterDelay(t('aiChat.resp_recommend_done'), { labelKey: 'aiChat.action_view_products', route });
      return;
    }

    const category = matchCategory(trimmed);
    if (category === 'recommend') { beginRecommendFlow(); return; }
    const { text, action } = buildResponse(category, t);
    respondAfterDelay(text, action);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleActionClick = (action) => {
    handleClose();
    navigate(action.route);
  };

  // Sapir's paperclip button only ever shows a "coming soon" toast — it
  // never opens a file picker. No upload backend exists in this project, so
  // this reproduces the reference's own limitation rather than inventing one.
  const handleAttachClick = () => {
    toast.info(t('aiChat.attach_coming_soon'));
  };

  const dir = language === 'he' ? 'rtl' : 'ltr';
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const showOptions = view === 'home' || view === 'homeWithHistory';

  if (HIDDEN_ROUTE_PATTERN.test(location.pathname)) return null;

  return (
    <>
      <button
        id="ai-chat-fab"
        ref={fabRef}
        type="button"
        className={`${s.fab}${open ? ` ${s.fabOpen}` : ''}`}
        onClick={handleOpen}
        aria-label={t('aiChat.launcher_label')}
        aria-expanded={open}
        aria-controls="ai-chat-panel"
      >
        <MessageCircle size={26} className={s.fabIcon} aria-hidden="true" />
        {unread && <span className={s.fabBadge} aria-hidden="true">1</span>}
      </button>

      {/* Decorative dim layer only — pointer-events:none keeps the page
          behind it fully interactive and independently scrollable. The
          close button is the only explicit close mechanism. */}
      <div
        className={`${s.overlay}${open ? ` ${s.overlayOpen}` : ''}`}
        aria-hidden="true"
      />

      <div
        id="ai-chat-panel"
        className={`${s.panel}${open ? ` ${s.panelOpen}` : ''}`}
        role="dialog"
        aria-labelledby={titleId}
        aria-hidden={!open}
        dir={dir}
      >
        <div className={s.header} data-testid="ai-chat-header">
          <div className={s.headerInfo}>
            {view === 'conversation' && (
              <button
                type="button"
                className={s.backBtn}
                onClick={handleBack}
                aria-label={t('aiChat.back_label')}
                data-testid="ai-chat-back"
              >
                <BackIcon size={15} aria-hidden="true" />
              </button>
            )}
            <div className={s.avatar}><Bot size={19} aria-hidden="true" /></div>
            <div>
              <div id={titleId} className={s.headerTitle}>{t('aiChat.title')}</div>
              <div className={s.headerStatus}><span className={s.dot} aria-hidden="true" />{t('aiChat.status_online')}</div>
            </div>
          </div>
          <button type="button" className={s.closeBtn} onClick={handleClose} aria-label={t('aiChat.close_label')}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className={s.scrollAreaWrap}>
          <div
            className={s.scrollArea}
            data-testid="ai-chat-scroll-area"
            ref={scrollAreaRef}
            onScroll={checkScrollBottom}
          >
            {showOptions && (
              <div className={s.welcome} data-testid="ai-chat-home">
                <div className={s.welcomeIcon}><Bot size={26} aria-hidden="true" /></div>
                <div className={s.welcomeTitle}>{t('aiChat.welcome_title')}</div>
                <div className={s.welcomeGreet}>{t('aiChat.welcome_greet')}</div>
                <div className={s.welcomeSub}>{t('aiChat.welcome_sub')}</div>

                <div className={s.quickGrid}>
                  {PRIMARY_GRID_ACTIONS.map((a, i) => {
                    const Icon = ICONS[a.icon];
                    return (
                      <button
                        key={a.id}
                        ref={i === 0 ? firstActionRef : undefined}
                        type="button"
                        className={s.quickCard}
                        data-testid="ai-chat-primary-action"
                        onClick={() => handleAction(a.id, t(a.labelKey))}
                        disabled={typing}
                      >
                        <span className={s.quickCardIcon}><Icon size={20} aria-hidden="true" /></span>
                        <span>{t(a.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className={s.adviceCard}
                  data-testid="ai-chat-primary-action"
                  onClick={() => handleAction(ADVICE_ACTION.id, t(ADVICE_ACTION.titleKey))}
                  disabled={typing}
                >
                  <span className={s.adviceIcon}><Sparkles size={18} aria-hidden="true" /></span>
                  <span className={s.adviceText}>
                    <span className={s.adviceTitle}>{t(ADVICE_ACTION.titleKey)}</span>
                    <span className={s.adviceSub}>{t(ADVICE_ACTION.subKey)}</span>
                  </span>
                </button>

                <div className={s.secondaryLinks}>
                  {SECONDARY_ACTIONS.map((a) => {
                    const Icon = ICONS[a.icon];
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={s.secondaryLink}
                        data-testid="ai-chat-secondary-action"
                        onClick={() => handleAction(a.id, t(a.labelKey))}
                        disabled={typing}
                      >
                        <Icon size={13} aria-hidden="true" /> {t(a.labelKey)}
                      </button>
                    );
                  })}
                </div>

                <div className={s.faqLabel}>{t('aiChat.faq_label')}</div>
                <div className={s.faqChips}>
                  {FAQ_ACTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={s.faqChip}
                      data-testid="ai-chat-faq"
                      onClick={() => handleAction(f.id, t(f.labelKey))}
                      disabled={typing}
                    >
                      {t(f.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.length > 0 && (
              <div className={s.messages} aria-live="polite" data-testid="ai-chat-messages">
                {messages.map((m) => (
                  <div key={m.id} className={`${s.msgRow} ${m.role === 'user' ? s.msgUser : s.msgBot}`}>
                    <div className={s.bubble}>
                      <span>{m.text}</span>
                      {m.action && (
                        <button type="button" className={s.msgAction} onClick={() => handleActionClick(m.action)}>
                          {t(m.action.labelKey)}
                        </button>
                      )}
                    </div>
                    <div className={s.msgTime}>{formatTime(m.timestamp)}</div>
                  </div>
                ))}
                {typing && (
                  <div className={s.typingRow} aria-hidden="true">
                    <span className={s.typingDot} />
                    <span className={s.typingDot} />
                    <span className={s.typingDot} />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div
            className={`${s.scrollIndicator}${scrollAtBottom ? '' : ` ${s.scrollIndicatorVisible}`}`}
            data-testid="ai-chat-scroll-indicator"
            aria-hidden="true"
          />
        </div>

        <form
          className={s.inputRow}
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <button
            type="button"
            className={s.attachBtn}
            onClick={handleAttachClick}
            aria-label={t('aiChat.attach_label')}
            data-testid="ai-chat-attach"
          >
            <Paperclip size={18} aria-hidden="true" />
          </button>
          <label htmlFor="ai-chat-input" className={s.srOnly}>{t('aiChat.input_label')}</label>
          <textarea
            id="ai-chat-input"
            ref={inputRef}
            className={s.input}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder={t('aiChat.input_placeholder')}
            aria-label={t('aiChat.input_label')}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={typing}
          />
          <button
            type="submit"
            className={s.sendBtn}
            disabled={!inputValue.trim() || typing}
            aria-label={t('aiChat.send_label')}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </>
  );
}
