export default function App() {
  return (
    <main className="page">
      <section className="welcome" aria-labelledby="welcome-title">
        <div className="brand-mark" aria-hidden="true">
          AI
        </div>
        <p className="eyebrow">LLM Chatbot</p>
        <h1 id="welcome-title">Your frontend is ready.</h1>
        <p className="description">
          The React app is running. Connect it to the chat API when you’re ready
          to build the conversation experience.
        </p>
      </section>
    </main>
  );
}
