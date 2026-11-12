import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  prepareChatRequest,
  type ConversationHistory,
  type ChatUIMessage,
} from './chat-request.js';
import {
  addressApprovalSchema,
  chatActivitySchema,
  chatActivityLabels,
  conversationHistorySchema,
  type ChatActivity,
} from '@cat-supplies-store/contracts';

const authHeaders = {
  Authorization: `Bearer ${import.meta.env.VITE_DEMO_CUSTOMER_TOKEN ?? ''}`,
};

export default function App() {
  const [conversationId, setConversationId] = useState<string | null>(() =>
    localStorage.getItem('conversationId'),
  );
  const conversationRef = useRef(conversationId);
  const creating = useRef<Promise<string> | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(Boolean(conversationId));
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        headers: authHeaders,
        prepareSendMessagesRequest: ({ messages }) => {
          if (!conversationRef.current)
            throw new Error('Create a conversation first.');
          return {
            api: `/agent-api/assistant/conversations/${conversationRef.current}/messages`,
            body: prepareChatRequest(messages),
          };
        },
        fetch: async (url, options) => {
          const response = await fetch(url, options);
          if (
            response.ok &&
            response.headers.get('content-type')?.includes('application/json')
          ) {
            // An idempotent replay returns turn status; history supplies the saved reply.
            await response.json();
            return new Response('data: [DONE]\n\n', {
              headers: { 'content-type': 'text/event-stream' },
            });
          }
          return response;
        },
      }),
    [],
  );
  const [input, setInput] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [approvalStates, setApprovalStates] = useState<Record<string, string>>(
    {},
  );
  const [confirmationError, setConfirmationError] = useState('');
  const [activity, setActivity] = useState<ChatActivity['activity'] | null>(
    null,
  );
  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    setMessages,
    clearError,
  } = useChat<ChatUIMessage>({
    transport,
    generateId: () => crypto.randomUUID(),
    dataPartSchemas: {
      activity: chatActivitySchema,
      'address-approval': addressApprovalSchema,
    },
    onData: (part) => {
      if (part.type === 'data-activity') setActivity(part.data.activity);
    },
    onFinish: () => {
      setActivity(null);
      void recoverHistory();
    },
    onError: () => {
      setActivity(null);
      void recoverHistory();
    },
  });
  const isBusy =
    loading || recovering || status === 'submitted' || status === 'streaming';

  async function recoverHistory() {
    const id = conversationRef.current;
    if (!id) return;
    try {
      const response = await fetch(`/agent-api/assistant/conversations/${id}`, {
        headers: authHeaders,
      });
      if (!response.ok) throw new Error('Unable to load conversation history.');
      const history: ConversationHistory = conversationHistorySchema.parse(
        await response.json(),
      );
      if (conversationRef.current !== id) return;
      setMessages(history.messages);
      setApprovalStates(
        Object.fromEntries(
          history.approvals.map((approval) => [
            approval.confirmationId,
            approval.status,
          ]),
        ),
      );
      setRecovering(history.active);
      setHistoryError('');
    } catch (error) {
      if (conversationRef.current !== id) return;
      setHistoryError(
        error instanceof Error ? error.message : 'Unable to load history.',
      );
    } finally {
      if (conversationRef.current === id) setLoading(false);
    }
  }

  useEffect(() => {
    void recoverHistory();
  }, []);
  useEffect(() => {
    if (!recovering) return;
    const timer = setInterval(() => {
      void recoverHistory();
    }, 2_000);
    return () => clearInterval(timer);
  }, [recovering]);

  async function ensureConversation() {
    if (conversationRef.current) return conversationRef.current;
    creating.current ??= (async () => {
      const response = await fetch('/agent-api/assistant/conversations', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Unable to create conversation.');
      const { id } = (await response.json()) as { id: string };
      conversationRef.current = id;
      setConversationId(id);
      localStorage.setItem('conversationId', id);
      return id;
    })();
    try {
      return await creating.current;
    } finally {
      creating.current = null;
    }
  }

  async function confirmAddressChange(proposal: {
    confirmationId: string;
    orderId: string;
    address: string;
  }) {
    setConfirming(proposal.confirmationId);
    setConfirmationError('');
    try {
      const response = await fetch(
        `/agent-api/assistant/conversations/${conversationRef.current}/approvals/${encodeURIComponent(proposal.confirmationId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_DEMO_CUSTOMER_TOKEN ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requestId: proposal.confirmationId }),
        },
      );
      if (!response.ok)
        throw new Error(
          'Unable to confirm this change. It may have expired; ask for a new proposal.',
        );
      await recoverHistory();
    } catch (error) {
      setConfirmationError(
        error instanceof Error
          ? error.message
          : 'Unable to confirm the address change.',
      );
    } finally {
      setConfirming(null);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isBusy || confirming !== null) return;

    setInput('');
    setActivity('thinking');
    clearError();
    setLoading(true);
    try {
      await ensureConversation();
      setLoading(false);
      await sendMessage({ text });
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : 'Unable to send message.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="chat-panel" aria-label="Chat with the assistant">
        <header className="chat-header">
          <div className="brand-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-copy">
            <p className="eyebrow">Cat Supplies Store</p>
            <h1>Assistant</h1>
          </div>
          <div className="header-actions">
            <span className="model-label">AI Assistant</span>
            <button
              className="clear-button"
              type="button"
              onClick={() => {
                conversationRef.current = null;
                setConversationId(null);
                localStorage.removeItem('conversationId');
                setRecovering(false);
                setHistoryError('');
                setMessages([]);
                clearError();
                setApprovalStates({});
                setActivity(null);
                setConfirmationError('');
              }}
              disabled={isBusy || confirming !== null}
            >
              New chat
            </button>
          </div>
        </header>

        {recovering && (
          <p role="status">
            The server is completing your request. Recovering history…
          </p>
        )}
        {historyError && (
          <div role="alert">
            {historyError}{' '}
            <button onClick={() => void recoverHistory()}>
              Reload history
            </button>
          </div>
        )}
        <div
          className="conversation"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {messages.length === 0 ? (
            <div className="welcome-state">
              <div className="welcome-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p className="eyebrow">Ready when you are</p>
              <h2>What would you like to explore?</h2>
              <p>
                Ask a question, brainstorm an idea, or work through a problem.
              </p>
              <div className="suggestions" aria-label="Suggested prompts">
                <button
                  type="button"
                  onClick={() => setInput('Explain a complex idea simply')}
                >
                  Explain something simply
                </button>
                <button
                  type="button"
                  onClick={() => setInput('Help me plan a project')}
                >
                  Help me plan a project
                </button>
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => {
                const text = message.parts
                  .filter((part) => part.type === 'text')
                  .map((part) => (part.type === 'text' ? part.text : ''))
                  .join('');
                if (
                  !text &&
                  !message.parts.some(
                    (part) => part.type === 'data-address-approval',
                  )
                )
                  return null;

                return (
                  <article
                    className={`message message-${message.role}`}
                    key={message.id}
                  >
                    <div className="message-avatar" aria-hidden="true">
                      {message.role === 'user' ? 'Y' : 'AI'}
                    </div>
                    <div className="message-content">
                      <p className="message-author">
                        {message.role === 'user' ? 'You' : 'Assistant'}
                      </p>
                      <p className="message-text">{text}</p>
                      {message.role === 'assistant' &&
                        message.parts.map((part, index) => {
                          if (part.type !== 'data-address-approval')
                            return null;
                          const parsed = addressApprovalSchema.safeParse(
                            part.data,
                          );
                          if (!parsed.success) return null;
                          const proposal = parsed.data;
                          const approvalState =
                            approvalStates[proposal.confirmationId] ??
                            'pending';
                          const approved = approvalState === 'completed';
                          return (
                            <div key={`${proposal.confirmationId}-${index}`}>
                              <p>
                                Change delivery address for order{' '}
                                <strong>{proposal.orderId}</strong> to{' '}
                                <strong>{proposal.address}</strong>?
                              </p>
                              <p>
                                Confirmation expires at{' '}
                                {new Date(
                                  proposal.expiresAt,
                                ).toLocaleTimeString()}
                                .
                              </p>
                              <button
                                type="button"
                                disabled={
                                  isBusy ||
                                  confirming !== null ||
                                  approvalState !== 'pending' ||
                                  Date.parse(proposal.expiresAt) <= Date.now()
                                }
                                onClick={() =>
                                  void confirmAddressChange(proposal)
                                }
                              >
                                {approved
                                  ? 'Address changed'
                                  : approvalState !== 'pending'
                                    ? 'Check order before retrying'
                                    : 'Confirm address change'}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </article>
                );
              })}
              {(status === 'submitted' || status === 'streaming') && (
                <div className="typing-indicator" role="status">
                  <span className="typing-dot" aria-hidden="true" />
                  <span className="typing-dot" aria-hidden="true" />
                  <span className="typing-dot" aria-hidden="true" />
                  <span className="activity-label">
                    {chatActivityLabels[activity ?? 'thinking']}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="composer-area">
          {confirmationError && (
            <div className="error-banner" role="alert">
              {confirmationError}
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <span>
                {error.message || 'Something went wrong. Please try again.'}
              </span>
              <button
                type="button"
                onClick={clearError}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}
          <form className="composer" onSubmit={submitMessage}>
            <label className="sr-only" htmlFor="message-input">
              Message
            </label>
            <textarea
              id="message-input"
              placeholder="Message the assistant..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              maxLength={4_000}
            />
            {status === 'submitted' || status === 'streaming' ? (
              <button
                className="send-button stop-button"
                type="button"
                onClick={() => {
                  void stop().then(recoverHistory);
                }}
                aria-label="Stop receiving response"
              >
                <span className="stop-icon" />
              </button>
            ) : (
              <button
                className="send-button"
                type="submit"
                disabled={
                  !input.trim() ||
                  confirming !== null ||
                  isBusy ||
                  Boolean(historyError)
                }
                aria-label="Send message"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3.2 9.4 16.7 3.7l-5.8 13.1-1.4-5.7-6.3-1.7Z" />
                  <path d="m9.5 11.1 4.2-4.2" />
                </svg>
              </button>
            )}
          </form>
          <p className="composer-hint">
            Enter to send · Shift + Enter for a new line
          </p>
        </footer>
      </section>
    </main>
  );
}
