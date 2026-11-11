import { useState, type FormEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const transport = new DefaultChatTransport({
  api: '/api/assistant/chat',
  headers: {
    Authorization: `Bearer ${import.meta.env.VITE_DEMO_CUSTOMER_TOKEN ?? ''}`,
  },
});

export default function App() {
  const [input, setInput] = useState('');
  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    setMessages,
    clearError,
  } = useChat({ transport });
  const isBusy = status === 'submitted' || status === 'streaming';

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;

    setInput('');
    clearError();
    await sendMessage({ text });
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
            <span className="model-label">GPT-6 Luna</span>
            <button
              className="clear-button"
              type="button"
              onClick={() => {
                setMessages([]);
                clearError();
              }}
              disabled={messages.length === 0 || isBusy}
            >
              New chat
            </button>
          </div>
        </header>

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
                    </div>
                  </article>
                );
              })}
              {status === 'submitted' && (
                <div className="typing-indicator" role="status">
                  <span />
                  <span />
                  <span />
                  <span className="sr-only">Assistant is thinking</span>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="composer-area">
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
            {isBusy ? (
              <button
                className="send-button stop-button"
                type="button"
                onClick={() => void stop()}
                aria-label="Stop response"
              >
                <span className="stop-icon" />
              </button>
            ) : (
              <button
                className="send-button"
                type="submit"
                disabled={!input.trim()}
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
