import { supabase } from '../login/supabaseClient.js';

// PAGE SWITCHING
const menuItems = document.querySelectorAll(".menu-item");
const pages = document.querySelectorAll(".page");

menuItems.forEach(item => {
    item.addEventListener("click", () => {

        menuItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");

        let target = item.getAttribute("data-page");

        pages.forEach(page => {
            page.classList.remove("active");
            if (page.id === target) page.classList.add("active");
        });
    });
});

async function loadAccount() {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  if (error || !user) {
    // Not logged in – send back to login
    window.location.href = '../login/Log-in.html';
    return;
  }

  // Fetch profile row that matches this auth user
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email, username')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.warn('Failed to load profile:', profileError.message);
  }

  const usernameEl = document.getElementById('accountUsername');
  const emailEl = document.getElementById('accountEmail');

  if (usernameEl) {
    usernameEl.textContent = profile?.username || user.user_metadata?.username || '';
  }
  if (emailEl) {
    emailEl.textContent = profile?.email || user.email || '';
  }
}

function setupUsernameChange() {
  const btn = document.getElementById('changeUsernameBtn');
  const usernameEl = document.getElementById('accountUsername');
  if (!btn || !usernameEl) return;

  btn.addEventListener('click', async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      const user = data?.user;

      if (error || !user?.id) {
        alert('You must be logged in to change your username.');
        return;
      }

      const currentUsername = (usernameEl.textContent || '').trim();
      const input = prompt('Enter new username:', currentUsername);
      if (input === null) return; // user cancelled

      const newUsername = input.trim();
      if (!newUsername) {
        alert('Username cannot be empty.');
        return;
      }
      if (newUsername === currentUsername) {
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ username: newUsername })
        .eq('id', user.id);

      if (updateError) {
        if ((updateError.message || '').toLowerCase().includes('duplicate')) {
          alert('That username is already taken. Please choose another.');
        } else {
          console.error('Failed to update username:', updateError.message);
          alert('Unable to update username right now. Please try again later.');
        }
        return;
      }

      // Best-effort: also sync to auth user metadata
      try {
        await supabase.auth.updateUser({ data: { username: newUsername } });
      } catch (e) {
        console.warn('Failed to update auth metadata username:', e);
      }

      usernameEl.textContent = newUsername;
      alert('Username updated successfully.');
    } catch (e) {
      console.error('Unexpected error changing username:', e);
      alert('Unexpected error. Please try again later.');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadAccount();
  setupUsernameChange();
});

