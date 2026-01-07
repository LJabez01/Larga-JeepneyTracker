// Admin dashboard logic wired to Supabase
// Requires supabaseClient.js to be loaded as a module on this page.

import { supabase } from './supabaseClient.js';

let currentAdmin = null;
let allUsers = [];

function getAvatarInitial(name, email) {
  const base = (name && name.trim()) || (email && email.trim()) || '?';
  return base.charAt(0).toUpperCase();
}

function humanRole(role) {
  if (!role) return 'Unknown';
  const r = String(role).toLowerCase();
  if (r === 'driver') return 'Driver';
  if (r === 'commuter') return 'Commuter';
  if (r === 'admin') return 'Admin';
  return role;
}

function idStatusBadge(isVerified) {
  if (isVerified === true) return '<span class="badge badge-verified">Verified</span>';
  return '<span class="badge badge-pending">Pending</span>';
}

function userStatusBadge(isActive) {
  if (isActive === false) return '<span class="badge badge-offline">Inactive</span>';
  return '<span class="badge badge-online">Active</span>';
}

async function ensureAdminSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[admin] getSession error:', error.message);
  }
  const session = data && data.session;
  if (!session || !session.user) {
    // Dev mode: no session, but keep page open (read-only UI)
    console.warn('[admin] No active session; running dashboard in guest mode.');
    return null;
  }
  // Build a lightweight profile from the auth session instead
  const user = session.user;
  const storedRole = (typeof window !== 'undefined' && window.sessionStorage)
    ? window.sessionStorage.getItem('userRole')
    : null;

  currentAdmin = {
    id: user.id,
    email: user.email || '',
    full_name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email || '',
    role: storedRole || 'commuter',
    is_active: true,
    is_verified: true,
  };

  // NOTE (dev mode): we do NOT enforce role === 'admin' here.
  // Any logged-in user can access admin.html while you are developing.

  try {
    const headerTitle = document.querySelector('.header-brand h1');
    const headerSub = document.querySelector('.header-brand p');
    if (headerTitle) headerTitle.textContent = 'Admin Panel';
    if (headerSub && currentAdmin.full_name) {
      headerSub.textContent = 'Welcome, ' + currentAdmin.full_name;
    }
  } catch (e) {
    console.warn('[admin] Failed to update header brand text:', e);
  }

  const logoutLink = document.querySelector('.header-logout');
  if (logoutLink) {
    logoutLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.error('[admin] signOut error:', signOutErr.message);
      } finally {
        window.location.href = 'Log-in.html';
      }
    });
  }

  return currentAdmin;
}

async function fetchAllUsers() {
  const { data, error } = await supabase
    .from('profiles')
    // Use only columns that exist in your live Supabase table
    // (username instead of full_name, etc.)
    .select('id, email, username, role, is_active, is_verified')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[admin] Failed to load users from profiles (likely RLS):', error.message);
    // Dev fallback: show just the current logged-in user if available
    allUsers = currentAdmin ? [currentAdmin] : [];
    return allUsers;
  }

  allUsers = Array.isArray(data) ? data : [];
  return allUsers;
}

function updateDashboardStats(users) {
  const totalUsersEl = document.getElementById('statTotalUsers');
  const activeNowEl = document.getElementById('statActiveNow');
  const pendingIdsEl = document.getElementById('statPendingIds');
  const verifiedIdsEl = document.getElementById('statVerifiedIds');

  const total = users.length;
  const activeCount = users.filter(u => u.is_active !== false).length;
  const verifiedCount = users.filter(u => u.is_verified === true).length;
  const pendingCount = users.filter(u => u.is_verified !== true).length;

  if (totalUsersEl) totalUsersEl.textContent = total;
  if (activeNowEl) activeNowEl.textContent = activeCount;
  if (pendingIdsEl) pendingIdsEl.textContent = pendingCount;
  if (verifiedIdsEl) verifiedIdsEl.textContent = verifiedCount;
}

function renderUsersTable(users) {
  const tbody = document.querySelector('.data-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!users.length) {
    const tr = document.createElement('tr');
    tr.className = 'user-row-placeholder';
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'No users found.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  users.forEach(user => {
    const tr = document.createElement('tr');
    tr.className = 'user-row';
    tr.dataset.userId = user.id;

    const name = user.full_name || user.username || user.email || '(no name)';
    const email = user.email || '';
    const roleText = humanRole(user.role);
    const avatarInitial = getAvatarInitial(user.full_name || user.username, user.email);

    const userInfoTd = document.createElement('td');
    userInfoTd.innerHTML = `
      <div class="user-cell">
        <div class="user-avatar">${avatarInitial}</div>
        <div class="user-details">
          <div class="user-name">${name}</div>
          <div class="user-email">${email}</div>
        </div>
      </div>`;

    const typeTd = document.createElement('td');
    const typeClass = roleText === 'Driver' ? 'badge-driver' : (roleText === 'Commuter' ? 'badge-commuter' : '');
    typeTd.innerHTML = `<span class="badge ${typeClass}">${roleText}</span>`;

    const statusTd = document.createElement('td');
    statusTd.innerHTML = userStatusBadge(user.is_active);

    const idStatusTd = document.createElement('td');
    idStatusTd.innerHTML = idStatusBadge(user.is_verified);

    const actionsTd = document.createElement('td');
    actionsTd.innerHTML = `
      <div class="action-group">
        <button class="btn-icon btn-view" title="View" data-action="view" data-user-id="${user.id}"><i class="bi bi-eye-fill"></i></button>
        <button class="btn-icon btn-verify" title="Approve ID" data-action="approve" data-user-id="${user.id}"><i class="bi bi-shield-check"></i></button>
        <button class="btn-icon btn-delete" title="Delete (not implemented)" data-action="delete" data-user-id="${user.id}"><i class="bi bi-trash-fill"></i></button>
      </div>`;

    tr.appendChild(userInfoTd);
    tr.appendChild(typeTd);
    tr.appendChild(statusTd);
    tr.appendChild(idStatusTd);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

async function updateVerification(userId, isVerified) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_verified: isVerified })
    .eq('id', userId);

  if (error) {
    console.error('[admin] Failed to update verification status:', error.message);
    alert('Failed to update verification status: ' + error.message);
    return false;
  }

  allUsers = allUsers.map(u => (u.id === userId ? { ...u, is_verified: isVerified } : u));
  updateDashboardStats(allUsers);
  renderUsersTable(allUsers);
  renderPendingIds(allUsers);
  renderValidIds(allUsers);
  return true;
}

function renderPendingIds(users) {
  const container = document.getElementById('pendingIdsContainer');
  if (!container) return;

  container.innerHTML = '';
  const pending = users.filter(u => u.is_verified !== true);

  if (!pending.length) {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.textContent = 'No pending ID verifications.';
    container.appendChild(div);
    return;
  }

  pending.forEach(user => {
    const card = document.createElement('div');
    card.className = 'verify-card';

    const avatarInitial = getAvatarInitial(user.full_name, user.email);
    const name = user.full_name || user.email || '(no name)';
    const email = user.email || '';

    card.innerHTML = `
      <div class="verify-card-header">
        <div class="verify-user">
          <div class="verify-avatar">${avatarInitial}</div>
          <div>
            <div class="verify-name">${name}</div>
            <div class="verify-email">${email}</div>
          </div>
        </div>
        <span class="time-badge">Pending</span>
      </div>
      <div class="verify-card-body">
        <div class="id-info">
          <div class="info-item">
            <span class="label">Role:</span>
            <span class="value">${humanRole(user.role)}</span>
          </div>
          <div class="info-item">
            <span class="label">Account Status:</span>
            <span class="value">${user.is_active === false ? 'Inactive' : 'Active'}</span>
          </div>
        </div>
        <div class="id-preview">
          <i class="bi bi-card-image"></i>
          <p>Document metadata stored in Supabase</p>
        </div>
      </div>
      <div class="verify-card-footer">
        <button class="btn-approve" data-action="approve" data-user-id="${user.id}">
          <i class="bi bi-check-circle-fill"></i>
          Approve
        </button>
        <button class="btn-reject" data-action="reject" data-user-id="${user.id}">
          <i class="bi bi-x-circle-fill"></i>
          Reject
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

function renderValidIds(users) {
  const container = document.getElementById('validIdsContainer');
  if (!container) return;

  container.innerHTML = '';
  const verified = users.filter(u => u.is_verified === true);

  if (!verified.length) {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.textContent = 'No verified IDs yet.';
    container.appendChild(div);
    return;
  }

  verified.forEach(user => {
    const card = document.createElement('div');
    card.className = 'valid-id-card';

    const avatarInitial = getAvatarInitial(user.full_name, user.email);
    const name = user.full_name || user.email || '(no name)';
    const email = user.email || '';

    card.innerHTML = `
      <div class="valid-id-header">
        <div class="valid-id-user">
          <div class="valid-id-avatar">${avatarInitial}</div>
          <div>
            <div class="valid-id-name">${name}</div>
            <div class="valid-id-email">${email}</div>
          </div>
        </div>
        <span class="valid-badge">6 Verified</span>
      </div>
      <div class="valid-id-body">
        <div class="id-info">
          <div class="info-item">
            <span class="label">Role:</span>
            <span class="value">${humanRole(user.role)}</span>
          </div>
          <div class="info-item">
            <span class="label">Account Status:</span>
            <span class="value">${user.is_active === false ? 'Inactive' : 'Active'}</span>
          </div>
        </div>
      </div>
      <div class="valid-id-footer">
        <button class="btn-view-id" data-action="view" data-user-id="${user.id}">View Details</button>
        <button class="btn-revoke" data-action="reject" data-user-id="${user.id}">Revoke</button>
      </div>
    `;

    container.appendChild(card);
  });
}

function wireGlobalClickHandlers() {
  document.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const userId = target.dataset.userId;
    if (!userId) return;

    if (action === 'approve') {
      await updateVerification(userId, true);
    } else if (action === 'reject') {
      // For now, treat reject as simply marking not verified.
      const confirmReject = window.confirm('Mark this user\'s ID as not verified?');
      if (!confirmReject) return;
      await updateVerification(userId, false);
    } else if (action === 'view') {
      const user = allUsers.find(u => u.id === userId);
      if (user) {
        alert(`User: ${user.full_name || user.email}\nEmail: ${user.email || 'N/A'}\nRole: ${humanRole(user.role)}\nVerified: ${user.is_verified ? 'Yes' : 'No'}`);
      }
    } else if (action === 'delete') {
      alert('User deletion is not implemented yet.');
    }
  });
}

async function initAdminDashboard() {
  const adminProfile = await ensureAdminSession();
  if (!adminProfile) return;

  const users = await fetchAllUsers();
  console.log('[admin] users loaded for dashboard:', users);
  console.log('[admin] pending count:', users.filter(u => u.is_verified !== true).length);
  console.log('[admin] verified count:', users.filter(u => u.is_verified === true).length);
  updateDashboardStats(users);
  renderUsersTable(users);
  renderPendingIds(users);
  renderValidIds(users);
  wireGlobalClickHandlers();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminDashboard);
} else {
  initAdminDashboard();
}
