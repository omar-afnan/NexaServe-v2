import React, { useState, useEffect } from "react";

import { useParams, useNavigate } from "react-router-dom";
import "./CSS/TicketDetail.css";

import {
  MdArrowBack,
  MdDelete,
  MdSend,
  MdComment,
} from "react-icons/md";

import {
  fetchComments as apiFetchComments,
  addComment as apiAddComment
} from "../api/TicketAPI";

import fetchWithAuth from "../api/fetchWithAuth";

const DEFAULT_SOLUTION_PROMPT = 'Please describe your issue in more detail, or type "create ticket" for immediate support.';

export default function TicketDetail() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [status, setStatus] = useState("Open");
  const [solution, setSolution] = useState("");
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
      setStatus(ticketsFound.status || "Open");
      setSolution(
        ticketsFound.solution?.trim() === DEFAULT_SOLUTION_PROMPT
          ? ""
          : (ticketsFound.solution || "")
      );
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

  const handleSaveChanges = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetchWithAuth(`http://localhost:5000/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          solution,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save ticket changes');
      }

      setTicket((prev) => prev ? { ...prev, status, solution } : prev);
    } catch (err) {
      alert("Error saving ticket: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="ticketDetailWrapper">
        <div className="detailInner">
          <div className="loadingContainer">
            <p>Loading ticket</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="ticketDetailWrapper">
        <div className="detailInner">
          <div className="errorContainer">
            <p>Error: {error || "Ticket not found"}</p>
            <button onClick={handleGoBack}>
              Back to Tickets
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canEdit = sessionStorage.getItem('role') === 'admin' || sessionStorage.getItem('role') === 'support';

  return (
    <div className="ticketDetailWrapper">
      <div className="detailInner">
        {/* Back button row */}
        <div className="detailHeader">
          <button className="backButton" onClick={handleGoBack}>
            <MdArrowBack size={18} /> Back to Tickets
          </button>
          <button className="deleteTicketButton" onClick={handleDelete}>
            <MdDelete size={18} /> Delete
          </button>
        </div>

        {/* Two-column layout */}
        <div className="detailTwoCol">

          {/* Left 60% — ticket info */}
          <div className="detailCard">
            <div className="detailCardBody">

              {/* ID + title */}
              <div className="detailTopSection">
                <div className="detailTicketId">#{ticket.ticket_id}</div>
                <h1 className="detailTicketTitle">{ticket.title}</h1>

                {/* Priority + Status badges */}
                <div className="badgeRow">
                  <span className={`chip priorityChip priority-${ticket.priority.toLowerCase()}`}>
                    {ticket.priority}
                  </span>
                  <span className={`chip statusChip status-${status.toLowerCase().replace(' ', '-')}`}>
                    {status}
                  </span>
                </div>
              </div>

              {canEdit && (
                <>
                  <div className="detailDivider" />
                  <div className="tdField">
                    <span className="tdLabel">STATUS</span>
                    <select
                      className="tdStatusSelect"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                </>
              )}

              <div className="detailDivider" />

              {/* Description */}
              <div className="detailSection">
                <div className="detailFieldLabel">Description</div>
                <p className="detailDescText">{ticket.description}</p>
              </div>

              <div className="detailDivider" />

              {/* Category */}
              <div className="detailSection">
                <div className="detailFieldLabel">Category</div>
                <p className="detailFieldValue">{ticket.category}</p>
              </div>

              <div className="detailDivider" />

              {/* Created By */}
              <div className="detailSection">
                <div className="detailFieldLabel">Created By</div>
                <p className="detailFieldValue">User #{ticket.created_by}</p>
              </div>

              {ticket.assigned_to && (
                <>
                  <div className="detailDivider" />
                  <div className="detailSection">
                    <div className="detailFieldLabel">Assigned To</div>
                    <p className="detailFieldValue">User #{ticket.assigned_to}</p>
                  </div>
                </>
              )}

              {canEdit && (
                <>
                  <div className="detailDivider" />

                  {/* Solution textarea */}
                  <div className="detailSection">
                    <div className="detailFieldLabel">Solution / Notes</div>
                    <textarea
                      className="detailTextarea"
                      value={solution}
                      onChange={(e) => setSolution(e.target.value)}
                      rows={4}
                    />
                  </div>

                  {/* Save button aligned right */}
                  <div className="detailSaveRow">
                    <button className="detailSaveBtn" onClick={handleSaveChanges}>Save Changes</button>
                  </div>
                </>
              )}

            </div>
          </div>

          {/* Right 40% — Activity Log */}
          <div className="activityCard">
            <div className="activityCardHeader">
              <h3>
                Activity Log
                <span className="commentCountBadge">{comments.length}</span>
              </h3>
            </div>

            {commentsError && (
              <div className="commentsError">{commentsError}</div>
            )}

            <div className="activityLog">
              {comments.length === 0 ? (
                <div className="noComments">
                  <MdComment size={40} />
                  {canEdit ? (
                    <p>No activity yet. Add a comment below.</p>
                  ) : (
                    <p>No replies yet. Support will respond soon!</p>
                  )}
                </div>
              ) : (
                comments.map((comment) => {
                  let userLabel;
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

                  return (
                    <div key={comment.comment_id} className="activityEntry">
                      <div className="activityEntryLine">
                        <span className="activityEntryActor">{userLabel}</span>
                        <span className="activityEntryAction"> {comment.comment}</span>
                      </div>
                      <span className="activityEntryTime">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add comment form */}
            {canEdit && (
              <form className="addCommentForm" onSubmit={handleAddComment}>
                <textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={1}
                />
                <button type="submit" disabled={commentLoading || !newComment.trim()}>
                  {commentLoading ? "Sending" : <><MdSend size={16} /> Send</>}
                </button>
              </form>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
