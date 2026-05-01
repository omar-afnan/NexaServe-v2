import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import UserSideBar from "../../components/userSideBar";
import ChatBox from "../../components/ChatBox";
import "../CSS/ChatWithBot.css";
import {
  MdOutlineSmartToy,
  MdComputer,
  MdBugReport,
  MdLock,
  MdWifi,
  MdEmail
} from "react-icons/md";

export default function ChatWithBot() {
  const navigate = useNavigate();

  const defaultGreeting = {
    sender: "bot",
    text: "Hi, how can I help with your issue today? Type 'create ticket' if you need to raise a support ticket."
  };

  const [messages, setMessages] = useState([defaultGreeting]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableSubcategories, setAvailableSubcategories] = useState([]);
  const [waitingFor, setWaitingFor] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      alert("Please log in first!");
      navigate("/login");
    }
  }, [navigate]);

  const getStorageKey = useCallback(() => {
    const userName = sessionStorage.getItem("userName");
    const token = sessionStorage.getItem("token");
    const userId = sessionStorage.getItem("userId");

    if (userId && userName) {
      return `chat_history_${userId}_${userName}`;
    }
    if (token) {
      return `chat_history_token_${token.slice(-12)}`; // fallback key when userId is unavailable
    }
    return null;
  }, []);

  useEffect(() => {
    const storageKey = getStorageKey();
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            setMessages(parsed);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to load chat history", e);
      }
    }
  }, [getStorageKey]);

  useEffect(() => {
    const storageKey = getStorageKey();
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (e) {
      console.warn("Failed to save chat history", e);
    }
  }, [messages, getStorageKey]);

  const sendMessage = async (messageText) => {
    if (!messageText || !messageText.trim()) return;

    const UserMessage = messageText.trim();
    const NewMessage = { sender: "user", text: UserMessage };
    setMessages((prev) => [...prev, NewMessage]);
    setInput("");
    setLoading(true);

    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        throw new Error("unauthorized");
      }

      const startTime = Date.now();

      const res = await fetch("http://localhost:5000/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          {
            message: UserMessage
          }
        )
      });

      if (res.status === 401 || res.status === 403) {
        sessionStorage.clear();
        navigate("/login", { state: { reason: "session_expired" } });
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      const elapsed = Date.now() - startTime;
      const minDelay = 1500;
      if (elapsed < minDelay) {
        await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
      }

      setAvailableSubcategories(data.available_subcategories || []);
      setWaitingFor(data.waiting_for || null);

      if (data.ticketId) {
        setAvailableSubcategories([]);
        setWaitingFor(null);
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: `Great! Your support ticket has been created.\n\nTicket Details:\n- Ticket ID: ${data.ticketId}\n- Category: ${data.category}\n- Priority: ${data.priority}\n\nOur support team will contact you soon. You can view your tickets in the "My Tickets" section.`
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: data.reply || "I've processed your request."
          }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Connection error. Please try again."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSelectSubcategory = (subcat) => {
    sendMessage(subcat);
  };

  const handleQuickAction = (message) => {
    setInput(message);
  };

  return (
    <div className="chatLayout">
      <UserSideBar />

      <main className="chatMainContent">
        <div className="chatHeader">
          <div className="chatHeaderContent">
            <div className="chatHeaderIcon">
              <MdOutlineSmartToy size={40} />
            </div>
            <div>
              <h2>Chat with AI Assistant</h2>
              <p>Describe your issue</p>
            </div>
          </div>
        </div>

        <div className="quickActions">
          <h3>Common Issues:</h3>
          <div className="quickActionButtons">
            <button
              className="quickActionButton"
              onClick={() => handleQuickAction("I am having hardware issues")}
            >
              <MdComputer size={20} />
              <span>Hardware Problem</span>
            </button>
            <button
              className="quickActionButton"
              onClick={() => handleQuickAction("I am having software issues")}
            >
              <MdBugReport size={20} />
              <span>Software Issue</span>
            </button>
            <button
              className="quickActionButton"
              onClick={() => handleQuickAction("I forgot my password")}
            >
              <MdLock size={20} />
              <span>Password Reset</span>
            </button>
            <button
              className="quickActionButton"
              onClick={() => handleQuickAction("I am having email issues")}
            >
              <MdEmail size={20} />
              <span>Email Problem</span>
            </button>
            <button
              className="quickActionButton"
              onClick={() => handleQuickAction("wifi not working")}
            >
              <MdWifi size={20} />
              <span>Network Issue</span>
            </button>
          </div>
        </div>

        <div className="chatSectionWrapper">
          <ChatBox
            messages={messages}
            input={input}
            loading={loading}
            onChange={(e) => setInput(e.target.value)}
            onSend={handleSend}
            availableSubcategories={availableSubcategories}
            onSelectSubcategory={handleSelectSubcategory}
          />
        </div>


      </main>
    </div>
  );
}
