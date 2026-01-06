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

  const usernameInput = document.querySelector('.username input');
  const emailEl = document.getElementById('accountEmail');

  if (usernameInput) {
    usernameInput.value = profile?.username || '';
  }
  if (emailEl) {
    emailEl.textContent = profile?.email || user.email || '';
  }
}

document.addEventListener('DOMContentLoaded', loadAccount);

