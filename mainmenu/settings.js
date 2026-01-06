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
    const effectiveEmail = user.email || profile?.email || '';
    emailEl.textContent = effectiveEmail;
  }

  // If auth email and profile email ever drift, quietly sync profile to auth.
  if (profile && user.email && profile.email !== user.email) {
    try {
      await supabase
        .from('profiles')
        .update({ email: user.email })
        .eq('id', user.id);
    } catch (syncErr) {
      console.warn('Failed to sync profile email with auth email:', syncErr.message || syncErr);
    }
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

function setupEmailChange() {
  const btn = document.getElementById('changeEmailBtn');
  const emailEl = document.getElementById('accountEmail');
  if (!btn || !emailEl) return;

  btn.addEventListener('click', async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      const user = data?.user;

      if (error || !user?.id || !user.email) {
        alert('You must be logged in to change your email.');
        return;
      }

      const currentEmail = (emailEl.textContent || user.email || '').trim();
      const input = prompt('Enter new email address:', currentEmail);
      if (input === null) return; // user cancelled

      const newEmail = input.trim();
      if (!newEmail) {
        alert('Email cannot be empty.');
        return;
      }

      // Basic Gmail-style validation to match registration rules
      const gmailPattern = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
      if (!gmailPattern.test(newEmail)) {
        alert('Please enter a valid Gmail address (example@gmail.com).');
        return;
      }

      if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
        return;
      }

      // 1) Request Supabase Auth email change (this may require email verification
      //    before the new email actually becomes active for login).
      const { error: authError } = await supabase.auth.updateUser({ email: newEmail });
      if (authError) {
        const msg = (authError.message || '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('exists')) {
          alert('That email is already in use. Please use a different one.');
        } else {
          console.error('Failed to update auth email:', authError.message);
          alert('Unable to update email right now. Please try again later.');
        }
        return;
      }

      // At this point Supabase has accepted the email-change request, but depending on
      // project security settings the primary login email usually does NOT switch until
      // the user clicks the verification link. To avoid lying in the UI, we:
      //  - do NOT change the displayed email yet
      //  - do NOT touch profiles.email yet
      // The next time the user visits after confirming, loadAccount() will see auth.email
      // updated and will sync profiles.email + the UI automatically.

      alert('We sent a confirmation email to your new address. Please verify it to complete the change. Until then, you can still sign in with your current email.');
    } catch (e) {
      console.error('Unexpected error changing email:', e);
      alert('Unexpected error. Please try again later.');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadAccount();
  setupUsernameChange();
  setupEmailChange();
});

