export const API_URL = "http://localhost:5000";

export function authHeader() {
  const token = sessionStorage.getItem("token");
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}


async function handleResponse(res) {
  if (res.status === 401 || res.status === 403) {
    sessionStorage.clear();
    // Pass session_expired reason via history state so Login.jsx can read it
    window.history.replaceState({ reason: "session_expired" }, "");
    window.location.href = "/login";
    return;
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    //.catch is a fall back which means if the server will return the html instead of json
    throw new Error(error.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}




export async function fetchMyTickets() {
  const res = await fetch(`${API_URL}/tickets/me`, {
    headers: authHeader(),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function createTicket(ticketData) {
  const response = await fetch(`${API_URL}/tickets`, {
    method: "POST",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(ticketData),
    credentials: 'include'
  });
  return handleResponse(response);
}


export async function addComment(ticketId, comment) {
  const response = await fetch(`${API_URL}/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ comment }),
    credentials: 'include'
  });
  return handleResponse(response);
}


export async function fetchComments(ticketId) {
  const response = await fetch(`${API_URL}/tickets/${ticketId}/comments`, {
    method: "GET",
    headers: authHeader(),
    credentials: 'include'
  });
  return handleResponse(response);
}



export async function fetchAllTickets() {
  const response = await fetch(`${API_URL}/tickets/all`, {
    method: "GET",
    headers: authHeader(),
    credentials: 'include'
  });
  return handleResponse(response);
}


export async function fetchTicketById(ticketId) {
  const response = await fetch(`${API_URL}/tickets/${ticketId}`, {
    method: "GET",
    headers: authHeader(),
    credentials: 'include'
  });
  return handleResponse(response);
}

export async function updateTicket(ticketId, updates) {
  const response = await fetch(`${API_URL}/tickets/${ticketId}`, {
    method: "PUT",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(updates),
    credentials: 'include'
  });
  return handleResponse(response);
}

export async function deleteTicket(ticketId) {
  const response = await fetch(`${API_URL}/tickets/${ticketId}`, {
    method: "DELETE",
    headers: authHeader(),
    credentials: 'include'
  });
  return handleResponse(response);
}
