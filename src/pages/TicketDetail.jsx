import React, { useState, useEffect } from "react";

import { useParams, useNavigate } from "react-router-dom";
import "./CSS/TicketDetail.css";

import {
  MdArrowBack,
  MdDelete,
  MdSend,
  MdComment,
  MdPerson
} from "react-icons/md";

import {
  fetchComments as apiFetchComments,
  addComment as apiAddComment
} from "../api/TicketAPI";

import fetchWithAuth from "../api/fetchWithAuth";

export default function TicketDetail() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [commentsError, setCommentsError] = useState(null);

  // Comments state
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  useEffect(() => {
    fetchTicket();
    loadComments();
  }, [ticketId]);

  const fetchTicket = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetchWithAuth(`http://localhost:5000/tickets/all`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch tickets");
      }

      const tickets = await response.json();
      // ticket_id is a string
      const ticketsFound = tickets.find(t => t.ticket_id === ticketId);

      if (!ticketsFound) {
        throw new Error("Ticket not found");
      }

      setTicket(ticketsFound);
      setLoading(false);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // load comments for the ticket 
  const loadComments = async () => {
    try {
      const data = await apiFetchComments(ticketId);
      setComments(data || []);
    } catch (err) {
      setCommentsError("Unable to load comments. check if the backend is running?");
    }
  };

  
  const handleAddComment = async (e) => {
    e.preventDefault();

    //cant submit emptu comment
    if (!newComment.trim()) {
      return;
    }

    setCommentLoading(true);

    try {
      await apiAddComment(ticketId, newComment);
      setNewComment("");
  
      loadComments();
    } catch (err) {
      alert("Error adding comment: " + (err.message || "Could not reach backend"));
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this ticket?")) {
      return;
    }

    try {
      const token = sessionStorage.getItem('token');
      const response = await fetchWithAuth(`http://localhost:5000/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
      
        const role = sessionStorage.getItem('role');
        if (role === 'admin') {
          navigate('/admin/tickets');
        } else if (role === 'support') {
          navigate('/tickets');
        } else {
          navigate('/user/view-ticket');
        }
      } else {
        alert("Failed to delete ticket");
      }
    } catch (error) {
      alert("Error deleting ticket: " + error.message);
    }
  };

  
  const handleGoBack = () => {
    const role = sessionStorage.getItem('role');
    if (role === 'admin') {
      navigate('/admin/tickets');
    } else if (role === 'support') {
      navigate('/tickets');
    } else {
      navigate('/user/view-ticket');
    }
  };

  if (loading) {
    return (
      <div className="ticketDetailWrapper">
        <div className="loadingContainer">
          <p>Loading ticket</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="ticketDetailWrapper">
        <div className="errorContainer">
          
          <p>Error: {error || "Ticket not found"}</p>

          <button onClick={handleGoBack}>
            Back to Tickets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ticketDetailWrapper">
      <div className="detailHeader">

        <button className="backButton" onClick={handleGoBack}>
          <MdArrowBack size={20} /> Back to Tickets
        </button>

        <button className="deleteTicketButton" onClick={handleDelete}>
          <MdDelete size={20} /> Delete
        </button>
      </div>

      <div className="detailCard">
        <div className="detailTitle">
          <div>
            <h1>{ticket.ticket_id} - {ticket.title}</h1>
            <div className="titleMeta">

              <span className={`chip statusChip status-${ticket.status.toLowerCase().replace(' ', '-')}`}>
                {ticket.status}
              </span>
              <span className={`chip priorityChip priority-${ticket.priority.toLowerCase()}`}>
                {ticket.priority}
              </span>

              <span className="chip subtle">
                Created {new Date(ticket.created_at).toLocaleDateString()}
              </span>

              <span className="chip subtle">
                User ID: {ticket.created_by}
              </span>
            </div>
          </div>
        </div>

        <div className="detailContent">
          <div className="detailSection">
            <h3>Description</h3>
            <p>{ticket.description}</p>
          </div>

          <div className="detailGrid">
            <div className="detailItem">
              <label>Category</label>
              <p>{ticket.category}</p>
            </div>
            <div className="detailItem">
              <label>Priority</label>
              <p className={`priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</p>
            </div>
            <div className="detailItem">
              <label>Status</label>
              <p className={`status-${ticket.status.toLowerCase().replace(' ', '-')}`}>{ticket.status}</p>
            </div>
            <div className="detailItem">
              <label>Created</label>
              <p>{new Date(ticket.created_at).toLocaleDateString()}</p>
            </div>
            <div className="detailItem">
              <label>Created By</label>
              <p>User ID: {ticket.created_by}</p>
            </div>
            {ticket.assigned_to && (
              <div className="detailItem">
                <label>Assigned To</label>
                <p>User ID: {ticket.assigned_to}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* comments */}
      <div className="commentsSection">

        <div className="commentsHeader">

          <MdComment size={24} />
          <h2>Comments and History</h2>

          <span className="commentCount">
            {comments.length}
          </span>

        </div>

        {/*  comment for admin and supporter role */}
        {(sessionStorage.getItem('role') === 'admin' || sessionStorage.getItem('role') === 'support') && (
          <form className="addCommentForm" onSubmit={handleAddComment}>
            <textarea
              placeholder="Add a comment or update"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={1}
            />
            <button type="submit" disabled={commentLoading || !newComment.trim()}>
              {commentLoading ? (
                "Sending"
              ) : (
                <>
                  <MdSend size={18} />
                  Send
                </>
              )}
            </button>
          </form>
        )}

        {/* show admin and support comment only  */}
        {commentsError && (
          <div className="commentsError" style={
            {
              color: 'crimson',
              padding: '8px 12px'
            }}>
            {commentsError}
          </div>
        )}

        <div className="commentsList">
          {comments.length === 0 ? (
            <div className="noComments">
              <MdComment size={48} />
              {(sessionStorage.getItem('role') === 'admin' || sessionStorage.getItem('role') === 'support') ? (
                <p>No comments yet. Be the first to add one!</p>
              ) : (
                <p>No replies yet. Support will respond soon!</p>
              )}
            </div>
          ) : (
            comments.map((comment) => {
              // it will display the name fallback 
              
              let userLabel;
              let labelClass;

              if (comment.name && comment.name.trim() !== '') {
                userLabel = comment.name;
              } else if (comment.role === 'admin') {
                userLabel = 'Admin';
              } else if (comment.role === 'support') {
                userLabel = 'Support';
              } else if (comment.user_id) {
                userLabel = `User #${comment.user_id}`;
              } else {
                userLabel = 'User';
              }

              if (comment.role === 'admin') {
                labelClass = 'roleAdmin';
              } else if (comment.role === 'support') {
                labelClass = 'roleSupport';
              } else {
                labelClass = 'roleUser';
              }

              return (
                <div key={comment.comment_id} className="commentItem">
                  <div className="commentAvatar">
                    <MdPerson size={24} />
                  </div>
                  <div className="commentContent">
                    <div className="commentMeta">
                      
                      <span className={`commentUser ${labelClass}`}>
                        {userLabel}
                      </span>

                      <span className="commentDate">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>

                    </div>
                    <p className="commentText">
                      {comment.comment}
                    </p>
                  </div>
                </div>

              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

