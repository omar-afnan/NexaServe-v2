import React from "react";

function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split('\n');

  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    return (
      <React.Fragment key={i}>
        {rendered}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}
export default function ChatBox(
  {
    messages, input, loading, onChange, onSend, availableSubcategories = [], onSelectSubcategory
  }) {
  const renderedMessages = messages.map((msg, index) => (
    <div key={index} className={`chatBubble ${msg.sender === "user" ? "userMsg" : "botMsg"}`}>
      {msg.sender === "bot" ? renderMarkdown(msg.text) : msg.text}
    </div>
  ));

  return (
    <div className="chatSection">

      <div className="chatMessages">
        {renderedMessages}
      </div>

      {availableSubcategories && availableSubcategories.length > 0 && (
        <div className="subcategoryButtons">
          {availableSubcategories.map((s) => (
            <button key={s} className="subcatBtn" onClick={() => onSelectSubcategory && onSelectSubcategory(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && 
        <div className="typing">
          <span className="dot"></span>

          <span className="dot"></span>

          <span className="dot"></span>
        </div>
      }

      <form className="chatInput" onSubmit={onSend}>
        <input
          type="text"
          value={input}
          
          onChange={onChange}

          placeholder="Describe your issue"
        />

        <button type="submit" disabled={loading}>Send</button>
        
      </form>
    </div>
  );
}

